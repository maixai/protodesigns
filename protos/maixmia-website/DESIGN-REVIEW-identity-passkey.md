# maixmia 身份与 Passkey 设计评审

- 日期：2026-10-28
- 评审对象：`protodesigns/protos/maixmia-website`（原型 + `contracts/main.tsp`）
- 交付对象：负责 maixmia-website 设计的 Agent
- 文档性质：设计评审与调整建议，不是生产实现任务书

> 原型仍使用 dummy 数据，不要求在原型里实现真实 PRF / WebCrypto / 密码学。
> 本文要求的是：**契约字段、流程状态、文案与交互能够表达正确的设计**，真实密码学由后续生产实现承接。

## 0. 一句话结论

现有设计方向是对的：**一个稳定的身份公钥 + 多把 passkey + Agent 只信任身份公钥**。需要调整的是：

1. 把“passkey 派生密钥直接加密身份私钥”改为“**随机 VK + 每把 passkey 各包一层**”的信封加密；
2. 明确 **passkey 是解锁因子，不是身份密钥**，加 passkey 不改变公钥、不递增 `keyVersion`、不触发 Agent 重新配对；
3. 补齐新设备无本地 passkey 时的 bootstrap 流程（设备转移 / 恢复密钥 / 跨设备认证）；
4. 区分“登录”与“解锁身份”，并处理 PRF 不可用的降级；
5. 修正“Mia 无法读取”这类绝对化文案，写清威胁模型边界。

## 1. 评审结论总表

| # | 现有设计 | 结论 | 需要做什么 |
| --- | --- | --- | --- |
| 1 | 一个用户一个身份密钥对 / 一个公钥 | 保留 | 不要改成“每把 passkey 一个身份” |
| 2 | 一个账户多把 passkey | 保留 | 每把 passkey 各有一份 VK wrapper |
| 3 | 身份私钥加密后存服务器 | 保留 | 改为信封加密，服务器只存不透明密文 |
| 4 | 用 passkey 派生密钥直接加密身份私钥 | 调整 | 派生 KEK，只用来包裹随机 VK |
| 5 | `keyVersion` + reset 后 Agent 重新配对 | 保留 | 明确：加/删 passkey **不**递增 `keyVersion` |
| 6 | `AgentIdentity.publicKey` + `trustState` | 保留 | 补充密钥轮换签名链（可选，见 §4.6） |
| 7 | 一次性配对 + 两端安全码 | 保留 | 不变 |
| 8 | `recoveryKeyConfigured` | 扩展 | 恢复密钥作为独立 wrapper，并补完整流程 |
| 9 | `PasskeySummary.prfSupported` | 扩展 | 增加 `canUnlock` / `backupEligible`，区分登录与解锁 |
| 10 | 文案“Mia 无法读取” | 修正 | 改为“Mia 服务端无法读取；前提是客户端代码未被篡改” |
| 11 | 新设备无 passkey 的路径 | 缺失 | 增加设备转移、恢复密钥、跨设备认证三条路径 |
| 12 | 登录与解锁的概念 | 混合 | 文案与状态分开：登录成功 ≠ 身份已解锁 |
| 13 | 多 persona / 多身份 | 未覆盖 | 可选：根密钥 + 子密钥委托，避免逐个重新配对 |

## 2. 概念模型：三个生命周期必须分开

| 对象 | 生命周期 | 谁信任它 | 变化频率 |
| --- | --- | --- | --- |
| **身份密钥对** | 长期、稳定，只在重置/轮换时变 | Agent 在配对时 pin 住公钥 | 极低 |
| **Passkey** | 每台设备/每个 provider 一把，可随时增删 | 只用于本地解锁身份密钥 | 高 |
| **Agent 信任记录** | 与身份公钥绑定 | 存 `publicKey` / `fingerprint` / `trustState` | 低 |

推论：

- 加一台设备 → 加一把 passkey → **只更新 vault 的 passkey 列表**；
- Agent 侧看到的是同一个身份公钥，**不需要重新配对**；
- 身份密钥泄露/重置 → `keyVersion++`、公钥变 → Agent 进入 `keyChanged`，这时才需要重新配对。

