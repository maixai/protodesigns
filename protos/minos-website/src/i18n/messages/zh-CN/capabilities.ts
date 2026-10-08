// 核心能力区块词条(zh-CN):四项,按契约 CapabilityId 索引。
export const capabilities = {
  eyebrow: '核心能力',
  tag: '规格 · 4 项',
  title: '组网该有的样子',
  items: {
    zeroConfig: {
      title: '零配置组网',
      desc: '任意设备加入同一张私有网络;不需要公网 IP、不需要开端口、不需要改防火墙。',
    },
    encryptedDirect: {
      title: '加密直连',
      desc: '设备之间建立加密隧道;优先直连,不经中心节点绕行。',
    },
    identityBoundary: {
      title: '身份即边界',
      desc: '访问控制基于身份而不是 IP 段;谁、哪台设备、能访问什么,策略可读可审。',
    },
    visibility: {
      title: '一处看清整张网',
      desc: '拓扑、在线状态、连接路径与延迟,集中可见。',
    },
  },
}
