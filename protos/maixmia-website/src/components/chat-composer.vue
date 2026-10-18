<script setup lang="ts">
// 对话输入坞:某一段对话的项目挂耳标签 + 输入框 + 附件区 + 底行(⊕ · 模型/遥测)+ 停止钮 + 错误行 + 「回到底部」。
//
// 它**属于对话窗体本身**(不再属于某个区域),故随窗体走:一段对话被拆出成悬浮窗体、
// 或停靠回条上,输入坞都在它旁边,草稿与附件也一直跟着(runtime.draft / runtime.attachments 是唯一事实源)。
//
// 文本以 runtime.draft 为单一事实源(v-model 回写外层),不依赖 DOM 存活 —— IME 组字期间
// 输入事件会被 inputKeyboard 里的 isComposing 排除,组合结束才提交。
//
// 底行(卡片**内部**最下方)的构图依据:Claude 把模型选择器放进 composer 内右侧、主张「模型与
// 消耗必须在发送前可见」,ChatGPT 放在消息框内右下角 —— 故模型名 / 状态 / context / 时长这组
// **运行时遥测**住在卡片底行右侧,⊕ 在左侧;框架外只留发送错误行。
//
// **归属项目**不是运行时遥测,而是「这份内容属于谁」的身份 —— 故它不混进底行,单独落在卡片
// **外部左上角**成为一枚挂耳标签,用一条引线勾回卡片(见模板里 .composer-project-row 的说明)。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ChatRuntime } from '../data/chat-runtime'
import type { Attachment } from '../contracts/generated/attachment'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, FILE_DRAG_TYPE, shouldTakeOverPaste, toFileAttachment, toImageAttachment, toLocalFileAttachment, toTextAttachment } from '../data/attachments'
import { modelById } from '../data/models'
import { identityClassOf } from '../data/project-identity'
import { fileBaseName } from '../data/windows'
import { viewportRectOf } from '../data/viewport-rect'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import ModelMenu from './model-menu.vue'

const props = defineProps<{
  sessionId: string
  // 会话标题:输入框的可访问名据此生成(读屏要能分辨「在给哪段对话打字」)。
  title: string
  runtime: ChatRuntime
  // 生成 / 保存中(输入框只读,不给改草稿的错觉)。
  disabled: boolean
  canSend: boolean
  isGenerating: boolean
  // 是否承担全页唯一的**状态播报**(见 workspace-page 的 liveSlot 判据):多对话视图并存时
  // 只有 live 那一个的遥测状态项是 live region,避免多个 polite 区域互相打断。
  isLive: boolean
  // 该会话**归属项目**的名称与路径:输入坞上方那枚挂耳标签显示它(与 tab / 侧栏同源,不由遥测
  // 派生 —— 归属是身份,不是运行时信息)。名称走等宽字体(它是文件系统标识、且与 tab 上的等宽
  // 缩写同源),完整路径挂在 title 上(悬停可读)。
  projectName: string
  projectPath: string
  // 空对话(还没有消息)才可改归属:标签此时是一个**控件**(常显 caret + 发丝描边),点开改归属。
  canReassign: boolean
  // 项目选择浮层是否正由该标签打开(供 aria-expanded)。
  reassignPickerOpen: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
  'update:draft': [value: string]
  // 附件增删与模型切换都写回**本会话**的运行态(页面负责 patchRuntime)。
  'add-attachments': [attachments: Attachment[]]
  'remove-attachment': [id: string]
  'update:model': [id: string]
  // 新增 / 移除附件的播报:交给页面**已有的** role="status" 通道(不新造第二条全局 live)。
  announce: [text: string]
  'back-to-bottom': []
  // 改归属:挂耳标签(可改态)被按下,交出它在视口里的矩形(页面据此把项目选择浮层锚到它上面)。
  reassign: [origin: WindowRect]
}>()

const { t } = useI18n()

// 上传选择框接受的类型提示(仅影响文件选择器的默认过滤;真正的校验只有「大小上限」一条)。
const ACCEPT = 'image/*,.txt,.md,.csv,.json,.log,.pdf'

// 输入框的 id / name **按会话唯一** —— 同一 id 不得在 DOM 里出现两次(多区域 / 多窗体同屏时)。
const composerId = computed(() => `workspace-composer-${props.sessionId}`)
// 带会话名的可访问名;无标题(理论上不出现 —— 新会话也有「新建对话」标题)时回落到通用名。
const ariaLabel = computed(() => (props.title === '' ? t.value.workspace.inputLabel : t.value.workspace.inputLabelOf.replace('{name}', props.title)))
const isReadOnly = computed(() => props.disabled || props.runtime.transcript.status === 'loading' || props.runtime.transcript.status === 'error')
// 「回到底部」只在「转录已就绪且用户已上滚」时出现(空 / 加载 / 错误态没有「底部」可言)。
const showBackToBottom = computed(() => !props.runtime.isPinned && props.runtime.transcript.status === 'ready')

// 底行末项(归属项目)的可访问名:空对话时它是控件,读屏必须说清「点它会发生什么」
// —— 与悬浮对话窗标题栏的归属钮用**同一句**(reassignProjectLabel)。
const reassignLabel = computed(() => t.value.workspace.reassignProjectLabel.replace('{name}', props.projectName))

// 挂耳标签的 DOM id:**按会话唯一**(同屏可能有多张输入坞,同一个 id 不得出现两次)。
const projectLabelId = computed(() => `workspace-composer-project-${props.sessionId}`)
// 标签的标识色绑定类(色点用):按**项目路径**取号 —— 与 tab 色条 / 悬浮窗色点是同一套,
// path → 色号的映射稳定,项目重开后颜色不跳变(见 data/project-identity.ts)。
const identityClass = computed(() => identityClassOf(props.projectPath))
// 输入框的 aria-describedby:指向「归属项目」标签 —— 读屏聚焦输入框时也能听出这段对话属于哪个
// 项目(W3C ARIA1 的用途)。用**数组拼装**而非直接赋值:将来再加描述(如附件错误)时往数组里
// 追加即可,不会把已有 id 覆盖掉。注意它只补**描述**,不动输入框的可访问名(那是 aria-label)。
const describedByIds = computed<string[]>(() => (props.projectName === '' ? [] : [projectLabelId.value]))
const describedBy = computed(() => (describedByIds.value.length === 0 ? undefined : describedByIds.value.join(' ')))

