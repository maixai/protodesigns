#!/usr/bin/env node
// 聚合脚本:扫描 protos/ 下各原型目录的 meta.md,生成 preview/src/generated/protos-registry.json。
// 仅使用 node 内建模块(fs / path / child_process),不引入外部依赖。

import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

// 仓库根:本脚本位于 scripts/ 下,上一级即仓库根。
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROTOS_DIR = join(ROOT, 'protos')
const REGISTRY_PATH = join(ROOT, 'preview', 'src', 'generated', 'protos-registry.json')

// meta.md 必填字段(仅校验非空,不校验格式)。
const REQUIRED_FIELDS = ['name', 'description', 'owner', 'owner_email']
// URL-safe 目录名:仅允许小写字母、数字与连字符。
const URL_SAFE_RE = /^[a-z0-9-]+$/

// 解析 meta.md 的扁平 YAML frontmatter(--- 包裹,key: value 按首个冒号切分)。
// 无法解析出合法 frontmatter 时返回 null。
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/)
  // 跳过文件开头的空行,frontmatter 起始于首个非空行的 ---。
  let start = 0
  while (start < lines.length && lines[start].trim() === '') start++
  if (start >= lines.length || lines[start].trim() !== '---') return null

  // 找到闭合的 ---。
  let end = start + 1
  while (end < lines.length && lines[end].trim() !== '---') end++
  if (end >= lines.length) return null

  const meta = {}
  for (let i = start + 1; i < end; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key !== '') meta[key] = value
  }
  return meta
}

// 同步执行 git 命令,成功且有非空输出时返回首行去空白文本,否则返回 null。
function runGit(args, cwd) {
  try {
    const stdout = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const line = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l !== '')
    return line || null
  } catch {
    return null
  }
}

// 计算目录最近更新时间:目录自带 .git 时取目录内最近 commit,
// 否则取外层仓库对该目录路径的最近 commit;均无历史时退回目录 mtime(ISO 格式)。
function computeUpdatedAt(protoDir, relDir) {
  let gitTime = null
  if (existsSync(join(protoDir, '.git'))) {
    gitTime = runGit(['log', '-1', '--format=%ci'], protoDir)
  } else {
    gitTime = runGit(['log', '-1', '--format=%ci', '--', relDir], ROOT)
  }
  if (gitTime) return gitTime
  return statSync(protoDir).mtime.toISOString()
}

function main() {
  if (!existsSync(PROTOS_DIR)) {
    console.error(`Error: protos directory not found: ${PROTOS_DIR}`)
    process.exit(1)
  }

  // 扫描 protos/ 下子目录:跳过隐藏目录与文件(如 Make.def)。
  const dirs = readdirSync(PROTOS_DIR, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const protos = []
  for (const dir of dirs) {
    const protoDir = join(PROTOS_DIR, dir)
    const relDir = join('protos', dir)
    const metaPath = join(protoDir, 'meta.md')

    if (!existsSync(metaPath)) {
      console.error(`Error: ${relDir} 缺少 meta.md`)
      process.exit(1)
    }

    const meta = parseFrontmatter(readFileSync(metaPath, 'utf8'))
    if (!meta) {
      console.error(`Error: ${relDir} 的 meta.md 缺少合法 frontmatter`)
      process.exit(1)
    }

    // 校验必填字段:缺任一字段时报错并指明目录与字段。
    const missing = REQUIRED_FIELDS.filter((field) => !meta[field])
    if (missing.length > 0) {
      console.error(`Error: ${relDir} 缺少必填字段: ${missing.join(', ')}`)
      process.exit(1)
    }

    // slug 可选,缺省取目录名;目录名含非 URL-safe 字符且未显式提供 slug 时报错。
    const slug = meta.slug || dir
    if (!meta.slug && !URL_SAFE_RE.test(dir)) {
      console.error(`Error: ${relDir} 目录名含非 URL-safe 字符且未显式提供 slug`)
      process.exit(1)
    }

    protos.push({
      name: meta.name,
      slug,
      description: meta.description,
      owner: meta.owner,
      owner_email: meta.owner_email,
      updated_at: computeUpdatedAt(protoDir, relDir),
      dir: relDir,
    })
  }

  const registry = {
    generated_at: new Date().toISOString(),
    protos,
  }

  // 确保输出目录存在并写入 registry(输出路径在 preview/ 下,属运行时产物)。
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true })
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  console.log(`Registry written to ${REGISTRY_PATH} (${protos.length} protos)`)
}

main()