> 当前契约 `contracts/main.tsp:503` 起的 `AgentIdentity` / `PairingSession` / `PasskeySummary` / `IdentityVault` 已经具备这个结构，问题主要在实现语义与流程表达，不在模型方向。

## 3. 目标密钥架构

### 3.1 密钥层级

```text
identity_private_key  ──AES-256-GCM(VK)──▶  enc_identity_key      （服务器）
VK（客户端随机 32 字节）──AES-256-GCM(KEK_i)▶  wrapped_VK_i        （服务器，每把 passkey 一份）
KEK_i = HKDF(PRF_i(salt), info="maixmia/vault/v1")
recovery_key          ──HKDF──▶ KEK_R ──▶ wrapped_VK_R            （服务器）
```

- **VK 必须由客户端独立随机生成**，不能由 passkey 派生。
- 每把 passkey 的 PRF 输出不同，因此每把 passkey 各自派生一个 `KEK_i`，各自包裹同一把 VK。
- 恢复密钥是第三个独立 wrapper，保证“所有 passkey 都丢了”时仍能解出 VK。
- 任何一把 passkey 或恢复密钥都能独立解出 VK；**没有“第一把 passkey”的特殊地位**。

### 3.2 服务器存什么、不存什么

| 数据 | 服务器是否持有 | 说明 |
| --- | --- | --- |
| 身份公钥 / 指纹 / keyVersion | 是 | 公开信息 |
| `enc_identity_key` | 是 | 不透明密文 |
| 每把 passkey 的 `wrapped_VK_i` | 是 | 不透明密文 |
| `recovery_wrapper` | 是 | 不透明密文 |
| VK 明文 | **否** | 只存在于客户端内存 |
| KEK / PRF 输出 | **否** | 只在客户端派生 |
| 身份私钥明文 | **否** | 只在客户端解密后短暂存在 |

### 3.3 密码学细节

- VK：32 字节随机数，`crypto.getRandomValues`。
- KEK：`HKDF-SHA-256(PRF_output, salt, info)`；`salt` 稳定且可存储，例如 `SHA-256("maixmia:vault:v1" || user_id)`。
- 加密：AES-256-GCM 或 XChaCha20-Poly1305；每个密文独立 nonce。
- AAD 绑定 `user_id`、`credential_id`、`key_version`、算法版本，防止密文跨账户/跨凭据调换。
- 身份私钥解密后导入为 **non-extractable CryptoKey** 用于签名；明文只存在于 Web Worker，空闲/关页即锁。
- 身份私钥与其它用途密钥用 HKDF 做域分离，不要一把密钥既签名又加密。

## 4. 关键流程

### 4.1 首次注册

1. 客户端生成身份密钥对（独立随机）。
2. 客户端生成随机 VK。
3. `Enc(VK, identity_sk)`。
4. 创建 Passkey P1（要求 PRF）→ `KEK1` → `Wrap1(VK)`。
5. **立即生成恢复密钥 R**（256-bit 随机、Base32 展示一次）→ `WrapR(VK)`；条件允许再引导注册第二把 passkey。
6. 上传：公钥、`Enc(sk)`、`Wrap1`、`WrapR`、salt、元数据。**VK 和明文私钥永不上传。**
7. 明确告知用户：恢复密钥只显示一次，是最后的救命绳。

> 关键：注册时就把“两个独立解锁因子”建立起来，第一把 passkey 不再是单点。

### 4.2 添加第 2+ 把 passkey（已有任一因子）

1. 在已解锁会话中操作，要求一次**新鲜 UV**（不能只靠会话 Cookie）。
2. 用当前设备上**任意一把可用 passkey**（或恢复密钥）在本地解出 VK。
3. 新 passkey → `PRF → KEK_new` → `Wrap_new(VK)`。
4. 上传新 wrapper。
5. **不改身份公钥、不改 `keyVersion`** → Agent 无需重新配对。
6. 通过独立渠道通知用户“新增了一把 passkey”。

### 4.3 新设备上没有任何本地 passkey

按优先级：

