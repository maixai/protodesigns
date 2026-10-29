<script setup lang="ts">
// 账户与安全使用中央模态窗体：一页一个心智对象，子流程留在同一窗体内。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { IdentityVault, PasskeySummary } from '../contracts/generated/identity-vault'
import type { DeviceUnlockCapability } from '../contracts/generated/device-unlock-capability'
import { getDeviceUnlockCapability, getIdentityVault, removePasskey } from '../api/workspace'
import { ACCOUNT_NICKNAME_MAX_LENGTH, accountName, session, updateAccountNickname } from '../auth/session'
import { useI18n } from '../i18n'
import { ACCOUNT_AVATAR_ACCEPT, readAccountAvatar, replaceAccountAvatar } from './account-avatar'
import type { AvatarReadError } from './account-avatar'
import AccountAvatar from './account-avatar.vue'
import DliIcon from './dl-icon.vue'
import AddPasskeyDialog from './add-passkey-dialog.vue'
import RecoveryKeyDialog from './recovery-key-dialog.vue'

type AccountTab = 'account' | 'security'
type SecuritySubview = 'addPasskey' | 'recovery' | null
type SecuritySection = 'passkeys' | 'identity'
type VaultState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; vault: IdentityVault; capability: DeviceUnlockCapability }

const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const copy = computed(() => t.value.workspace.settings)
const profile = computed(() => session.value.profile)
const dialog = ref<HTMLDialogElement | null>(null)
const heading = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const state = ref<VaultState>({ status: 'loading' })
const activeTab = ref<AccountTab>('account')
const subview = ref<SecuritySubview>(null)
const activeSecuritySection = ref<SecuritySection>('passkeys')
const securitySections = ['passkeys', 'identity'] satisfies SecuritySection[]
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarButton = ref<HTMLButtonElement | null>(null)
const isAvatarReading = ref(false)
const profileFeedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)
const isEditingNickname = ref(false)
const nicknameDraft = ref('')
const nicknameInput = ref<HTMLInputElement | null>(null)
const nicknameButton = ref<HTMLButtonElement | null>(null)
const nicknameLength = computed(() => Array.from(nicknameDraft.value.trim()).length)
const isNicknameTooLong = computed(() => nicknameLength.value > ACCOUNT_NICKNAME_MAX_LENGTH)
const nicknameLimitMessage = computed(() => copy.value.nicknameTooLong.replace('{max}', String(ACCOUNT_NICKNAME_MAX_LENGTH)))

async function editNickname(): Promise<void> {
  nicknameDraft.value = accountName.value
  profileFeedback.value = null
  isEditingNickname.value = true
  await nextTick()
  nicknameInput.value?.focus()
  nicknameInput.value?.select()
}

async function finishNicknameEditing(): Promise<void> {
  isEditingNickname.value = false
  await nextTick()
  nicknameButton.value?.focus()
}

async function saveNickname(): Promise<void> {
  const result = updateAccountNickname(nicknameDraft.value)
  if (!result.ok) {
    profileFeedback.value = { kind: 'error', message: result.error === 'length' ? nicknameLimitMessage.value : copy.value.nicknameSaveError }
    nicknameInput.value?.focus()
    return
  }
  profileFeedback.value = { kind: 'success', message: nicknameDraft.value.trim() === '' ? copy.value.nicknameReset : copy.value.nicknameUpdated }
  await finishNicknameEditing()
}

function onNicknameKeydown(event: KeyboardEvent): void {
  // 中文输入法确认候选字时不提交；提交只处理编辑框自身的 Enter。
  if (event.key !== 'Enter' || event.isComposing) return
  event.preventDefault()
  if (!isNicknameTooLong.value) void saveNickname()
}
const tabs = ['account', 'security'] satisfies AccountTab[]
const lifetime = { isAlive: true }

const addButton = ref<HTMLButtonElement | null>(null)
const recoveryButton = ref<HTMLButtonElement | null>(null)
const busy = ref(false)
const actionError = ref('')
const notice = ref('')
const menuId = ref('')
const menuReturn = ref<HTMLButtonElement | null>(null)
const removeReturn = ref<HTMLButtonElement | null>(null)
const removeTarget = ref<PasskeySummary | null>(null)
const removeDialog = ref<HTMLDialogElement | null>(null)
const removeCancel = ref<HTMLButtonElement | null>(null)