// 按下项目控件:只负责交上它在视口里的矩形,浮层开 / 关的裁决归页面(与另外两处触发点同一套)。
function openReassign(event: MouseEvent): void {
  emit('reassign', viewportRectOf(event.currentTarget instanceof Element ? event.currentTarget : null))
}

function onInput(event: Event): void {
  const target = event.target
  if (target instanceof HTMLTextAreaElement) emit('update:draft', target.value)
}

// Enter 发送、Shift+Enter 换行;组字中(IME)不发送。
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  if (props.canSend) emit('send', props.runtime.draft)
}

function submit(): void {
  if (props.canSend) emit('send', props.runtime.draft)
}

// ---- 附件 ----
// 附件是 runtime 的一部分(随会话存活),这里只读它、把增删回写出去。
const attachments = computed(() => props.runtime.attachments)
const formRef = ref<HTMLFormElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
// 图片预览的 objectURL(按附件 id 索引)。它**不是**契约的一部分:契约只描述"有哪些附件",
// 预览是载体现做的视图状态。移除附件与组件卸载时都 revoke。
const previewUrls = ref<Record<string, string>>({})
// 拖拽落点反馈:仅当 dataTransfer 带**本仓自定义类型**(侧栏文件)时点亮,与外部文件拖入区分。
const dropActive = ref(false)
// 上传校验失败的**可见**提示(不静默丢弃)。
const attachmentError = ref('')

// 大小的人类可读写法(等宽数字,列宽不跳动)。
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

// 粘贴文本芯片上的行数:1 行在英文里是单数(「1 line」),故按数量选词条。
function linesLabel(count: number): string {
  const word = count === 1 ? t.value.workspace.composer.linesOne : t.value.workspace.composer.lines
  return word.replace('{count}', String(count))
}

function revoke(id: string): void {
  const url = previewUrls.value[id]
  if (url === undefined) return
  URL.revokeObjectURL(url)
  const next = { ...previewUrls.value }
  delete next[id]
  previewUrls.value = next
}

// 把一批附件写回本会话:守住上限、登记预览、播报。返回实际加入的条数。
function commitAttachments(list: readonly Attachment[], previews: Record<string, string> = {}): number {
  if (list.length === 0) return 0
  const room = MAX_ATTACHMENTS - attachments.value.length
  if (room <= 0) {
    attachmentError.value = t.value.workspace.composer.tooMany.replace('{count}', String(MAX_ATTACHMENTS))
    return 0
  }
  const accepted = list.slice(0, room)
  if (accepted.length < list.length) attachmentError.value = t.value.workspace.composer.tooMany.replace('{count}', String(MAX_ATTACHMENTS))
  else attachmentError.value = ''
  previewUrls.value = { ...previewUrls.value, ...previews }
  emit('add-attachments', accepted)
  emit('announce', t.value.workspace.composer.added.replace('{name}', accepted.map((item) => item.name).join('、')))
  return accepted.length
}

function removeAttachment(id: string): void {
  const removed = attachments.value.find((item) => item.id === id)
  revoke(id)
  attachmentError.value = ''
  emit('remove-attachment', id)
  if (removed !== undefined) emit('announce', t.value.workspace.composer.removed.replace('{name}', removed.name))
}

function openFilePicker(): void {
  if (isReadOnly.value) return
  fileInputRef.value?.click()
}

// 选中本地文件:`+` 上传。图片走 objectURL 缩略图,其余走文件名 + 大小;超限给可见提示。
function onFilesChosen(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const files = Array.from(input.files ?? [])
  // 允许再次选择同一个文件(不重置的话 change 不会再触发)。
  input.value = ''
  addFiles(files)
}

function addFiles(files: readonly File[]): void {
  if (isReadOnly.value || files.length === 0) return
  const accepted: Attachment[] = []
  const previews: Record<string, string> = {}
  let oversize = ''
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      oversize = t.value.workspace.composer.tooLarge.replace('{name}', file.name).replace('{limit}', formatBytes(MAX_ATTACHMENT_BYTES))
      continue
    }
    if (file.type.startsWith('image/')) {
      const attachment = toImageAttachment(file.name, file.type, file.size)
      accepted.push(attachment)
      previews[attachment.id] = URL.createObjectURL(file)
    } else {
      // 浏览器不给本地文件的目录,故没有项目相对路径可填;展示文件名 + 大小。
      accepted.push(toLocalFileAttachment(file.name, file.type, file.size))
    }
  }
  commitAttachments(accepted, previews)
  // 超限是**可见**提示(不静默丢弃);同时播报一次,读屏用户也能知道。
  if (oversize !== '') {
    attachmentError.value = oversize
    emit('announce', oversize)
  }
}

// 粘贴:先看图片(kind === 'file' 且 type 为 image/*),再看文本。
// 只有**完全接管**时才 preventDefault —— 短粘贴不打扰浏览器默认插入。
// 接管的内容一律进附件:图片走缩略图,长文本走「[粘贴文本 · N 行 · M 字符]」芯片且**全文**存进
// 附件的 content(发送时发的是全文,芯片只压缩显示)。
function onPaste(event: ClipboardEvent): void {
  if (isReadOnly.value) return
  const data = event.clipboardData
  if (data === null) return
  const imageItem = Array.from(data.items).find((item) => item.kind === 'file' && item.type.startsWith('image/'))
  if (imageItem !== undefined) {
    const file = imageItem.getAsFile()
    if (file !== null) {
      event.preventDefault()
      const name = file.name !== '' ? file.name : t.value.workspace.composer.pastedImage
      const attachment = toImageAttachment(name, file.type, file.size)
      commitAttachments([attachment], { [attachment.id]: URL.createObjectURL(file) })
      return
    }
  }
  const text = data.getData('text/plain')
  if (text !== '' && shouldTakeOverPaste(text)) {
    event.preventDefault()
    commitAttachments([toTextAttachment(t.value.workspace.composer.pastedText, text)])
  }
}

