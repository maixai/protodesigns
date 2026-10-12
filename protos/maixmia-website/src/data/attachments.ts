// 附件的构造与阈值:输入坞里「把某个东西计入本轮对话」的四条入口(+ 上传 / 粘贴 / 侧栏拖入 /
// 侧栏按钮)共用同一套构造与校验,故集中在这里,不散落在组件里。
//
// 阈值取值依据:ChatGPT 在 5,000(付费)/ 10,000(全量)字符处把长粘贴转成附件,Grok 用
// 「行数 + 字符数」芯片 —— 两条路线的共同点是**只压缩显示、发送时仍发全文**。本仓的演示数据
// 普遍更短,故取一个更小的阈值(1,000 字符 / 12 行),让「长粘贴折叠」在原型里真的能被看到;
// 阈值只影响「多大才折叠」,不影响「发送的是全文」(见 toTextAttachment 与 send 的注释)。
import type { Attachment } from '../contracts/generated/attachment'

// 单个附件的大小上限(5MB)。超限给**可见**提示,不静默丢弃。
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
// 拖拽侧栏文件时在 dataTransfer 上使用的**自定义 MIME 类型**(值为项目内相对路径)。
// 它把「侧栏文件拖入」与「外部文件拖入」区分开:只有带它的拖拽才被对话坞接管,
// 外部文件拖入保持浏览器默认行为(不 preventDefault)。
export const FILE_DRAG_TYPE = 'application/x-maixmia-file'
// 一段对话最多能带的附件数(与底行的宽度预算相匹配)。
export const MAX_ATTACHMENTS = 8
// 粘贴文本的接管阈值:≥ 1,000 字符 或 ≥ 12 行才接管(短粘贴不打扰浏览器默认插入)。
export const PASTE_TAKE_OVER_CHARS = 1000
export const PASTE_TAKE_OVER_LINES = 12

// 附件 id 的生成器:原型内单调递增即可(刷新即重置),用于芯片的 key 与移除定位。
let sequence = 0
export function nextAttachmentId(): string {
  sequence += 1
  return `att-${sequence}`
}

// 字符数按**码点**计(中文一字即一码点),与芯片展示和接管阈值同源,避免两处口径不一。
export function attachmentCharCount(content: string): number {
  return Array.from(content).length
}

// 行数:换行符的通用切分(\n / \r\n / \r),至少 1 行。
export function attachmentLineCount(content: string): number {
  return content.split(/\r\n|\r|\n/).length
}

// 一段文本是否该被**接管**成附件(而不是让浏览器直接插进输入框)。
export function shouldTakeOverPaste(content: string): boolean {
  return attachmentCharCount(content) >= PASTE_TAKE_OVER_CHARS || attachmentLineCount(content) >= PASTE_TAKE_OVER_LINES
}

// 项目内的一个文件(来自侧栏拖入 / 侧栏按钮)。path 是相对项目根的相对路径。
export function toFileAttachment(path: string, name: string): Attachment {
  return { id: nextAttachmentId(), kind: 'file', name, path }
}

// 图片:path 可有可无(项目内的图片有相对路径;粘贴 / 上传的本地图片只有文件名)。
// 契约**不存图片字节** —— 预览由载体用 URL.createObjectURL 现做,发送时只带名称与类型。
export function toImageAttachment(name: string, mimeType: string, sizeBytes: number, path?: string): Attachment {
  return path === undefined
    ? { id: nextAttachmentId(), kind: 'image', name, mimeType, sizeBytes }
    : { id: nextAttachmentId(), kind: 'image', name, mimeType, sizeBytes, path }
}

// 本地文件(`+` 上传):浏览器不给本地文件的目录,故没有项目相对路径可填(契约里 path 缺省);
// 展示文件名 + 大小,发送时带文件名 / 类型。
export function toLocalFileAttachment(name: string, mimeType: string, sizeBytes: number): Attachment {
  return { id: nextAttachmentId(), kind: 'file', name, mimeType, sizeBytes }
}

// 粘贴进来的长文本:正文**完整**存进 content —— 芯片只显示行数 / 字符数,发送时发的是全文。
export function toTextAttachment(name: string, content: string): Attachment {
  return {
    id: nextAttachmentId(),
    kind: 'text',
    name,
    content,
    lineCount: attachmentLineCount(content),
    charCount: attachmentCharCount(content),
  }
}