const sortedPasskeys = computed(() => {
  if (state.value.status !== 'ready') return []
  return [...state.value.vault.passkeys].sort((a, b) =>
    Number(b.isThisDevice) - Number(a.isThisDevice)
    || Number(b.canUnlock) - Number(a.canUnlock)
    || b.lastUsedAt.localeCompare(a.lastUsedAt)
    || b.createdAt.localeCompare(a.createdAt))
})
const removalBlocked = computed(() => {
  const target = removeTarget.value
  if (target === null || state.value.status !== 'ready') return false
  const vault = state.value.vault
  return target.canUnlock && !vault.passkeys.some((passkey) => passkey.id !== target.id && passkey.canUnlock) && !vault.recoveryKeyConfigured
})
const removalWarnsRecoveryOnly = computed(() => {
  const target = removeTarget.value
  if (target === null || state.value.status !== 'ready') return false
  const vault = state.value.vault
  return target.canUnlock && !vault.passkeys.some((passkey) => passkey.id !== target.id && passkey.canUnlock) && vault.recoveryKeyConfigured
})

async function load(): Promise<void> {
  state.value = { status: 'loading' }
  const [vaultResult, capabilityResult] = await Promise.all([getIdentityVault(), getDeviceUnlockCapability()])
  if (!lifetime.isAlive) return
  state.value = vaultResult.ok && capabilityResult.ok
    ? { status: 'ready', vault: vaultResult.value, capability: capabilityResult.value }
    : { status: 'error' }
}

function updateVault(vault: IdentityVault): void {
  if (state.value.status === 'ready') state.value.vault = vault
}

function formatDate(value: string, includeTime: boolean): string {
  const date = new Date(value)
  if (value === '' || Number.isNaN(date.getTime())) return copy.value.noUnlockRecord
  return new Intl.DateTimeFormat(locale.value, includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date)
}

async function activateTab(tab: AccountTab, focus = false): Promise<void> {
  // 二级流程保留一级 tab 的位置,但在返回前不切换背后的任务上下文。
  if (subview.value !== null || isEditingNickname.value) return
  activeTab.value = tab
  await nextTick()
  if (body.value !== null) body.value.scrollTop = 0
  if (focus) document.getElementById(`workspace-account-tab-${tab}`)?.focus()
}

function onTabKeydown(event: KeyboardEvent): void {
  const current = tabs.indexOf(activeTab.value)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : event.key === 'ArrowRight' ? (current + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : -1
  const tab = tabs[index]
  if (tab === undefined) return
  event.preventDefault()
  void activateTab(tab, true)
}

async function activateSecuritySection(section: SecuritySection, focus = false): Promise<void> {
  if (subview.value !== null) return
  activeSecuritySection.value = section
  await nextTick()
  if (body.value !== null) body.value.scrollTop = 0
  if (focus) document.getElementById(`workspace-account-security-section-tab-${section}`)?.focus()
}

function onSecuritySectionKeydown(event: KeyboardEvent): void {
  const current = securitySections.indexOf(activeSecuritySection.value)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? securitySections.length - 1
    : event.key === 'ArrowRight' ? (current + 1) % securitySections.length
      : event.key === 'ArrowLeft' ? (current + securitySections.length - 1) % securitySections.length : -1
  const section = securitySections[index]
  if (section === undefined) return
  event.preventDefault()
  void activateSecuritySection(section, true)
}

function openAvatarPicker(): void {
  if (!isAvatarReading.value) avatarInput.value?.click()
}

function avatarErrorMessage(error: AvatarReadError): string {
  if (error === 'type') return copy.value.avatarTypeError
  if (error === 'size') return copy.value.avatarSizeError
  return copy.value.avatarReadError
}

async function onAvatarChange(event: Event): Promise<void> {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || isAvatarReading.value) return
  const file = input.files?.[0]
  // 清空值,让同一张图在失败后也能再次选择。
  input.value = ''
  if (file === undefined) return
  isAvatarReading.value = true
  profileFeedback.value = null
  const result = await readAccountAvatar(file)
  if (!lifetime.isAlive) return
  isAvatarReading.value = false
  if (!result.ok) {
    profileFeedback.value = { kind: 'error', message: avatarErrorMessage(result.error) }
    await nextTick()
    avatarButton.value?.focus()
    return
  }
  replaceAccountAvatar(result.value)
  profileFeedback.value = { kind: 'success', message: copy.value.avatarUpdated }
  await nextTick()
  avatarButton.value?.focus()
}

function openAdd(): void {
  actionError.value = ''
  notice.value = ''
  subview.value = 'addPasskey'
}

async function closeAdd(): Promise<void> {
  subview.value = null
  await nextTick()
  addButton.value?.focus()
}

function openRecovery(): void {
  actionError.value = ''
  notice.value = ''
  subview.value = 'recovery'
}

