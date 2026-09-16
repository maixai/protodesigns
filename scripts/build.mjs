#!/usr/bin/env node
// 统一构建脚本:先构建 preview 站点(base=/),再遍历 registry 逐个构建各 proto(base=/p/<slug>/)。
// 顺序必须如此:preview 的 outDir(preview/dist)位于其项目 root 内,Vite 默认 emptyOutDir=true 会整体清空 dist;
// 若先构建各 proto 再构建 preview,清空会把已产出的 p/<slug> 一并删除。故先构建 preview(清空无碍),再逐 proto 写入 dist/p/<slug>。
// 仅使用 node 内建模块(fs / path / child_process),不引入外部依赖。

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 仓库根:本脚本位于 scripts/ 下,上一级即仓库根。
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_PATH = join(ROOT, 'preview', 'src', 'generated', 'protos-registry.json')
const DIST_ROOT = join(ROOT, 'preview', 'dist')

// spawn 项目自带的 vite CLI(pnpm exec vite build),stdout/stderr 透传终端。
// 退出码非 0 时 reject,由调用方负责打印错误并终止。
function runViteBuild(cwd, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('pnpm', ['exec', 'vite', 'build', ...args], {
      cwd,
      stdio: 'inherit',
    })
    child.on('error', (err) => reject(err))
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`vite build exited with code ${code}`))
    })
  })
}

// 校验项目依赖已安装(node_modules 存在),缺失时打印安装提示并退出。
function ensureDeps(projectDir, installHint) {
  if (existsSync(join(projectDir, 'node_modules'))) return
  console.error(`Error: ${projectDir} missing node_modules, run: ${installHint}`)
  process.exit(1)
}

async function main() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error(`Error: registry not found at ${REGISTRY_PATH}, run node scripts/aggregate.mjs first`)
    process.exit(1)
  }
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
  const protos = Array.isArray(registry.protos) ? registry.protos : []
  if (protos.length === 0) console.warn('[build] registry has no proto, only preview will be built')

  // 先构建 preview 站点:此刻 dist 尚无 p/ 产物,Vite 整体清空 dist 无碍(旧批次遗留的 p/ 也会一并清除)。
  const previewDir = join(ROOT, 'preview')
  ensureDeps(previewDir, 'cd preview && pnpm install')
  try {
    await runViteBuild(previewDir, ['--base', '/', '--outDir', DIST_ROOT, '--emptyOutDir'])
    console.log(`[build] preview -> ${relative(ROOT, DIST_ROOT)} (ok)`)
  } catch (err) {
    console.error(`Error: preview build failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // 再逐个构建各 proto:任一失败即终止,不继续后续 proto。
  for (const proto of protos) {
    if (proto === null || typeof proto !== 'object') {
      console.error('Error: registry entry is not a valid object')
      process.exit(1)
    }
    const { slug, dir } = proto
    if (typeof slug !== 'string' || typeof dir !== 'string') {
      console.error('Error: registry entry missing slug or dir')
      process.exit(1)
    }
    const protoDir = resolve(ROOT, dir)
    const protoOutDir = join(DIST_ROOT, 'p', slug)
    ensureDeps(protoDir, `cd ${dir} && pnpm install`)
    // 确保输出目录存在;--emptyOutDir 只清空该 proto 自己的 outDir,不影响 preview 产物与其它 proto。
    mkdirSync(protoOutDir, { recursive: true })
    try {
      await runViteBuild(protoDir, ['--base', `/p/${slug}/`, '--outDir', protoOutDir, '--emptyOutDir'])
      console.log(`[build] ${dir} -> ${relative(ROOT, protoOutDir)} (ok)`)
    } catch (err) {
      console.error(`Error: ${dir} build failed: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
