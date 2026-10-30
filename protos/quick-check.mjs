#!/usr/bin/env node
// 日常快检入口:在原型目录内由 make quick-check 调用。
//
// 设计目标:
//   1. 先跑仓库级通用冒烟(秒级),再跑 tests/quick 或 SPECS 指定的断言;
//   2. 硬预算(默认 90 秒),超时即失败 —— 不做后台轮询,不把长跑拖进开发回路;
//   3. AUTO=1 时读 tests/impact-map.json,按 git diff 自动选 area,避免整文件全量。
//
// 只依赖 Node 标准库与仓库内 Playwright,不引入额外运行时。
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const cwd = process.cwd()
const env = process.env
const timeoutMs = Number(env.QUICK_TIMEOUT ?? '90') * 1000
const quickDir = env.QUICK_DIR ?? 'tests/quick'
const maxFailures = env.MAX_FAILURES ?? '5'
const lastFailed = ['1', 'true', 'yes'].includes((env.LAST_FAILED ?? '').toLowerCase())
const auto = ['1', 'true', 'yes'].includes((env.AUTO ?? '').toLowerCase())

function log(message) {
  console.log(`quick-check: ${message}`)
}

function fail(message, code = 1) {
  console.error(`quick-check: ${message}`)
  process.exit(code)
}

// 把 * / ** 转成正则;只处理路径匹配所需的两种通配符。
function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function gitChangedFiles() {
  let root
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return { root: null, files: [] }
  }
  const protoRel = relative(root, cwd)
  const collect = (args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }
  const tracked = collect(['diff', '--name-only', 'HEAD', '--', protoRel])
  const untracked = collect(['ls-files', '--others', '--exclude-standard', '--', protoRel])
  const prefix = protoRel === '' ? '' : `${protoRel}/`
  return {
    root,
    files: [...new Set([...tracked, ...untracked])]
      .filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length)),
  }
}

// AUTO 模式:从 impact map 找本次改动命中的 area。
function resolveAutoSelection() {
  const mapPath = join(cwd, 'tests/impact-map.json')
  if (!existsSync(mapPath)) {
    log(`AUTO=1 但 ${relative(cwd, mapPath)} 不存在,回退到全部 ${quickDir}`);
    return { areas: [], grep: '' }
  }
  let map
  try {
    map = JSON.parse(readFileSync(mapPath, 'utf8'))
  } catch (error) {
    log(`impact-map.json 解析失败,回退到全部 ${quickDir}: ${error.message}`)
    return { areas: [], grep: '' }
  }
  const { files } = gitChangedFiles()
  if (files.length === 0) {
    log(`未检测到改动,回退到全部 ${quickDir}`)
    return { areas: [], grep: '' }
  }
  const rules = Array.isArray(map.rules) ? map.rules : []
  const areas = new Set()
  for (const rule of rules) {
    const patterns = (rule.paths ?? []).map(globToRegExp)
    if (files.some((file) => patterns.some((pattern) => pattern.test(file)))) {
      areas.add(rule.area)
    }
  }
  const selected = [...areas].filter(Boolean)
  if (selected.length === 0) {
    log(`改动未命中 impact map,回退到全部 ${quickDir}: ${files.join(', ')}`)
    return { areas: [], grep: '' }
  }
  log(`AUTO 选中 area: ${selected.join(', ')}`)
  return { areas: selected, grep: `@area:(${selected.join('|')})` }
}

function runPlaywright(label, args, budgetMs = timeoutMs) {
  const started = Date.now()
  const pnpm = env.PNPM ?? 'pnpm'
  log(`${label}: ${pnpm} exec playwright test ${args.join(' ')}`)
  const result = spawnSync(pnpm, ['exec', 'playwright', 'test', ...args], {
    cwd,
    env: {
      ...env,
      SMOKE: '1',
      DEV_COMMAND: env.DEV_COMMAND ?? `pnpm dev --host 127.0.0.1 --port ${env.PORT ?? '5173'}`,
    },
    stdio: 'inherit',
    timeout: budgetMs,
    killSignal: 'SIGKILL',
  })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL') {
    fail(`${label} 超过 ${Math.round(budgetMs / 1000)} 秒预算(选中范围太宽?缩小 GREP / SPECS 后重试)`)
  }
  if (result.error) fail(`${label} 启动失败: ${result.error.message}`)
  if (result.status !== 0) fail(`${label} 失败(退出码 ${result.status},耗时 ${seconds}s)`, result.status ?? 1)
  log(`${label} 通过(${seconds}s)`)
}

// 整条快检共用一个 90 秒预算,避免 smoke + quick 各自超时把总时长翻倍。
const deadline = Date.now() + timeoutMs
const remaining = () => Math.max(1000, deadline - Date.now())

const smokeArgs = ['--project=smoke', 'tests/smoke', '--reporter=line']
runPlaywright('通用冒烟', smokeArgs, remaining())

let specs = (env.SPECS ?? '').trim()
let grep = (env.GREP ?? '').trim()
if (!specs) {
  if (!existsSync(join(cwd, quickDir))) {
    log(`${quickDir} 不存在,跳过功能快检(只跑了通用冒烟)`)
    process.exit(0)
  }
  specs = quickDir
  if (!grep && auto) {
    const selection = resolveAutoSelection()
    grep = selection.grep
  }
}

const explicitSpecs = Boolean((env.SPECS ?? '').trim())
const specArgs = specs.split(/\s+/).filter(Boolean)
const projectArgs = explicitSpecs ? ['--project=quick', '--project=chromium'] : ['--project=quick']
const quickArgs = [...projectArgs, ...specArgs, '--reporter=line', `--max-failures=${maxFailures}`]
if (grep) quickArgs.push('--grep', grep)
if (lastFailed) {
  // Playwright 在“没有失败项”时会以 No tests found 退出 1;
  // 这里先读 last-run 状态,没有失败就明确跳过,避免把绿状态误报成失败。
  const lastRunPath = join(cwd, 'test-results', '.last-run.json')
  if (!existsSync(lastRunPath)) {
    log('LAST_FAILED=1 但未找到 test-results/.last-run.json,跳过功能快检')
    process.exit(0)
  }
  const lastRun = JSON.parse(readFileSync(lastRunPath, 'utf8'))
  if (!Array.isArray(lastRun.failedTests) || lastRun.failedTests.length === 0) {
    log('LAST_FAILED=1 且上一轮无失败项,跳过功能快检')
    process.exit(0)
  }
  quickArgs.push('--last-failed')
}
runPlaywright('功能快检', quickArgs, remaining())