async function closeRecovery(): Promise<void> {
  subview.value = null
  await nextTick()
  recoveryButton.value?.focus()
}

function openMenu(id: string, event: MouseEvent): void {
  if (menuId.value === id) { closeMenu(true); return }
  menuId.value = id
  if (event.currentTarget instanceof HTMLButtonElement) menuReturn.value = event.currentTarget
}

function closeMenu(restore = false): void {
  menuId.value = ''
  if (restore) menuReturn.value?.focus()
}

async function requestRemove(passkey: PasskeySummary): Promise<void> {
  removeReturn.value = menuReturn.value
  closeMenu()
  removeTarget.value = passkey
  await nextTick()
  removeDialog.value?.showModal()
  removeCancel.value?.focus()
}

async function closeRemove(restoreFocus = true): Promise<void> {
  removeDialog.value?.close()
  removeTarget.value = null
  await nextTick()
  if (restoreFocus) removeReturn.value?.focus()
}

function cancelRemove(): void {
  void closeRemove()
}

async function confirmRemove(): Promise<void> {
  const target = removeTarget.value
  if (target === null || removalBlocked.value || busy.value) return
  busy.value = true
  actionError.value = ''
  const result = await removePasskey(target.id)
  busy.value = false
  if (!result.ok) { actionError.value = result.error.message; await closeRemove(false); return }
  updateVault(result.value)
  await closeRemove(false)
  notice.value = `${copy.value.passkeyRemoved}。${copy.value.removeManagerHint}`
  await nextTick()
  addButton.value?.focus()
}

async function copyPublicKey(): Promise<void> {
  if (state.value.status !== 'ready') return
  try {
    await navigator.clipboard.writeText(state.value.vault.fingerprint)
    actionError.value = ''
    notice.value = copy.value.copied
  } catch {
    notice.value = ''
    actionError.value = t.value.workspace.security.copyFailed
  }
}

function onDocumentPointer(event: PointerEvent): void {
  // 行内菜单外的指针操作收起菜单；菜单按钮自身由 click 负责切换。
  if (event.target instanceof Element && event.target.closest('.account-security__menu-wrap') !== null) return
  closeMenu()
}

function onMenuFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(next)) return
  closeMenu()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !event.isComposing && isEditingNickname.value) {
    event.preventDefault()
    event.stopPropagation()
    void finishNicknameEditing()
    return
  }
  if (event.key === 'Escape' && menuId.value !== '') {
    event.preventDefault()
    event.stopPropagation()
    closeMenu(true)
  }
}

function requestClose(): void {
  // 编辑时必须先保存或取消，避免关闭窗体隐式丢弃草稿。
  if (isEditingNickname.value) return
  dialog.value?.close()
  emit('close')
}

function onBackdrop(event: MouseEvent): void {
  if (event.target !== dialog.value || dialog.value === null || removeTarget.value !== null) return
  const rect = dialog.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestClose()
}

onMounted(() => {
  dialog.value?.showModal()
  heading.value?.focus({ preventScroll: true })
  document.addEventListener('pointerdown', onDocumentPointer)
  void load()
})

onBeforeUnmount(() => {
  lifetime.isAlive = false
  document.removeEventListener('pointerdown', onDocumentPointer)
  removeDialog.value?.close()
  dialog.value?.close()
})
</script>