| 优先级 | 路径 | 说明 |
| --- | --- | --- |
| 1 | **同步 passkey** | iCloud 钥匙串 / Google 密码管理器已把 P1 带到新设备，PRF 输出一致，直接解锁 |
| 2 | **跨设备认证（hybrid / QR）** | 用手机上的 passkey 完成 `get()`；部分栈支持 PRF-over-hybrid，不能作为唯一依赖 |
| 3 | **设备转移 / 旧设备批准** | 1Password “Transfer Key”、Bitwarden “Approve from another device” 的成熟模式 |
| 4 | **恢复密钥** | 输入离线恢复密钥 → 解 VK → 注册新 passkey |
| 5 | **账户恢复 / 重置身份** | 以上都没有；最坏情况新密钥 + Agent 重新配对 |

#### 设备转移流程（推荐作为 device-bound 场景的主路径）

```text
新设备                          服务器                          旧设备（已解锁）
  |  生成临时密钥对               |                                |
  |-- 创建转移请求(公钥) -------->|                                |
  |                              |<---- 拉取待批准请求 ------------|
  |                              |      核对短码                   |
  |                              |      本地解出 VK                |
  |                              |<---- 上传 Enc(VK, 临时公钥) ---|
  |<-- 下发密文 -----------------|                                |
  |  解出 VK，注册本地 passkey    |                                |
  |-- 上传新 wrapper ------------>|                                |
```

要点：

- 旧设备全程不需要把 VK 明文交给服务器；服务器只转发密文。
- 新设备生成一次性临时密钥对，短 TTL，用完即弃。
- 两端显示短码/SAS，用户核对，防止中间人替换临时公钥。
- 这条路径不要求旧 passkey 的 PRF 在新设备上可用，只需要**一台已解锁的旧设备**。

### 4.4 删除 / 吊销 passkey

- 删除 passkey = 删除对应 `wrapped_VK_i`，其它 wrapper 不受影响。
- 怀疑某把 passkey 泄露 → 轮换 VK、重新加密身份私钥、为剩余因子重新包裹、作废旧密文。
- 身份密钥本身泄露 → `keyVersion++`、重新生成身份密钥对、所有 Agent 重新配对。

### 4.5 身份密钥轮换

- 由旧身份密钥签名一条轮换声明（新公钥、生效时间、原因）。
- Agent 验证签名链后更新信任记录，并显示 `keyChanged`；无法验证时才要求重新配对。
- 轮换不改变 passkey wrapper（除非同时轮换 VK）。

### 4.6 Agent 配对与签名

- Agent 首次配对时 pin 住身份根公钥；之后只验证该公钥的签名。
- 签名必须**受众绑定**：`sign("maixmia-agent-auth:v1" || agent_id || challenge || timestamp)`，不允许 Agent 请求对任意 payload 签名。
- 加 passkey、换设备、换 provider 不改变根公钥，因此不触发重新配对。
- 当前 `PairingSession` 的一次性秘密 + 两端安全码设计保留，不需要改。

### 4.7 多 persona（可选，第二阶段）

如果“多个身份”指多个 persona，而不是多台设备：

- 使用**根身份密钥 + 每 persona / 每 Agent 的子密钥证书**（scope、audience、有效期、可吊销）。
- Agent 只信任根一次，之后验证子密钥证书即可。
- 这样可以避免“每新增一个身份就重新配对”，同时保留可链接性控制。

## 5. 契约调整建议

### 5.1 UI 可见字段

`PasskeySummary` 建议补充：

```typespec
model PasskeySummary {
  id: string;
  label: string;
  createdAt: utcDateTime;
  lastUsedAt: utcDateTime;
  prfSupported: boolean;   // 该凭据是否支持 PRF
  canUnlock: boolean;      // 是否已建立 wrapper，能用于解锁身份
  backupEligible: boolean; // synced vs device-bound，用于提示
  isThisDevice: boolean;
}
```

`IdentityVault` 建议补充：

```typespec
enum UnlockMethodId { passkey, recoveryKey }

@summary("IdentityVault")
@jsonSchema
model IdentityVault {
  state: VaultStateId;
  publicKey: string;
  fingerprint: string;
  keyVersion: int32;                 // 只随身份密钥轮换递增
  passkeys: PasskeySummary[];
  unlockMethods: UnlockMethodId[];
  recoveryKeyConfigured: boolean;
  lastUnlockedAt: utcDateTime;
}
```

