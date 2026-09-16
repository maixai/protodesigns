#!/usr/bin/env node
// 静态文件服务脚本:以 preview/dist 为静态根,提供本地预览所需的 http 服务。
// 仅使用 node 内建模块(http / fs / path / url),不引入外部依赖。
// 映射语义对齐 nginx try_files:实际文件 -> 目录 index.html -> 回退到 preview/dist/index.html(SPA fallback)。
// URL 空间:预览站挂在域名根 —— / 为首页、/assets/... 为 preview 自身构建资源(静态根 assets/)、/proto/... 为详情页 SPA 路由(回退首页);
// protos 统一在 /p/ 下 —— /p/<slug>/... 映射各 proto 构建产物(静态根 p/<slug>/)。

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'

// 仓库根:本脚本位于 scripts/ 下,上一级即仓库根。
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STATIC_ROOT = join(ROOT, 'preview', 'dist')
const SPA_FALLBACK = join(STATIC_ROOT, 'index.html')

// 常用静态资源 MIME 表;未命中的扩展名统一回退 application/octet-stream。
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
}

// 解析监听端口:优先级 --port <n> 参数(--port=<n> 亦支持) > PORT 环境变量 > 默认 5173。
function resolvePort() {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    let value = null
    if (arg === '--port') {
      value = args[i + 1]
    } else if (arg.startsWith('--port=')) {
      value = arg.slice('--port='.length)
    }
    if (value != null) {
      if (/^\d+$/.test(value)) return Number(value)
      console.warn(`Warning: invalid --port value "${value}", falling back to PORT env / default`)
    }
  }
  if (process.env.PORT && /^\d+$/.test(process.env.PORT)) return Number(process.env.PORT)
  return 5173
}

const PORT = resolvePort()

// 解析监听地址:优先级 --host <h> 参数(--host=<h> 亦支持) > HOST 环境变量 > 默认 0.0.0.0(监听所有网卡,允许远程访问)。
function resolveHost() {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    let value = null
    if (arg === '--host') {
      value = args[i + 1]
    } else if (arg.startsWith('--host=')) {
      value = arg.slice('--host='.length)
    }
    if (value != null) {
      if (value.trim() !== '') return value.trim()
      console.warn(`Warning: invalid --host value, falling back to HOST env / default`)
    }
  }
  if (process.env.HOST && process.env.HOST.trim() !== '') return process.env.HOST.trim()
  return '0.0.0.0'
}

const HOST = resolveHost()

// 获取本机所有非回环 IPv4 地址,用于打印远程访问链接(远程开发时 localhost 不可点)。
function getLanAddresses() {
  const addrs = []
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address)
    }
  }
  return addrs
}

// 输出统一格式的 404 响应。
function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('404 Not Found')
}

// 读取文件内容并响应;HEAD 请求只回响应头,不回 body。
// 读取失败(如并发删除或文件不存在)时兜底 404;响应头已发出则直接断开连接。
async function sendFile(res, filePath, contentType, isHead) {
  try {
    const data = await readFile(filePath)
    if (res.headersSent) return
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    })
    res.end(isHead ? undefined : data)
  } catch {
    if (!res.headersSent) send404(res)
    else res.destroy()
  }
}

// 解析请求路径对应的磁盘文件:目录返回其 index.html,普通文件原样返回,均不存在返回 null。
async function resolveTarget(filePath) {
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) {
      const indexFile = join(filePath, 'index.html')
      try {
        await stat(indexFile)
        return indexFile
      } catch {
        return null
      }
    }
    if (info.isFile()) return filePath
    return null
  } catch {
    return null
  }
}

// 将 URL pathname 按 base=/p/ 划分,映射为静态根下的相对磁盘路径。
// 分类规则(以剥离 /p/ 前缀后的首段为准):
//   /p 或 /p/          -> index.html(preview 首页)
//   proto/...          -> index.html(preview 详情页 SPA 路由,直接回退首页)
//   assets/...         -> assets/...(preview 自身构建资源,静态根顶层)
//   其余 <slug>/...    -> p/<slug>/...(各 proto 构建产物)
// 返回 null 表示路径不在 /p/ 命名空间内,应直接 404。
function mapToRelativePath(pathname) {
  // 预览站挂在域名根:首页 /、自身资源 /assets/、详情页 SPA 路由 /proto/ 回退首页;
  // protos 统一在 /p/ 下,映射到静态根 p/ 子目录;其它未知路径一律 SPA 回退首页。
  if (pathname === '/' || pathname === '/index.html') return 'index.html'
  if (pathname.startsWith('/assets/')) return pathname.slice(1) // assets/...
  if (pathname.startsWith('/proto/')) return 'index.html'       // SPA 路由 -> preview 首页
  if (pathname.startsWith('/p/')) return pathname.slice(1)      // p/<slug>/...
  return 'index.html'                                           // 其它未知 -> SPA fallback
}

// 统一请求入口:非 GET/HEAD 拒绝;解析并校验路径后按映射规则响应。
async function handleRequest(req, res) {
  const isHead = req.method === 'HEAD'
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' })
    res.end('405 Method Not Allowed')
    return
  }

  // URL pathname 解码;解码失败(非法 percent 编码)视为请求错误。
  let pathname
  try {
    const parsed = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`)
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('400 Bad Request')
    return
  }

  // 路径穿越防护:按 / 拆分 pathname,含 . 或 .. 的段直接拒绝(已解码,可覆盖 %2e%2e 等编码穿越)。
  const segments = pathname.split('/').filter(Boolean)
  if (segments.some((seg) => seg === '.' || seg === '..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('403 Forbidden')
    return
  }

  // 把 pathname 按 base=/p/ 映射为静态根下的相对路径;不在 /p/ 命名空间内的请求直接 404。
  const relative = mapToRelativePath(pathname)
  if (relative === null) {
    send404(res)
    return
  }

  // 解析到静态根下;再做一次真实路径校验,防符号链接等逃逸静态根。
  const resolvedPath = resolve(STATIC_ROOT, relative)
  if (resolvedPath !== STATIC_ROOT && !resolvedPath.startsWith(STATIC_ROOT + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('403 Forbidden')
    return
  }

  const target = await resolveTarget(resolvedPath)
  if (target) {
    const contentType = MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream'
    await sendFile(res, target, contentType, isHead)
    return
  }

  // 实际文件与目录 index.html 均不存在:回退到 preview 首页,覆盖 /p/proto/<slug>/ 这类 SPA history 路由与未构建的 proto。
  await sendFile(res, SPA_FALLBACK, 'text/html; charset=utf-8', isHead)
}

createServer(handleRequest).listen(PORT, HOST, () => {
  const isPublic = HOST === '0.0.0.0' || HOST === '::' || HOST === ''
  const local = HOST === '0.0.0.0' || HOST === '::' || HOST === '' ? 'localhost' : HOST
  console.log(`  ➜  Local:   http://${local}:${PORT}/`)
  if (isPublic) {
    // 打印本机各网卡地址,供远程开发机直接点击访问。
    for (const addr of getLanAddresses()) {
      console.log(`  ➜  Network: http://${addr}:${PORT}/`)
    }
  }
  console.log(`  ➜  Protos:  http://localhost:${PORT}/p/<slug>/   (各原型预览)`)
  console.log(`Serving ${STATIC_ROOT}`)
})