<template>
  <dialog id="workspace-account-security-dialog" ref="dialog" class="account-security dl-scope dl-scope--dark dl-modal-scrim" aria-modal="true" aria-labelledby="workspace-account-security-title" @cancel.prevent="requestClose" @click="onBackdrop" @keydown="onKeydown" @keydown.stop>
    <header class="account-security__header">
      <h2 id="workspace-account-security-title" ref="heading" tabindex="-1">{{ copy.accountSecurity }}</h2>
      <button type="button" class="account-security__close" data-account-security-close :disabled="isEditingNickname" :aria-label="copy.close" @click="requestClose"><DliIcon name="close" /></button>
    </header>

    <div v-if="state.status === 'ready'" class="account-security__tabs" role="tablist" :aria-label="copy.accountTabsLabel" @keydown="onTabKeydown">
      <button v-for="tab in tabs" :id="`workspace-account-tab-${tab}`" :key="tab" type="button" role="tab" :disabled="isEditingNickname || subview !== null" :aria-selected="activeTab === tab" :aria-controls="`workspace-account-panel-${tab}`" :tabindex="activeTab === tab ? 0 : -1" @click="activateTab(tab)">{{ tab === 'account' ? copy.accountTab : copy.identitySecurityTab }}</button>
    </div>

    <div ref="body" class="account-security__body" :aria-busy="state.status === 'loading'">
      <div v-if="state.status === 'loading'" role="status" class="account-security__state"><DliIcon name="sync" size="lg" /><p>{{ copy.loading }}</p></div>
      <div v-else-if="state.status === 'error'" class="account-security__state" data-account-security-error><p role="alert">{{ copy.loadError }}</p><button type="button" class="account-security__button" @click="load">{{ copy.retry }}</button></div>
      <template v-else>
        <p v-if="actionError !== ''" role="alert" class="account-security__error">{{ actionError }}</p>
        <p v-if="notice !== ''" role="status" class="account-security__notice">{{ notice }}</p>

          <section v-show="activeTab === 'account'" id="workspace-account-panel-account" class="account-security__page account-security__page--account" role="tabpanel" aria-labelledby="workspace-account-tab-account" tabindex="0" data-account-profile>
            <div class="account-security__profile-header" data-account-profile-row>
              <button
                type="button" class="account-security__avatar-button" data-avatar-button
                ref="avatarButton"
                :aria-label="copy.changeAvatar" :title="copy.changeAvatar"
                :aria-describedby="profileFeedback !== null ? 'workspace-profile-feedback' : undefined"
                :aria-busy="isAvatarReading" :disabled="isAvatarReading" @click="openAvatarPicker"
              >
                <AccountAvatar size="md" :name="accountName" />
                <span class="account-security__avatar-badge" data-avatar-badge aria-hidden="true"><DliIcon name="pencil" size="sm" /></span>
              </button>
              <div class="account-security__profile-text">
                <form v-if="isEditingNickname" class="account-security__nickname-editor" data-nickname-editor @submit.prevent="saveNickname">
                  <label for="workspace-account-nickname">{{ copy.nickname }}</label>
                  <input id="workspace-account-nickname" ref="nicknameInput" v-model="nicknameDraft" type="text" autocomplete="off" :aria-invalid="isNicknameTooLong" aria-describedby="workspace-nickname-hint workspace-nickname-validation" @keydown="onNicknameKeydown">
                  <p id="workspace-nickname-hint" class="account-security__edit-hint">{{ copy.nicknameHint.replace('{max}', String(ACCOUNT_NICKNAME_MAX_LENGTH)) }}</p>
                  <p id="workspace-nickname-validation" class="account-security__validation" :data-invalid="isNicknameTooLong" aria-live="polite">{{ isNicknameTooLong ? nicknameLimitMessage : `${nicknameLength} / ${ACCOUNT_NICKNAME_MAX_LENGTH}` }}</p>
                  <div class="account-security__nickname-actions">
                    <button type="submit" class="account-security__primary" :disabled="isNicknameTooLong">{{ copy.saveNickname }}</button>
                    <button type="button" @click="finishNicknameEditing">{{ copy.cancel }}</button>
                  </div>
                </form>
                <div v-else class="account-security__name-line">
                  <h3 class="account-security__name">{{ accountName }}</h3>
                  <button ref="nicknameButton" type="button" class="account-security__icon-button account-security__edit-nickname" data-edit-nickname :aria-label="copy.editNickname" :title="copy.editNickname" @click="editNickname"><DliIcon name="pencil" size="sm" /></button>
                </div>
                <p class="account-security__email">{{ profile?.email }}</p>
              </div>
            </div>
            <p v-if="profileFeedback !== null" id="workspace-profile-feedback" class="account-security__avatar-feedback" :data-tone="profileFeedback.kind" :role="profileFeedback.kind === 'error' ? 'alert' : 'status'" data-avatar-feedback data-profile-feedback>{{ profileFeedback.message }}</p>
            <input ref="avatarInput" class="account-security__avatar-input" data-avatar-input type="file" :accept="ACCOUNT_AVATAR_ACCEPT" @change="onAvatarChange">
          </section>

          <section v-show="activeTab === 'security'" id="workspace-account-panel-security" class="account-security__page account-security__page--security" role="tabpanel" aria-labelledby="workspace-account-tab-security" tabindex="0">
            <div class="account-security__subtabs model-subtabs">
              <div class="account-security__subtabs-track model-subtabs__track" role="tablist" :aria-label="copy.securitySectionsLabel" @keydown.stop="onSecuritySectionKeydown">
                <button
                  v-for="section in securitySections" :id="`workspace-account-security-section-tab-${section}`" :key="section"
                  type="button" role="tab" :disabled="subview !== null" :aria-selected="activeSecuritySection === section"
                  :aria-controls="`workspace-account-security-section-panel-${section}`" :tabindex="activeSecuritySection === section ? 0 : -1"
                  @click="activateSecuritySection(section)"
                >{{ copy.securitySections[section] }}</button>
              </div>
            </div>
            <section v-show="activeSecuritySection === 'passkeys'" id="workspace-account-security-section-panel-passkeys" class="account-security__section" role="tabpanel" aria-labelledby="workspace-account-security-section-tab-passkeys" tabindex="0">
              <AddPasskeyDialog v-if="subview === 'addPasskey'" :open="true" :capability="state.capability" @close="closeAdd" @updated="updateVault" />
              <RecoveryKeyDialog v-else-if="subview === 'recovery'" :open="true" :configured="state.vault.recoveryKeyConfigured" @close="closeRecovery" @updated="updateVault" />
              <div v-show="subview === null" class="account-security__section">
              <header class="account-security__heading">
                <h3 id="settings-passkeys-title">{{ copy.passkeysTitle }} <span class="account-security__count">{{ String(state.vault.passkeys.length).padStart(2, '0') }}</span></h3>
                <button ref="addButton" type="button" class="account-security__button account-security__primary" data-add-passkey @click="openAdd"><DliIcon name="passkey" />{{ copy.addPasskey }}</button>
              </header>
              <p class="account-security__muted">{{ copy.passkeysHint }}</p>
              <p v-if="state.vault.passkeys.length === 0" class="account-security__empty">{{ copy.emptyPasskeys }}</p>
              <ul v-else class="account-security__list" data-settings-passkeys>
                <li v-for="passkey in sortedPasskeys" :key="passkey.id" :data-passkey-id="passkey.id">
                  <DliIcon name="passkey" />
                  <div class="account-security__passkey-body">
                    <div class="account-security__passkey-top"><p class="account-security__passkey-name">{{ passkey.label }}</p>
                      <p class="account-security__chips">
                        <span :data-unlock="passkey.canUnlock">{{ passkey.canUnlock ? copy.canUnlock : copy.loginOnly }}</span>
                        <span>{{ passkey.backupEligible ? copy.synced : copy.localOnly }}</span>
                        <span v-if="passkey.isThisDevice">{{ copy.currentDevice }}</span>
                      </p></div>
                    <p class="account-security__meta"><span>{{ copy.lastUsed }} <time :datetime="passkey.lastUsedAt || undefined">{{ formatDate(passkey.lastUsedAt, true) }}</time></span><span>{{ copy.createdAt }} <time :datetime="passkey.createdAt">{{ formatDate(passkey.createdAt, false) }}</time></span></p>
                    <p v-if="!passkey.canUnlock" class="account-security__muted">{{ copy.loginOnlyHint }}</p>
                  </div>
                  <div class="account-security__menu-wrap" @focusout="onMenuFocusOut">
                    <button type="button" class="account-security__icon-button" :aria-label="copy.passkeyActions.replace('{name}', passkey.label)" :aria-expanded="menuId === passkey.id" :aria-controls="`passkey-menu-${passkey.id}`" @click="openMenu(passkey.id, $event)">⋯</button>
                    <div v-if="menuId === passkey.id" :id="`passkey-menu-${passkey.id}`" class="account-security__menu" role="group" :aria-label="copy.passkeyActions.replace('{name}', passkey.label)">
                      <button type="button" class="account-security__danger" @click="requestRemove(passkey)">{{ copy.removePasskey }}</button>
                    </div>
                  </div>
                </li>
              </ul>

              <section class="account-security__section account-security__recovery" aria-labelledby="settings-recovery-title" data-settings-recovery>
                <header class="account-security__heading"><h3 id="settings-recovery-title">{{ copy.recoveryKey }}</h3><span class="account-security__chip">{{ state.vault.recoveryKeyConfigured ? copy.configured : copy.notConfigured }}</span></header>
                <p class="account-security__muted">{{ copy.recoverySafetyNetHint }}</p>
                <p class="account-security__muted">{{ copy.recoveryHintOnce }}</p>
                <button ref="recoveryButton" type="button" class="account-security__button" data-recovery-generate @click="openRecovery">{{ state.vault.recoveryKeyConfigured ? copy.regenerateRecoveryKey : copy.generateRecoveryKey }}</button>
              </section>
              </div>
            </section>

            <section v-show="activeSecuritySection === 'identity'" id="workspace-account-security-section-panel-identity" class="account-security__identity-group" role="tabpanel" aria-labelledby="workspace-account-security-section-tab-identity" tabindex="0">
              <h3 id="workspace-account-identity-label" class="account-security__group-label">{{ copy.identityGroup }}</h3>
              <dl class="account-security__facts" aria-labelledby="workspace-account-identity-label">
                <div><dt>{{ copy.identityStatus }}</dt><dd>{{ copy.vaultStates[state.vault.state] }}</dd></div>
                <div data-public-key>
                  <dt>{{ copy.publicKey }}</dt>
                  <dd class="account-security__public-key-line">
                    <code class="account-security__fingerprint" data-public-fingerprint :title="state.vault.fingerprint">{{ state.vault.fingerprint }}</code>
                    <span class="account-security__key-version" :title="`${copy.keyVersion} · v${state.vault.keyVersion}`">v{{ state.vault.keyVersion }}</span>
                    <button type="button" class="account-security__icon-button account-security__copy-key" data-copy-public-key :aria-label="copy.copyPublicKey" :title="copy.copyPublicKey" @click="copyPublicKey"><DliIcon name="copy" size="sm" /></button>
                  </dd>
                </div>
                <div><dt>{{ copy.lastUnlockedAt }}</dt><dd><time :datetime="state.vault.lastUnlockedAt || undefined">{{ formatDate(state.vault.lastUnlockedAt, true) }}</time></dd></div>
              </dl>
            </section>
          </section>
      </template>
    </div>

    <dialog v-if="removeTarget !== null && state.status === 'ready'" ref="removeDialog" class="account-security__confirm dl-modal-scrim" aria-modal="true" aria-labelledby="settings-remove-title" @cancel.prevent="cancelRemove" @keydown.stop>
      <h3 id="settings-remove-title">{{ copy.removePasskeyTitle }}</h3>
      <p class="account-security__remove-name">{{ removeTarget.label }}</p>
      <dl class="account-security__safety" data-remove-safety-net>
        <div><dt>{{ copy.currentSafetyNet }}</dt><dd>{{ copy.recoveryKey }} · {{ state.vault.recoveryKeyConfigured ? copy.configured : copy.notConfigured }}</dd></div>
      </dl>
      <p v-if="removalBlocked" role="alert">{{ copy.lastFactorBlocked }}</p>
      <template v-else><p>{{ copy.removePasskeyHint }}</p><p v-if="removalWarnsRecoveryOnly" role="alert">{{ copy.lastPasskeyWarning }}</p></template>
      <div class="account-security__actions"><button ref="removeCancel" type="button" class="account-security__button" @click="cancelRemove">{{ copy.cancel }}</button><button v-if="!removalBlocked" type="button" class="account-security__button account-security__danger" data-remove-passkey-confirm :disabled="busy" @click="confirmRemove">{{ copy.removePasskey }}</button></div>
    </dialog>
  </dialog>
