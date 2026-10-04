#!/usr/bin/env node
// 静态文件服务脚本:以 preview/dist 为静态根,提供本地预览所需的 http 服务。
// 仅使用 node 内建模块(http / net / fs / path / url),不引入外部依赖。
// 映射语义对齐 nginx try_files:实际文件 -> 目录 index.html -> 回退到 preview/dist/index.html(SPA fallback)。
// URL 空间:预览站挂在域名根 —— / 为首页、/assets/... 为 preview 自身构建资源(静态根 assets/)、/proto/... 为详情页 SPA 路由(回退首页);
// protos 统一在 /p/ 下 —— /p/<slug>/... 映射各 proto 构建产物(静态根 p/<slug>/)。
// 端口:从 --port / PORT 指定的端口起,若被占用则自动往后找(A 见 listenWithFallback)。

import { createServer } from 'node:http'
import { createConnection } from 'node:net'
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

// 端口自适应:从起始端口往后找第一个可用端口。
// 上限与 vite 的 20 次重试保持一致。
const MAX_PORT_ATTEMPTS = 20

// 探测端口在本机**回环地址**上是否已被占用。
//
// 为什么不能只靠 listen() 的 EADDRINUSE:本脚本绑的是通配地址 0.0.0.0,
// 当别的进程只占用了 127.0.0.1:<port>(典型例子:SSH 端口转发)时,通配绑定**仍然会成功** ——
// 但 BSD/macOS 会把发往 127.0.0.1 的连接优先投给"地址更具体"的那个绑定,
// 于是 `http://localhost:<port>/` 访问到的不是本服务,而脚本打印的 Local 地址是假的。
// 所以必须单独探测回环端口。
function isLoopbackPortTaken(port) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const done = (taken) => {
      socket.destroy()
      resolvePromise(taken)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(800, () => done(false))
  })
}

// 在指定端口启动监听;失败时以 Error 形式 reject。
function listen(server, port, host) {
  return new Promise((resolvePromise, reject) => {
    const onError = (err) => {
      server.off('listening', onListening)
      reject(err)
    }
    const onListening = () => {
      server.off('error', onError)
      resolvePromise()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

// 依次尝试端口,返回最终可用的端口号。
// 失败原因统一由调用方在成功后汇总打印,避免每个候选端口刷一行。
async function listenWithFallback(server, startPort, host) {
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const port = startPort + attempt
    if (await isLoopbackPortTaken(port)) {
      continue
    }
    try {
      await listen(server, port, host)
      return port
    } catch (err) {
      // 端口被通配地址上的其它进程占用:继续试下一个。
      if (err instanceof Error && err.code === 'EADDRINUSE') continue
      throw err
    }
  }
  throw new Error(`从 ${startPort} 起连续 ${MAX_PORT_ATTEMPTS} 个端口都不可用`)
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

  // /p/ 命名空间下**不做** SPA 回退:那里应当是各原型的真实构建产物,
  // 找不到就是没构建(如本机缺 Flutter SDK 的 mobile 原型)或路径写错了。
  // 若在此回退,返回的是 preview 自己的 index.html,在浏览器里表现为一片空白,
  // 掩盖了真实原因,排查起来很费劲 —— 必须显式 404。
  if (pathname.startsWith('/p/')) {
    send404(res)
    return
  }

  // 其余未知路径回退到 preview 首页,覆盖 /proto/<slug> 这类 SPA history 路由。
  await sendFile(res, SPA_FALLBACK, 'text/html; charset=utf-8', isHead)
}

// 启动:端口被占用时自动往后找,打印的地址一定是真实可用的那一个。
const server = createServer(handleRequest)
listenWithFallback(server, PORT, HOST)
  .then((port) => {
    if (port !== PORT) {
      console.warn(`  ⚠ 起始端口 ${PORT} 已被占用,已自动改用 ${port}`)
      console.warn(`  ⚠ 如需固定端口,请先释放占用方(make run PORT=<其他端口> 亦可)`)
    }
    const isPublic = HOST === '0.0.0.0' || HOST === '::' || HOST === ''
    const local = HOST === '0.0.0.0' || HOST === '::' || HOST === '' ? 'localhost' : HOST
    console.log(`  ➜  Local:   http://${local}:${port}/`)
    if (isPublic) {
      // 打印本机各网卡地址,供远程开发机直接点击访问。
      for (const addr of getLanAddresses()) {
        console.log(`  ➜  Network: http://${addr}:${port}/`)
      }
    }
    console.log(`  ➜  Protos:  http://localhost:${port}/p/<slug>/   (各原型预览)`)
    console.log(`Serving ${STATIC_ROOT}`)
  })
  .catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