设备能力建议单独建模，避免把“当前浏览器能力”混进 vault：

```typespec
@summary("DeviceUnlockCapability")
@jsonSchema
model DeviceUnlockCapability {
  prfAvailable: boolean;
  localPasskeyCount: int32;
  canUseRecoveryKey: boolean;
  canRequestDeviceTransfer: boolean;
}
```

### 5.2 服务端密钥域（不进 UI 契约）

以下模型只用于服务端 / 密钥域，原型 UI 不渲染、不读取：

```typespec
model VaultKeyEnvelope {
  id: string;
  credentialId: string;
  aaguid: string;
  prfSupported: boolean;
  salt: string;            // base64url，非秘密
  kdf: string;             // "HKDF-SHA-256"
  wrappedVaultKey: string; // base64url，密文
  createdAt: utcDateTime;
  lastUsedAt: utcDateTime;
  revokedAt: utcDateTime;
}
```

### 5.3 新设备转移的 UI 状态

```typespec
enum DeviceTransferStateId { waiting, codeShown, approved, expired, denied, error }

@summary("DeviceTransferSession")
@jsonSchema
model DeviceTransferSession {
  id: string;
  state: DeviceTransferStateId;
  shortCode: string;
  newDeviceName: string;
  platform: string;
  expiresAt: utcDateTime;
  errorCode: string;
}
```

> 注意：`shortCode` 之外的临时公钥/密文属于密钥域，不进入 UI 契约；与现有 `PairingSession` 的“秘密只在链接片段中传递”保持同一原则。

## 6. UX 状态与文案

### 6.1 需要补充的状态

| 状态 | 含义 | 建议 UI |
| --- | --- | --- |
| `locked` | 身份已加密锁定 | 显示解锁入口 |
| `unlocking` | 正在验证/解密 | 显示进行中，不可重复提交 |
| `unlocked` | 身份可用 | 显示指纹、版本、passkey 列表 |
| `prfUnsupported` | 当前 passkey 不支持 PRF | 提示改用恢复密钥或另一台设备 |
| `noLocalFactor` | 本设备无可用因子 | 提供“另一台设备批准 / 恢复密钥” |
| `transferPending` | 等待旧设备批准 | 显示短码与倒计时 |
| `transferExpired` | 转移超时 | 重新生成邀请 |
| `recoveryRequired` | 所有 factor 丢失 | 引导恢复密钥；不可用则走账户恢复 |
| `identityReset` | 身份已重置 | 明确“所有 Agent 需重新配对” |

### 6.2 文案调整

| 场景 | 现在 | 建议 |
| --- | --- | --- |
| 解锁提示 | “用 Passkey 在此设备解密身份密钥” | 保留，并补充“本设备没有 Passkey？可用另一台设备批准或恢复密钥” |
| 添加 Passkey | 无 | “添加 Passkey 只增加一种解锁方式，不会改变你的身份；已配对的 Agent 无需重新配对。” |
| PRF 不支持 | “不支持 PRF” | “这把 Passkey 可以登录，但不能解锁身份密钥。请改用支持 PRF 的 Passkey 或恢复密钥。” |
| 新设备 | 无 | “这台设备还没有 Passkey。用另一台已解锁设备批准，或输入恢复密钥。” |
| 威胁模型 | “Mia 无法读取” | “身份私钥以密文保存在 Mia；在客户端代码未被篡改的前提下，Mia 服务端无法解密。” |
| 恢复密钥 | “已配置 / 未配置” | 补充“只显示一次；丢失且没有其他 Passkey 时，身份将无法恢复。” |
| 重置身份 | 已有“所有 Agent 需逐台重新配对” | 保留，措辞正确 |

## 7. 威胁模型