</template>

<style scoped>
.account-security {
  inline-size: min(var(--workspace-settings-dialog-width), calc(100vw - 2 * var(--dl-space-6)));
  max-inline-size: 100%;
  block-size: min(var(--workspace-settings-dialog-max-height), calc(100dvh - 2 * var(--dl-space-6)));
  max-block-size: 100%;
  margin: auto;
  box-sizing: border-box;
  padding: var(--workspace-settings-dialog-padding);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-xl);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font: inherit;
  line-height: var(--dl-line-body);
  text-align: left;
  overflow: hidden;
}
.account-security { color-scheme: dark; }
.account-security[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); animation: account-security-in var(--dl-duration-base) var(--dl-ease-standard); }
.account-security__header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: var(--dl-space-2); min-inline-size: 0; }
h2 { inline-size: fit-content; max-inline-size: 100%; font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
h2:focus-visible { outline: none; box-shadow: none; }
h3 { font-size: var(--dl-font-size-lg); font-weight: 500; line-height: var(--dl-line-snug); }
.account-security__profile-header { display: flex; align-items: center; gap: var(--dl-space-4); padding-block: var(--dl-space-3); }
.account-security__profile-header > div { min-inline-size: 0; }
.account-security__avatar-button { position: relative; flex: none; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding: 0; border: 0; border-radius: var(--dl-radius-pill); background: transparent; cursor: pointer; }
.account-security__avatar-button:hover { background: var(--dl-bg-hover); }
.account-security__avatar-badge { position: absolute; inset-inline-end: calc(-1 * var(--dl-space-1)); inset-block-end: calc(-1 * var(--dl-space-1)); display: grid; place-items: center; inline-size: var(--dl-icon-lg); block-size: var(--dl-icon-lg); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); background: var(--dl-bg-elevated); color: var(--dl-text-primary); opacity: 0; transition: opacity var(--dl-duration-fast) var(--dl-ease-standard); pointer-events: none; }
.account-security__avatar-button:hover .account-security__avatar-badge,
.account-security__avatar-button:focus-visible .account-security__avatar-badge { opacity: 1; }
.account-security__avatar-input { display: none; }
.account-security__avatar-feedback { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.account-security__avatar-feedback[data-tone='success'] { color: var(--dl-success); }
.account-security__avatar-feedback[data-tone='error'] { color: var(--dl-error); }
.account-security__profile-text { flex: 1; display: grid; gap: 0; }
.account-security__name-line { display: flex; align-items: center; gap: var(--dl-space-1) var(--dl-space-3); }
.account-security__name { min-inline-size: 0; overflow-wrap: anywhere; font-size: var(--dl-font-size-xl); font-weight: 500; line-height: var(--dl-line-snug); }
/* 长昵称换行时编辑入口仍靠近首行，不拉到整段中间。 */
.account-security__name-line .account-security__edit-nickname { align-self: flex-start; }
.account-security__edit-nickname { flex: none; border: 0; padding: 0; color: var(--dl-accent); }
.account-security__nickname-editor { min-inline-size: 0; display: grid; gap: var(--dl-space-2); }
.account-security__nickname-editor label { font-size: var(--dl-font-size-sm); color: var(--dl-text-secondary); }
.account-security__nickname-editor input { box-sizing: border-box; inline-size: 100%; min-inline-size: 0; min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); color: var(--dl-text-primary); font: inherit; }
.account-security__nickname-editor input:hover { border-color: var(--dl-border-strong); }
.account-security__nickname-editor input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.account-security__nickname-editor input[aria-invalid='true'] { border-color: var(--dl-error); }
.account-security__edit-hint, .account-security__validation { font-size: var(--dl-font-size-xs); color: var(--dl-text-secondary); }
.account-security__validation[data-invalid='true'] { color: var(--dl-error); }
.account-security__nickname-actions { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); }
.account-security__email, .account-security__mono, time { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.account-security__email { color: var(--dl-text-secondary); }
/* 滚动容器会裁掉外扩焦点环:四周留一档内边距,再用负外边距抵消外部占位,
   按钮与内容左缘的相对位置不变,焦点环获得不被裁切的缓冲。 */
.account-security__tabs { display: flex; flex: none; gap: var(--dl-space-6); border-block-end: var(--dl-border-width) solid var(--dl-border-base); overflow-x: auto; padding: var(--dl-space-1); margin: calc(-1 * var(--dl-space-1)); }
.account-security__tabs button { flex: none; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-1); border: 0; border-block-end: var(--dl-border-width) solid transparent; border-radius: 0; color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); white-space: nowrap; }
.account-security__tabs button:hover { background: transparent; }
.account-security__tabs button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); }
.account-security__tabs button[aria-selected='true'] { border-block-end-color: var(--dl-accent); color: var(--dl-text-primary); }
.account-security__body { flex: 1; min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-1); scrollbar-width: thin; scrollbar-color: var(--dl-border-strong) transparent; }
.account-security__state { display: grid; justify-items: start; gap: var(--dl-space-3); color: var(--dl-text-secondary); }
.account-security__page, .account-security__section { display: flex; flex-direction: column; gap: var(--dl-space-4); }
.account-security__page { gap: var(--dl-space-8); }
.account-security__page--account { gap: var(--dl-space-6); }
.account-security__page--security { gap: var(--dl-space-3); }
.account-security__subtabs { position: sticky; inset-block-start: calc(-1 * var(--dl-space-1)); z-index: var(--dl-z-sticky); min-inline-size: 0; padding-block: var(--dl-space-1); background: var(--dl-bg-elevated); }
.account-security__subtabs-track { display: flex; gap: var(--dl-space-1); min-inline-size: 0; max-inline-size: 100%; padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); overflow-x: auto; }
.account-security__subtabs-track button { display: inline-flex; flex: 1 0 auto; align-items: center; justify-content: center; min-inline-size: 0; min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-1); border: 0; border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; }
.account-security__subtabs-track button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.account-security__subtabs-track button[aria-selected='true'] { background: var(--dl-accent-soft); color: var(--dl-text-primary); }
.account-security [role='tabpanel']:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); border-radius: var(--dl-radius-sm); }
.account-security__identity-group { display: grid; gap: var(--dl-space-3); }
.account-security__group-label { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-weight: 500; letter-spacing: var(--dl-tracking-label); }
/* 共享列轨道保证三条事实同左缘；首基线对齐不受复制按钮触达高度影响。 */
.account-security__facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: var(--dl-space-3); margin: 0; padding-inline: var(--dl-space-4); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-raised); }
.account-security__facts > div { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: baseline; padding-block: var(--dl-space-2); }
.account-security__facts > div + div { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.account-security__facts dd { display: flex; align-items: center; min-block-size: var(--dl-target-size); min-inline-size: 0; font-size: var(--dl-font-size-sm); }
.account-security__safety { display: grid; gap: var(--dl-space-3); margin: 0; }
.account-security__safety > div { display: grid; }
dt { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
dd { margin: 0; overflow-wrap: anywhere; }
.account-security__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-3); }
.account-security__heading h3 { display: flex; align-items: center; gap: var(--dl-space-2); font-size: var(--dl-font-size-lg); }
.account-security__count, .account-security__meta, .account-security__fingerprint { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.account-security__muted, .account-security__meta { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.account-security__list { list-style: none; margin: 0; padding: 0; }
.account-security__list > li { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: flex-start; gap: var(--dl-space-3); padding-block: var(--dl-space-4); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.account-security__list > li > .dl-icon { flex: none; margin-block-start: var(--dl-space-1); color: var(--dl-text-secondary); }
.account-security__passkey-body { min-inline-size: 0; display: grid; gap: var(--dl-space-2); }
.account-security__passkey-name { overflow-wrap: anywhere; }
.account-security__chips { display: flex; flex-wrap: wrap; gap: var(--dl-space-1); }
.account-security__chip, .account-security__chips span { padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.account-security__chips span[data-unlock='true'] { color: var(--dl-success); }
.account-security__meta { display: flex; flex-wrap: wrap; gap: var(--dl-space-1) var(--dl-space-3); }
.account-security__menu-wrap { position: relative; flex: none; }
.account-security__menu { position: absolute; inset-inline-end: 0; inset-block-start: 100%; z-index: var(--dl-z-overlay); inline-size: max-content; max-inline-size: calc(100vw - 2 * var(--dl-space-6)); padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-md); }
button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); min-inline-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); text-align: left; }
button:hover { background: var(--dl-bg-hover); }
button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
button:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); cursor: not-allowed; transform: none; }
.account-security__close { flex: none; padding: 0; }
.account-security__icon-button { padding: 0; }
.account-security__primary { background: var(--dl-accent); border-color: var(--dl-accent); color: var(--dl-text-on-accent); }
.account-security__primary:hover { background: var(--dl-accent-hover); }
.account-security__danger { color: var(--dl-error); }
.account-security__recovery { padding-block-start: var(--dl-space-6); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.account-security__recovery .account-security__button { align-self: flex-start; }
.account-security__public-key-line { display: flex; align-items: center; gap: var(--dl-space-2); min-inline-size: 0; }
.account-security__fingerprint { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-security__key-version { flex: none; color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }
.account-security__copy-key { align-self: center; flex: none; padding: 0; }
.account-security__empty { padding: var(--dl-space-6); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-lg); color: var(--dl-text-secondary); text-align: center; }
.account-security__notice { margin-block-end: var(--dl-space-4); color: var(--dl-success); }
.account-security__error { margin-block-end: var(--dl-space-4); color: var(--dl-error); }
.account-security__confirm { inline-size: min(var(--dl-measure), calc(100vw - 2 * var(--dl-space-6))); max-block-size: calc(100dvh - 2 * var(--dl-space-6)); padding: var(--dl-space-6); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); color: var(--dl-text-primary); font: inherit; line-height: var(--dl-line-body); }
.account-security__confirm[open] { display: grid; gap: var(--dl-space-3); }
.account-security__confirm h3 { font-size: var(--dl-font-size-lg); }
.account-security__confirm p { overflow-wrap: anywhere; }
.account-security__remove-name { font-weight: 500; }
.account-security__safety { padding: var(--dl-space-3); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); }
.account-security__safety > div { grid-template-columns: 1fr; gap: var(--dl-space-1); padding: 0; border: 0; }
.account-security__safety dd { font-size: var(--dl-font-size-sm); }
.account-security__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); }
@keyframes account-security-in { from { opacity: 0; transform: translateY(var(--dl-space-1)) scale(.99); } to { opacity: 1; transform: none; } }
@media (hover: none), (pointer: coarse) {
  .account-security__avatar-badge { opacity: 1; }
}
@media (max-width: 767px) {
  .account-security__list > li { grid-template-columns: auto minmax(0, 1fr); }
  .account-security__menu-wrap { grid-column: 2; justify-self: end; }
}
@media (max-width: 560px) {
  .account-security__profile-header { align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) { .account-security[open] { animation: none; } button:active { transform: none; } }
</style>