// ---- 侧栏文件拖入 ----
// 拖源带上自定义 MIME 类型(application/x-maixmia-file),据此与「外部文件拖入」区分:
// 只有带它的拖拽才接管。外部文件拖入不拦,交给浏览器默认行为。
function carriesFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(FILE_DRAG_TYPE)
}

function onDragOver(event: DragEvent): void {
  if (isReadOnly.value || !carriesFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy'
  dropActive.value = true
}

function onDragLeave(event: DragEvent): void {
  // dragleave 在子元素之间也会触发:只有指针真的离开卡片才熄灭落点反馈。
  const next = event.relatedTarget
  if (next instanceof Node && formRef.value?.contains(next) === true) return
  dropActive.value = false
}

function onDrop(event: DragEvent): void {
  if (isReadOnly.value || !carriesFileDrag(event)) return
  event.preventDefault()
  dropActive.value = false
  const path = event.dataTransfer?.getData(FILE_DRAG_TYPE) ?? ''
  if (path === '') return
  commitAttachments([toFileAttachment(path, fileBaseName(path))])
}

function onModelSelect(id: string): void {
  emit('update:model', id)
}

// 组件卸载:撤掉全部预览 URL(草稿仍留着,但对象 URL 属于本次挂载,不跨挂载复用)。
onBeforeUnmount(() => {
  for (const url of Object.values(previewUrls.value)) URL.revokeObjectURL(url)
})

// ---- 遥测条 ----
// 状态词:客户端实时生成状态优先(排队→思考中、流式→输出中、停止 / 完成),空闲时回落取
// AgentRuntime.status(含等待确认);确认处理后的去向由 confirmationOutcome 派生。
type TelemetryStatus = 'idle' | 'thinking' | 'streaming' | 'waiting' | 'stopped' | 'complete'

const resolutionStatus = computed<'streaming' | 'idle' | null>(() => {
  if (props.runtime.confirmationOutcome === 'allowed') return 'streaming'
  if (props.runtime.confirmationOutcome === 'rejected') return 'idle'
  return null
})
const statusKind = computed<TelemetryStatus>(() => {
  const phase = props.runtime.generation
  if (phase === 'queued') return 'thinking'
  if (phase === 'streaming') return 'streaming'
  if (phase === 'stopped') return 'stopped'
  if (phase === 'complete') return 'complete'
  if (resolutionStatus.value !== null) return resolutionStatus.value
  return props.runtime.telemetry?.status ?? 'idle'
})
const statusWord = computed(() => t.value.workspace.statusWords[statusKind.value])
// 运行态遥测(状态词 / 具体动作 / Context / 计时)只在**这段对话已经有消息**时才有意义:
// 空对话没有运行、没有已用 context、也没有计时。模型选择不同 —— 它在发送前就要能选,故恒显示。
const hasRunTelemetry = computed(() => props.runtime.telemetry !== null && !props.canReassign)
// 状态圆点:强调色只承担「活动指示」—— 思考中 / 输出中走强调色,等待确认走警告色,其余中性。
const statusLevel = computed<'accent' | 'warning' | 'neutral'>(() => {
  if (statusKind.value === 'thinking' || statusKind.value === 'streaming') return 'accent'
  if (statusKind.value === 'waiting') return 'warning'
  return 'neutral'
})
// 状态项恒为「状态词 · 具体动作」两段式:客户端状态用本地动作词,等待 / 空闲取 AgentRuntime.statusDetail。
const statusDetail = computed(() => {
  const phase = props.runtime.generation
  if (phase === 'queued') return t.value.workspace.statusActions.queued
  if (phase === 'streaming') return t.value.workspace.statusActions.streaming
  if (phase === 'stopped') return t.value.workspace.statusActions.stopped
  if (phase === 'complete') return t.value.workspace.statusActions.complete
  if (resolutionStatus.value === 'streaming') return t.value.workspace.statusActions.streaming
  if (resolutionStatus.value === 'idle') return t.value.workspace.statusActions.idle
  const current = props.runtime.telemetry
  if (current === null) return ''
  const details: Record<string, string> = t.value.workspace.statusDetails
  return details[current.statusDetail] ?? current.statusDetail
})
// 当前模型:来自**本会话**选中的模型(窗口大小由它决定,单一来源在 data/models.ts)。
// 展示名由 ModelMenu 自己按同一目录解析,这里只用它算 context 窗口。
const model = computed(() => modelById(props.runtime.modelId))
// Context 用量:分母取**本会话选中模型**的窗口(切换模型即按新窗口重算),分子取遥测的已用量。
// 分级配色 <75% info、75–89% warning、≥90% error(状态色表达结果)。
const contextPercent = computed(() => {
  const current = props.runtime.telemetry
  if (current === null || model.value.contextWindowTokens <= 0) return 0
  return Math.round((current.contextUsedTokens / model.value.contextWindowTokens) * 100)
})
const contextLevel = computed<'info' | 'warning' | 'error'>(() => {
  if (contextPercent.value >= 90) return 'error'
  if (contextPercent.value >= 75) return 'warning'
  return 'info'
})
const contextText = computed(() => {
  const current = props.runtime.telemetry
  if (current === null) return ''
  return `${contextPercent.value}% (${formatTokenCount(current.contextUsedTokens)}/${formatTokenCount(model.value.contextWindowTokens)})`
})
// 拆开的两段:百分比恒显示,「(已用 / 上限)」在**最窄的容器档**让位(见模板与容器查询)——
// 宽处给全量,窄处只留决策相关的百分比;完整文本仍在 title 上(悬停 / 读屏可读)。
const contextUsed = computed(() => {
  const current = props.runtime.telemetry
  return current === null ? '0K' : formatTokenCount(current.contextUsedTokens)
})
const contextWindow = computed(() => formatTokenCount(model.value.contextWindowTokens))

// token 计数的紧凑写法:82000 → 82K、200000 → 200K、1000000 → 1M(等宽数字,列宽不跳动)。
function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${Math.round((value / 1_000_000) * 10) / 10}M`
  return `${Math.round(value / 1000)}K`
}

// ---- 时长秒表 ----
// 由遥测给出的起算秒本地走秒(它只在有遥测时显示)。组件卸载时清理。
const elapsed = ref(0)
let clock: ReturnType<typeof setInterval> | undefined

watch(() => props.runtime.telemetry, (current) => {
  clearInterval(clock)
  clock = undefined
  if (current === null) return
  elapsed.value = current.elapsedSeconds
  clock = setInterval(() => { elapsed.value += 1 }, 1000)
}, { immediate: true })

onBeforeUnmount(() => { clearInterval(clock) })

// 时长格式 m:ss(语言中立、数值等宽),不显示毫秒。
function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
  <div class="composer-dock">
    <!-- 「回到底部」= 悬浮图标按钮:绝对定位、水平居中于阅读列,浮在坞顶**之上**(不覆盖坞)。
         进 / 出只用 opacity + transform(动效白名单);它是独立控件,守 44×44。 -->
    <Transition name="scroll-to-bottom-pop">
      <button
        v-if="showBackToBottom"
        type="button" class="scroll-to-bottom" :aria-label="t.workspace.backToBottom" @click="emit('back-to-bottom')"
      >
        <DliIcon name="arrowDown" />
      </button>
    </Transition>
    <!-- 定宽居中容器:自上而下 = 项目挂耳标签(**在卡片之外**、其上方)→ 输入卡片 → 发送错误行。
         它把坞内的内容统一收在同一条阅读列上(与 .transcript-inner 同轴,见 workspace.spec 的
         「消息列与输入框同轴」)。 -->
    <div class="composer-inner">
      <!-- 项目挂耳标签:归属是「身份」而非运行时遥测,故从底行移出、落在卡片左上角,并用一条引线
           勾回卡片(读者一眼看出它属于哪张卡)。结构上它是 form 的**前一个兄弟**且在它之前,
           故 DOM 顺序 = 视觉顺序(WCAG 2.4.3;也是「它不是 textarea 的 label」的机械保证)。
           两种状态:空对话可改(button)/ 有消息冻结(纯文本);外观差别是**静态可见**的,
           不靠 hover 才能看出可点(见各自样式)。 -->
      <div v-if="projectName" :id="projectLabelId" class="composer-project-row" :class="identityClass">
        <!-- 引线:1px 竖线自标签底边下落、跨过 4px 间隙 → 8px 圆角折弯 → 沿卡片上边向右延伸并渐隐。
             颜色取 `--dl-border-base`(与卡片自身描边同级,最低对比),不叠加阴影(design-language ⑦)。
             渐隐用 mask(向透明渐变),见样式;圆角折弯由路径里的 A 弧线给出。
             窄屏换另一条只含竖直下落的路径(见样式的窄屏降级)。 -->
        <svg class="composer-project-leader" width="24" height="12" viewBox="0 0 24 12" aria-hidden="true" focusable="false">
          <path class="composer-project-leader__line" d="M0.5 0 V3.5 A8 8 0 0 0 8.5 11.5 H24" />
          <path class="composer-project-leader__drop" d="M0.5 0 V11.5" />
        </svg>
        <!-- 可改态(空对话):原生 button,常显 caret + 发丝描边 + elevated 底 —— **静止态就长得像
             控件**;hover 只做加深,不承担「告不告诉你能点」的职责(base state is the accessible state)。 -->
        <button
          v-if="canReassign"
          type="button"
          class="composer-project composer-project--action"
          :title="projectPath"
          aria-haspopup="listbox"
          :aria-expanded="reassignPickerOpen"
          :aria-label="reassignLabel"
          data-project-picker-trigger
          @click="openReassign"
        >
          <span class="composer-project__chip">
            <span class="composer-project__dot" aria-hidden="true" />
            <span class="composer-project__name">{{ projectName }}</span>
            <svg class="composer-project__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </button>
        <!-- 只读态(已有消息):纯文本,**不是禁用按钮**(禁用控件被读屏读出却不可操作是明确问题)。
             不可聚焦、无 caret、无底、无可见描边,文字降为三级色;引线**保留**(结构不随状态消失)。 -->
        <span v-else class="composer-project" :title="projectPath">
          <span class="composer-project__chip">
            <span class="composer-project__dot" aria-hidden="true" />
            <span class="composer-project__name">{{ projectName }}</span>
          </span>
        </span>
      </div>

      <!-- 输入框卡片:内部自上而下 = 附件区 / textarea / 底行(⊕ + 模型与遥测)。发送由 Enter 承担,
           生成中的「停止」仍在框内。 -->
      <form
        ref="formRef" class="composer-form" :class="{ 'is-drop-target': dropActive }"
        :title="t.workspace.inputHint" @submit.prevent="submit"
        @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
      >
        <!-- 附件区:有附件才渲染;在 textarea 之上、仍在卡片内。每枚芯片带一枚原生删除按钮。 -->
        <ul v-if="attachments.length" class="composer-attachments" :aria-label="t.workspace.composer.attachments">
          <li v-for="attachment in attachments" :key="attachment.id" class="attachment-chip" :data-kind="attachment.kind">
            <!-- 图片:缩略图(objectURL);对象 URL 未就绪(如卸载后重挂)时回落图标。 -->
            <img v-if="attachment.kind === 'image' && previewUrls[attachment.id]" class="attachment-chip__thumb" :src="previewUrls[attachment.id]" :alt="attachment.name" />
            <DliIcon v-else-if="attachment.kind === 'image'" name="image" size="sm" class="attachment-chip__icon" />
            <DliIcon v-else-if="attachment.kind === 'file'" name="fileText" size="sm" class="attachment-chip__icon" />
            <!-- 粘贴文本:只报「N 行 · M 字符」,全文存在附件的 content 里(发送时发全文)。 -->
            <span v-if="attachment.kind === 'text'" class="attachment-chip__summary">[{{ attachment.name }} · {{ linesLabel(attachment.lineCount ?? 0) }} · {{ t.workspace.composer.chars.replace('{count}', String(attachment.charCount ?? 0)) }}]</span>
            <template v-else>
              <span class="attachment-chip__name">{{ attachment.name }}</span>
              <!-- 路径是**补充信息**,只在它比名字多给出东西时才显示:项目根目录下的文件
                   (README.md、progress.csv 这类)名字与路径完全相同,再写一遍就是纯噪声。 -->
              <code v-if="attachment.path && attachment.path !== attachment.name" class="attachment-chip__meta">{{ attachment.path }}</code>
              <span v-else-if="attachment.sizeBytes" class="attachment-chip__meta">{{ formatBytes(attachment.sizeBytes) }}</span>
            </template>
            <button type="button" class="attachment-chip__remove" :aria-label="t.workspace.composer.remove.replace('{name}', attachment.name)" @click="removeAttachment(attachment.id)"><span aria-hidden="true">×</span></button>
          </li>
        </ul>
        <p v-if="dropActive" class="composer-drop-hint">{{ t.workspace.composer.dropHint }}</p>
        <p v-if="attachmentError" class="composer-attachment-error" role="alert">{{ attachmentError }}</p>
        <div class="composer-input-row">
          <div class="textarea-sizer" :data-value="(runtime.draft || t.workspace.placeholder) + ' '">
            <textarea
              :id="composerId" :name="composerId" class="composer-textarea" :value="runtime.draft" rows="1"
              :aria-label="ariaLabel" :aria-describedby="describedBy" :placeholder="t.workspace.placeholder" :readonly="isReadOnly"
              @input="onInput" @keydown="onKeydown" @paste="onPaste"
            />
          </div>
          <button v-if="isGenerating" class="workspace-button send-button stop-button" type="button" :aria-label="t.workspace.stop" @click="emit('stop')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" /></svg></button>
        </div>
        <!-- 底行:左 ⊕(上传),右「模型 ▾ + 遥测项」。遥测项沿用 │ 分隔与容器查询逐项降级。 -->
        <div class="composer-bar">
          <button type="button" class="composer-attach" :aria-label="t.workspace.composer.add" :disabled="isReadOnly" @click="openFilePicker">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <input ref="fileInputRef" class="composer-file-input" type="file" multiple :accept="ACCEPT" tabindex="-1" aria-hidden="true" @change="onFilesChosen" />
          <!-- 遥测条:只有状态项是 live region(状态 / 具体动作变化时播报);其余部分不做 live,避免整条太吵。 -->
          <div class="telemetry" role="group" :aria-label="t.workspace.telemetry.label">
            <div v-if="hasRunTelemetry" class="telemetry__status" :role="isLive ? 'status' : undefined" :aria-live="isLive ? 'polite' : undefined">
              <span class="telemetry__status-head">
                <span class="telemetry__dot" :data-level="statusLevel" aria-hidden="true" />
                <span class="telemetry__word">{{ statusWord }}</span>
              </span>
              <span v-if="statusDetail" class="telemetry__detail" :title="statusDetail">· {{ statusDetail }}</span>
            </div>
            <span v-if="runtime.telemetry" class="telemetry__item telemetry__item--model">
              <span v-if="hasRunTelemetry" class="telemetry__sep" aria-hidden="true">│</span>
              <ModelMenu :model-id="runtime.modelId" @select="onModelSelect" />
            </span>
            <span v-if="hasRunTelemetry" class="telemetry__item telemetry__item--context">
              <span class="telemetry__sep" aria-hidden="true">│</span>
              <span class="telemetry__context-text" :title="contextText"><span class="telemetry__context-percent">{{ contextPercent }}%</span><span class="telemetry__context-counts"> ({{ contextUsed }}/{{ contextWindow }})</span></span>
              <span class="telemetry__meter" role="progressbar" :aria-label="t.workspace.telemetry.context" :aria-valuenow="contextPercent" aria-valuemin="0" aria-valuemax="100"><span class="telemetry__meter-fill" :data-level="contextLevel" :style="{ width: `${contextPercent}%` }" /></span>
            </span>
            <span v-if="hasRunTelemetry" class="telemetry__item telemetry__item--elapsed"><span class="telemetry__sep" aria-hidden="true">│</span><span class="telemetry__elapsed">{{ formatElapsed(elapsed) }}</span></span>
          </div>
        </div>
      </form>
      <!-- 流内区域(框外):只剩发送错误行与必要的留白;遥测条住在卡片底行。 -->
      <p v-if="runtime.hasSendError" class="send-error" role="alert">{{ t.workspace.sendError }}</p>
    </div>
  </div>
</template>

<style scoped>
/* 坞没有独立的面(与转录区同色,继承面板底色);横向内缩统一由本容器给出,坞内的输入框与
   遥测条因此共用同一条阅读列。它是面板 / 窗体里的**流内**元素,不设 z-index(属应用外壳那一层,
   悬浮的文件窗体可以盖住它 —— 用户要的「输入框与整个对话框做在一起,能被文件窗体覆盖」)。 */
.composer-dock { position: relative; flex-shrink: 0; padding-inline: var(--dl-space-6); }
/* 坞内容的定宽居中容器:自上而下 = 项目挂耳标签 / 输入卡片 / 发送错误行,三者共用同一条阅读列
   (与 .transcript-inner 同轴;底部留一档内边距,给输入框下缘一点呼吸感)。 */
.composer-inner { max-width: var(--workspace-column-max); margin-inline: auto; padding-block-end: var(--dl-space-4); }
/* ---- 项目挂耳标签:卡片**外部左上角**的一枚身份标签,由一条引线勾回卡片 ---- */
/* 整行的布局容器:与卡片同轴定宽居中;DOM 上是 form 的**前一个兄弟**(读屏 / Tab 顺序 = 视觉顺序,
   WCAG 2.4.3)。内容左缘 = 卡片**内容**左缘(卡片 1px 描边 + 8px 内边距),即与输入文字同一条竖线;
   底边与卡片上边缘之间留 --dl-space-1(4px)。 --composer-content-inset 由本行给出、供引线复用。 */
.composer-project-row {
  --composer-content-inset: calc(var(--dl-border-width) + var(--dl-space-2));
  position: relative;
  display: flex;
  max-width: var(--workspace-column-max);
  margin-inline: auto;
  padding-inline-start: var(--composer-content-inset);
  padding-block-end: var(--dl-space-1);
}
/* 引线:1px 竖线自标签底边下落 → 8px 圆角折弯 → 沿卡片上边向右延伸并渐隐。
   它是**纯装饰**(aria-hidden + pointer-events:none),只补偿「这张标签属于哪张卡」的从属关系。
   取色 = 卡片自身描边色 --dl-border-base(这一带对比最低的一档)—— 若它成了最先被注意到的东西
   就是做过头了;不叠加阴影(design-language ⑦:描边与阴影不叠用)。
   定位:绝对贴到行盒的**左缘**(= 卡片内容左缘)与**底边**(= 卡片上边缘),故纵段跨过 4px 间隙、
   横段正好落在卡片上边。渐隐用 mask(向透明渐变),竖段与折弯保持实色,只让横段尾端淡出。 */
.composer-project-leader {
  position: absolute;
  inset-inline-start: var(--composer-content-inset);
  inset-block-end: 0;
  display: block;
  color: var(--dl-border-base);
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to right, currentColor 55%, transparent 100%);
  mask-image: linear-gradient(to right, currentColor 55%, transparent 100%);
}
.composer-project-leader__line { fill: none; stroke: currentColor; stroke-width: var(--dl-border-width); }
/* 窄屏形态的引线(只有竖直下落、不折弯也不横向延伸),默认不显示 —— 由下方窄屏规则切换。 */
.composer-project-leader__drop { display: none; fill: none; stroke: currentColor; stroke-width: var(--dl-border-width); }
/* 标签的**命中区**:挪出卡片底行后它不再属密集行,按独立控件默认档守 44×44(视觉 chip 约 28 高、
   居中其中,靠周围留白撑开命中区)。两态共用同一外壳高度,故行高恒定、引线几何不随状态漂移。 */
.composer-project {
  display: inline-flex;
  align-items: center;
  min-inline-size: 0;
  /* 名字再长也不顶出阅读列:超出即由 .composer-project__name 单行省略。 */
  max-inline-size: 100%;
  min-block-size: var(--dl-target-size);
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
}
/* 视觉 chip:项目名(等宽字体、xs 号 —— 它是文件系统标识,与 tab 上的等宽缩写同源)+ 标识色点
   + 可改态的 caret。圆角取 --dl-radius-md(8px,呼应同心公式「内圆角 = 外圆角 −(间距 + 描边)」),
   不用 pill(胶囊会把这类身份标签读成过于亲和的徽标 —— Stripe / Vercel 都明确规避)。
   柔和的来源是**发丝描边 + 低对比文字色 + 无阴影**,而不是更大的圆角。 */
.composer-project__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
  min-inline-size: 0;
  padding-block: var(--dl-space-1);
  border-radius: var(--dl-radius-md);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  /* 只读态:低对比纯文本 —— 无底、无可见描边、无 caret。 */
  color: var(--dl-text-tertiary);
}
.composer-project__dot { flex: none; inline-size: var(--dl-identity-dot-size); block-size: var(--dl-identity-dot-size); border-radius: var(--dl-radius-pill); background: var(--dl-identity); }
/* 单行省略:项目名可能很长,窄屏由 .composer-project-row 收紧 max-inline-size 后在此截断。 */
.composer-project__name { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.composer-project__caret { flex: none; inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); }
.composer-project__caret path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
/* 可改态(空对话):原生 button。**静止态就长得像控件** —— 常显 caret + 发丝描边 + elevated 底 +
   二级文字色;hover 只做加深,不承担「告不告诉你能点」的职责(base state is the accessible state)。
   命中区 ≥44×44:min-block-size 撑高,.composer-project--action 的 min-inline-size 兜宽(短名也达标)。 */
.composer-project--action { min-inline-size: var(--dl-target-size); cursor: pointer; border-radius: var(--dl-radius-md); }
.composer-project--action .composer-project__chip {
  padding-inline: var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-secondary);
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard), border-color var(--dl-duration-fast) var(--dl-ease-standard), color var(--dl-duration-fast) var(--dl-ease-standard);
}
.composer-project--action:hover .composer-project__chip { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); color: var(--dl-text-primary); }
.composer-project--action:active .composer-project__chip { background: var(--dl-bg-sunken); }
.composer-project--action[aria-expanded='true'] .composer-project__chip { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); color: var(--dl-text-primary); }
/* 焦点环画在**可见 chip**上(而不是 44 的命中区外壳),这样它紧贴用户看到的那个控件。
   行 / 坞 / 面板祖先都没有 overflow:hidden,环不会被裁(本仓有过祖先裁掉后代焦点环的前科)。 */
.composer-project--action:focus-visible { box-shadow: none; }
.composer-project--action:focus-visible .composer-project__chip { box-shadow: var(--dl-focus-ring); }
/* 遥测条:底行右侧的单行运行时信息(状态 · 模型 · Context · 时长)。降级按遥测条
   **自身可用宽度**(容器查询)决定,而非视口宽度 —— 它住在底行右侧,宽视口也未必装得下四项。
   行高固定 32:底行比它高(⊕ 与模型钮是独立控件,守 44),遥测条自身仍守「克制」那一档。
   各项允许收缩(见下面的 min-width / 省略号)—— 极窄面板(如 375 下的左右切分)里宁可把
   文字截短,也不把内容顶出卡片、污染整页的横向溢出。 */
.telemetry { display: flex; align-items: center; gap: var(--dl-space-2); flex: 1 1 auto; min-width: 0; block-size: var(--dl-space-8); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); color: var(--dl-text-secondary); container-type: inline-size; }
/* 状态块:可收缩,但**下限 = 状态词本身**(min-content 即「点 + 词」)—— 被挤时先让状态详情
   走省略号(minmax(0,1fr) 那一列),词本身绝不裁切(它是用户要的两件不许裁的信息之一)。 */
.telemetry__status { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: var(--dl-space-2); flex: 0 1000 auto; min-width: min-content; }
.telemetry__status-head { display: inline-flex; align-items: center; gap: var(--dl-space-2); min-width: 0; white-space: nowrap; }
.telemetry__dot { flex-shrink: 0; width: var(--dl-space-2); height: var(--dl-space-2); border-radius: var(--dl-radius-pill); background: var(--dl-text-tertiary); }
.telemetry__dot[data-level='accent'] { background: var(--dl-accent); }
.telemetry__dot[data-level='warning'] { background: var(--dl-warning); }
/* 状态词是**不可省略**的那部分(它表达状态本身),但面板极窄时允许收缩成省略号 —— 那比把
   整行顶出卡片要好;正常宽度(单区域 375 起)下它有足够空间,不会被截。 */
.telemetry__word { flex-shrink: 0; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--dl-text-primary); font-weight: 500; }
.telemetry__detail { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.telemetry__item { display: inline-flex; align-items: center; gap: var(--dl-space-2); flex-shrink: 0; min-width: 0; white-space: nowrap; }
/* 让位次序(空间不够时谁先缩):**状态详情**(已在 ≤486 档整条隐去)→ **Context**(最窄档只留
   百分比)。状态词与 Context 文本是不许被裁的两件。模型钮默认**不参与收缩**(shrink 0):模型名
   是用户点开前必须读全的信息,截成省略号等于「我得先点开才知道现在用的是什么模型」;唯一例外是
   底行本身已被挤到 ≤486 的窄档(见下方容器查询),那一档才允许它让位。 */
.telemetry__item--model { flex-shrink: 0; }
.telemetry__sep { flex: none; color: var(--dl-text-tertiary); }
.telemetry__context-text, .telemetry__elapsed { font-variant-numeric: tabular-nums; }
.telemetry__context-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.telemetry__meter { display: inline-block; flex-shrink: 0; width: var(--dl-space-12); height: var(--dl-space-1); border-radius: var(--dl-radius-pill); background: var(--dl-bg-sunken); overflow: hidden; }
.telemetry__meter-fill { display: block; height: 100%; border-radius: var(--dl-radius-pill); background: var(--dl-info); }
.telemetry__meter-fill[data-level='warning'] { background: var(--dl-warning); }
.telemetry__meter-fill[data-level='error'] { background: var(--dl-error); }
/* 降级按遥测条自身宽度(容器查询),逐项降低优先级;状态词、Context 与**模型控件**在任何宽度
   都不隐藏 —— 模型是用户点得到的控件(不是只读文本),隐藏它等于窄屏没法切模型。 */
@container (max-width: 611px) { .telemetry__meter { display: none; } }
@container (max-width: 555px) { .telemetry__item--elapsed { display: none; } }
/* 让位次序:底行容不下「状态词 + 模型 + Context」时,先让状态详情(它仍在 title 上,信息不丢)。 */
@container (max-width: 486px) {
  .telemetry__detail { display: none; }
  /* 底行被挤到这一档(含 375 切分后的窄窗格)时,模型名**允许**让位 —— 这是唯一会截它的场合;
     其余宽度它都完整显示(见 .telemetry__item--model 的说明)。 */
  .telemetry__item--model { flex-shrink: 100; }
}
/* 最窄一档:Context 只留百分比,「(已用 / 上限)」让位(完整文本仍在 title 上)。
   英语的「Waiting for confirmation + (186K/200K)」正是这一档要腾出来的那点宽度。 */
@container (max-width: 359px) { .telemetry__context-counts { display: none; } }
.send-error { color: var(--dl-error); margin-bottom: var(--dl-space-2); font-size: var(--dl-font-size-sm); }
/* 输入框卡片:自身仍抬起(elevated 底 + 发丝描边 + md 阴影 + lg 圆角);它是 .composer-inner
   的流内首个子块(定宽居中由 .composer-inner 给出,这里保留同值约束以防单独复用)。多行时向下
   长高、把坞顶推高。内部**纵向三段**:附件区 / 输入行 / 底行。 */
.composer-form { container: composer / inline-size; margin-inline: auto; max-width: var(--workspace-column-max); display: flex; flex-direction: column; gap: var(--dl-space-2); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-md); }
/* 侧栏文件拖到卡片上:整体描边 + 焦点环同款强调(只动 border-color / box-shadow,不触发布局)。 */
.composer-form.is-drop-target { border-color: var(--dl-accent); box-shadow: var(--dl-shadow-md), var(--dl-focus-ring); }
.composer-input-row { display: flex; align-items: flex-end; gap: var(--dl-space-2); min-width: 0; }
.textarea-sizer { display: grid; flex: 1; min-width: 0; max-height: calc(5 * var(--dl-font-size-md) * var(--dl-line-body) + 2 * var(--dl-space-2)); overflow: hidden; }
.textarea-sizer::after { content: attr(data-value); visibility: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.textarea-sizer::after, textarea { grid-area: 1 / 1; font: inherit; line-height: var(--dl-line-body); padding: var(--dl-space-2); min-height: var(--dl-target-size); min-width: 0; border: 0; }
textarea { width: 100%; height: 100%; max-height: inherit; resize: none; color: var(--dl-text-primary); background: transparent; overflow-y: auto; overscroll-behavior: contain; border-radius: var(--dl-radius-sm); }
textarea::placeholder { color: var(--dl-text-secondary); }
textarea:hover:not(:read-only) { background: var(--dl-bg-hover); }
textarea:read-only { color: var(--dl-text-secondary); }
/* 焦点环画在**输入框的可见边界**上(即 .composer-form 那圈描边),而不是 textarea 自身:
   textarea 是无边框的,且被 .textarea-sizer 的 overflow:hidden 裁切 —— 而全局 `:focus-visible`
   给的是**外扩** 3px 的环,画在它身上会整条被裁掉(实测只剩四个圆角处逃出的小楔形,
   聚焦 / 未聚焦两图的强差异像素仅 327 个,四条边的中点全无变化),键盘用户因此看不出
   哪个输入框被聚焦。这与「搜索框只由容器承担焦点环」是同一条既有做法
   (见 conversation-switcher 的 .conversation-search:focus-within)。 */
.composer-form:focus-within {
  border-color: var(--dl-border-strong);
  box-shadow: var(--dl-shadow-md), var(--dl-focus-ring);
}
/* 输入框自身不再画环(它继承全局 :focus-visible),否则会与容器那圈叠成「双层青瓷框」。 */
textarea:focus,
textarea:focus-visible { outline: none; box-shadow: none; }
/* ---- 底行:左 ⊕,右 模型 ▾ + 遥测项 ---- */
.composer-bar { display: flex; align-items: center; gap: var(--dl-space-2); min-width: 0; }
/* 极窄档(两张卡片并排的 375 切分态,卡片只剩 ~134px):底行**换行** ——
   ⊕ 一行,遥测整体一行;仍不够时遥测内部再换行。宁可长高,也不隐藏模型控件:
   它是用户点得到的控件(不是只读文本),而窄屏没法切模型正是不该发生的降级。
   判据是**卡片**宽度(容器 composer),不是视口 —— 同一视口下别处可能还很宽。 */
@container composer (max-width: 320px) {
  .composer-bar { flex-wrap: wrap; row-gap: var(--dl-space-1); }
  .telemetry { flex: 1 1 100%; block-size: auto; flex-wrap: wrap; row-gap: var(--dl-space-1); }
}

/* 极窄显示区(375/480/560 分屏拖到 90% 时,区域只有 30–50px):输入坞的 attach / 遥测
   在 min-content 下仍会把文档撑出横向滚动。此时**整条输入坞让位** —— 转录仍可读,
   区域也仍可从分隔线拖宽;不能为了保留一个不可用的输入框破坏整页布局。 */
@container (max-width: 160px) {
  .composer-dock { display: none; }
}
/* ⊕ 上传:独立图标按钮(守 44×44),原生隐藏 input 由它触发(WCAG:文件上传必须有点击通路)。 */
.composer-attach { display: inline-flex; align-items: center; justify-content: center; flex: none; min-width: var(--dl-target-size); min-height: var(--dl-target-size); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); transition: background var(--dl-duration-fast) var(--dl-ease-standard); }
.composer-attach:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.composer-attach:active:not(:disabled) { background: var(--dl-bg-sunken); }
.composer-attach:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.composer-attach:focus-visible { box-shadow: var(--dl-focus-ring); }
.composer-attach svg { width: var(--dl-icon-md); height: var(--dl-icon-md); flex: none; }
.composer-attach svg path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
/* 视觉隐藏的上传控件:不用 display:none(部分浏览器下 JS click 不弹选择器),用 1px + clip 方案。 */
.composer-file-input { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
/* ---- 附件区 ---- */
.composer-attachments { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); padding: var(--dl-space-1); margin: calc(-1 * var(--dl-space-1)); }
.attachment-chip { position: relative; display: inline-flex; align-items: center; gap: var(--dl-space-2); max-width: 100%; padding: var(--dl-space-1) var(--dl-space-1) var(--dl-space-1) var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-hover); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.attachment-chip__thumb { flex: none; inline-size: var(--dl-icon-lg); block-size: var(--dl-icon-lg); object-fit: cover; border-radius: var(--dl-radius-sm); }
.attachment-chip__icon { flex: none; color: var(--dl-text-secondary); }
.attachment-chip__name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--dl-text-primary); }
.attachment-chip__meta { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--dl-text-secondary); font-family: var(--dl-font-mono); }
.attachment-chip__summary { color: var(--dl-text-primary); font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; }
/* 芯片的删除钮:密集行(一排芯片)的行内控件,按第三档 24px;相邻芯片间距 ≥8px,判据圆不相交。 */
.attachment-chip__remove { flex: none; display: inline-flex; align-items: center; justify-content: center; inline-size: var(--dl-space-6); block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: 1; }
.attachment-chip__remove:hover { background: var(--dl-bg-sunken); color: var(--dl-text-primary); }
.attachment-chip__remove:focus-visible { box-shadow: var(--dl-focus-ring); }
.composer-drop-hint { color: var(--dl-accent); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.composer-attachment-error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
/* 停止钮:沿用工作台既有按钮配方的最小集(它渲染在本组件里,拿不到页面那份 scoped 规则)。 */
.workspace-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-height: var(--dl-target-size); min-width: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-button:focus-visible { box-shadow: var(--dl-focus-ring); }
.workspace-button:active { transform: translateY(var(--dl-lift-press)); }
.workspace-button:disabled { cursor: not-allowed; color: var(--dl-text-disabled); background: var(--dl-bg-sunken); transform: none; }
.send-button { flex-shrink: 0; padding: var(--dl-space-2); background: var(--dl-accent); color: var(--dl-text-on-accent); border-color: transparent; }
.send-button:hover { background: var(--dl-accent-hover); }
.stop-button svg { fill: currentColor; }
.workspace-button svg { width: var(--dl-icon-md); height: var(--dl-icon-md); flex-shrink: 0; }
/* 「回到底部」:坞内**唯一**仍绝对定位的悬浮件 —— 锚在坞顶之上(底边 = 坞顶边 − 一档间隙),
   浮在转录区下缘那一带上,**不覆盖坞**。44×44 独立控件,不落入紧凑导航行档。 */
.scroll-to-bottom {
  position: absolute;
  inset-block-end: calc(100% + var(--dl-space-2));
  inset-inline-start: 50%;
  z-index: var(--dl-z-sticky);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-target-size);
  block-size: var(--dl-target-size);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  box-shadow: var(--dl-shadow-md);
  transform: translateX(-50%);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard), background var(--dl-duration-fast) var(--dl-ease-standard);
}
.scroll-to-bottom:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.scroll-to-bottom:active { transform: translate(-50%, var(--dl-lift-press)); }
.scroll-to-bottom:focus-visible { box-shadow: var(--dl-focus-ring); }
.scroll-to-bottom-pop-enter-active,
.scroll-to-bottom-pop-leave-active { transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard); }
.scroll-to-bottom-pop-enter-from,
.scroll-to-bottom-pop-leave-to { opacity: 0; transform: translate(-50%, var(--dl-space-1)); }
/* 窄屏:坞的横向内缩收一档。 */
@media (max-width: 1023px) {
  .composer-dock { padding-inline: var(--dl-space-4); }
}
/* 窄屏(375 一档)的挂耳标签降级。**绝不隐藏标签** —— 隐藏它等于回到「用户不知道自己在哪个
   项目」的失败态,窄屏的空对话必须仍有改归属的入口。降级只做三件事:
   · 标签收紧 max-inline-size,长名走单行省略(不与卡片争宽,也不顶出阅读列);
   · chip 的横向内边距收一档,省出宽度给项目名;
   · 引线去掉横向段与折弯,只留竖直下落 —— 横向段在窄屏会伸到卡片右侧控件那一片。 */
@media (max-width: 480px) {
  .composer-project { max-inline-size: 60%; }
  .composer-project--action .composer-project__chip { padding-inline: var(--dl-space-1); }
  .composer-project-leader__line { display: none; }
  .composer-project-leader__drop { display: inline; }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-button:active { transform: none; }
}
</style>