| 威胁 | 是否防住 | 说明 / 缓解 |
| --- | --- | --- |
| 数据库/备份泄露 | ✅ | 服务器只有不透明密文 |
| 诚实但好奇的服务器运营者 | ✅ | 无 VK / PRF / 明文私钥 |
| 钓鱼 | ✅ | passkey 的 origin 绑定 |
| 撞库 / 凭据填充 | ✅ | 没有可复用的共享秘密 |
| 平台下发恶意 JS | ❌ | 纯 Web 边界；需 CSP、SRI、无第三方脚本、原生客户端 |
| XSS | ❌ | 攻击者可取走密文并触发 PRF；只能靠代码完整性 |
| 恶意浏览器扩展 | ❌ | 同上 |
| 失窃且已解锁的设备 | ❌ | 依赖系统锁屏与短 unlock TTL |
| passkey provider 账户被接管 | ❌ | synced passkey 的信任边界转移到 provider |
| 所有解锁因子丢失 | ⚠️ | 恢复密钥兜底；否则只能重置身份 |
| 服务器回滚/删除密文 | ⚠️ | 版本化、签名记录、备份 |

## 8. 对设计 Agent 的动作清单

- [ ] 在 `contracts/main.tsp` 中补充 `PasskeySummary.canUnlock` / `backupEligible`，扩展 `IdentityVault`，新增 `DeviceUnlockCapability`、`DeviceTransferSession`。
- [ ] 明确 `keyVersion` 语义：只在身份密钥轮换时递增；加/删 passkey 不递增。
- [ ] 在 `src/mocks/identity.ts` / `src/mocks/pairing.ts` 中补对应的 dummy 数据与状态流转。
- [ ] 在 `identity-vault-dialog.vue` 中补充“添加 Passkey”入口与流程。
- [ ] 增加“新设备无本地因子”的分支 UI：同步 passkey / 旧设备批准 / 恢复密钥。
- [ ] 增加 PRF 不支持的降级提示与状态。
- [ ] 更新 `identity-pairing.ts` 文案，明确“加 Passkey 不触发 Agent 重新配对”。
- [ ] 更新威胁模型文案，避免绝对化的“Mia 无法读取”。
- [ ] 保留现有 Agent 配对流程、安全码、`trustState`、reset 后重新配对逻辑，不需要重做。
- [ ] 如果原型需要展示设备转移，只展示状态与短码，不展示任何密钥材料。

## 9. 不需要改的部分

- 一个用户一个稳定的身份公钥，不要改成“每把 passkey 一个身份”。
- Agent 首次配对时 pin 公钥、两端安全码核对。
- `trustState`（`trusted` / `keyChanged` / `revoked`）与 `trustLogIndex` 等信任记录字段。
- 重置身份后所有 Agent 重新配对的语义——这是正确的。
- 原型使用 dummy 数据、刷新即重置的性质。

## 10. 待确认问题

1. MVP 是否接受 synced passkey（信任 iCloud / Google / 第三方 provider）？
2. 是否要求所有用于解锁的 passkey 必须支持 PRF？还是允许“只能登录、不能解锁”的 passkey？
3. 新设备首选路径是“旧设备批准”还是“恢复密钥”？两者都需要，顺序影响 UX。
4. 是否在 MVP 提供原生桌面客户端 / 浏览器扩展的“严格模式”？
5. 多 persona / 不可链接性是否在 roadmap 内？
6. 恢复密钥的格式、展示方式（复制 / 下载 / 打印）与丢失后的账户恢复策略。
7. 是否接受“服务器托管加密私钥”作为消费级方案，还是高保证场景必须本地非导出密钥？
8. 身份密钥轮换是自动触发还是仅手动重置？

## 11. 参考

- [Bitwarden – Passkeys for decryption](https://contributing.bitwarden.com/architecture/deep-dives/passkeys/implementations/relying-party/prf)
- [Bitwarden – Add a Trusted Device](https://bitwarden.com/help/add-a-trusted-device)
- [1Password – Transfer key](https://support.1password.com/sso-linked-apps-browsers)
- [Corbado – Passkeys & WebAuthn PRF (2026)](https://www.corbado.com/blog/passkeys-prf-webauthn)
- [Corbado – WebAuthn Passkey QR Codes & Hybrid Transport](https://www.corbado.com/blog/webauthn-passkey-qr-code)
- [Open Security Architecture – Client-Side Encryption](https://www.opensecurityarchitecture.org/patterns/sp-039)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [FIDO Alliance – Recommended Account Recovery Practices](https://fidoalliance.org/recommended-account-recovery-practices)
