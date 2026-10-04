#!/usr/bin/env node
// 统一构建脚本:先构建 preview 站点(base=/),再遍历 registry 逐个构建各 proto(base=/p/<slug>/)。
// 顺序必须如此:preview 的 outDir(preview/dist)位于其项目 root 内,Vite 默认 emptyOutDir=true 会整体清空 dist;
// 若先构建各 proto 再构建 preview,清空会把已产出的 p/<slug> 一并删除。故先构建 preview(清空无碍),再逐 proto 写入 dist/p/<slug>。
// mobile 原型(Flutter)与 web 原型不同:构建前必须先跑该原型的契约生成(make contracts),
// 因为 Dart 类型是生成物且被源码直接 import,缺了它 dart2js 编译必失败。
// 仅使用 node 内建模块(fs / path / child_process),不引入外部依赖。

import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 仓库根:本脚本位于 scripts/ 下,上一级即仓库根。
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_PATH = join(ROOT, 'preview', 'src', 'generated', 'protos-registry.json')
// 构建计划:记录本次**确实构建出产物**的 slug,供预览站判断哪些链接是活的。
const BUILD_PLAN_PATH = join(ROOT, 'preview', 'src', 'generated', 'build-plan.json')
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

// spawn flutter CLI 构建 web 产物,mobile 原型的构建方式与 vite 不同。
// 需要本机装有 Flutter SDK;缺失时由 spawn 的 error 事件上报。
function runFlutterBuild(cwd, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('flutter', ['build', 'web', ...args], {
      cwd,
      stdio: 'inherit',
    })
    child.on('error', (err) => reject(err))
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`flutter build web exited with code ${code}`))
    })
  })
}

// spawn 子目录的 make 目标,复用原型 Makefile 里已有的生成逻辑(如 contracts)。
// 生成规则只写在 Make.def.flutter 一处,本脚本不重复实现;失败时由调用方打印上下文。
function runMakeTarget(cwd, target) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('make', [target], {
      cwd,
      stdio: 'inherit',
    })
    child.on('error', (err) => reject(err))
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`make ${target} exited with code ${code}`))
    })
  })
}

// spawn pnpm install,补齐项目依赖。
function runPnpmInstall(cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('pnpm', ['install'], {
      cwd,
      stdio: 'inherit',
    })
    child.on('error', (err) => reject(err))
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`pnpm install exited with code ${code}`))
    })
  })
}

// 校验并补齐项目依赖:node_modules 缺失时自动安装,已安装则直接返回。
// 原型目录统一走各自的 `make deps`(web/桌面与 mobile 装的内容不同,定义在 Make.def 系),
// preview 站不是原型、没有 Makefile,回退到 pnpm install。安装失败即终止,不带着残缺依赖继续构建。
async function ensureDeps(projectDir, label) {
  if (existsSync(join(projectDir, 'node_modules'))) return
  console.log(`[build] ${label} 缺少 node_modules,自动安装依赖...`)
  try {
    if (existsSync(join(projectDir, 'Makefile'))) await runMakeTarget(projectDir, 'deps')
    else await runPnpmInstall(projectDir)
    console.log(`[build] ${label} 依赖安装完成`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Error: ${label} 依赖安装失败: ${message}`)
    process.exit(1)
  }
}

async function main() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error(`Error: registry not found at ${REGISTRY_PATH}, run node scripts/aggregate.mjs first`)
    process.exit(1)
  }
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
  const protos = Array.isArray(registry.protos) ? registry.protos : []
  if (protos.length === 0) console.warn('[build] registry has no proto, only preview will be built')

  // 读取构建计划(由 aggregate.mjs 产出)。它必须在构建 preview 之前就存在:
  // 预览站要据此知道哪些原型**确实有产物**,否则「在新标签打开」会指向不存在的路径 ——
  // 静态服务对未知路径做了 SPA 回退,返回的是预览站自己的 index.html,打开后一片空白。
  if (!existsSync(BUILD_PLAN_PATH)) {
    console.error(`Error: build plan not found at ${BUILD_PLAN_PATH}, run node scripts/aggregate.mjs first`)
    process.exit(1)
  }
  const buildPlan = JSON.parse(readFileSync(BUILD_PLAN_PATH, 'utf8'))
  const buildableSlugs = new Set(Array.isArray(buildPlan.built) ? buildPlan.built : [])
  const flutterAvailable = buildPlan.flutter_available === true

  // 计划中未列入的原型:给出原因并继续,不让整站构建失败。
  for (const proto of protos) {
    if (proto === null || typeof proto !== 'object') continue
    if (typeof proto.dir !== 'string' || typeof proto.slug !== 'string') continue
    if (buildableSlugs.has(proto.slug)) continue
    console.warn(
      `[build] 跳过 ${proto.dir}:本机没有可用的 Flutter SDK(mobile 原型需要它)。\n` +
        '        安装后重跑 make build 即可把该原型纳入预览站。',
    )
  }

  // 构建 preview 站点:此刻 dist 尚无 p/ 产物,Vite 整体清空 dist 无碍(旧批次遗留的 p/ 也会一并清除)。
  const previewDir = join(ROOT, 'preview')
  await ensureDeps(previewDir, 'preview')
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
    const isMobile = Array.isArray(proto.targets) && proto.targets.includes('mobile')

    if (isMobile) {
      // Flutter(mobile)载体:先生成契约(Dart 类型),再构建 web 产物,最后把 build/web 整体拷到 dist/p/<slug>。
      // 契约生成物 lib/contracts/generated 不入库,而 Dart 源码直接 import 它 —— 不先生成则 dart2js 编译必失败。
      // 这里复用子目录 Makefile 的 contracts 目标(与该原型 `build: contracts` 的前置同源),不在本脚本里重复实现生成逻辑;
      // 因此与 web 原型不同,mobile 原型即使不走 vite 也需要契约工具链的 node_modules。
      // 构建产物默认落在 proto 自己的 build/web,不直接用 --output,避免依赖该 flag 的行为。
      // 本机无 Flutter 时该原型已在构建计划阶段被排除(上面已告警),此处直接跳过。
      if (!flutterAvailable) continue
      await ensureDeps(protoDir, dir)
      try {
        await runMakeTarget(protoDir, 'contracts')
        console.log(`[build] ${dir} contracts -> lib/contracts/generated (ok)`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${dir} contracts failed: ${message}`)
        process.exit(1)
      }
      try {
        rmSync(protoOutDir, { recursive: true, force: true })
        mkdirSync(protoOutDir, { recursive: true })
        await runFlutterBuild(protoDir, ['--base-href', `/p/${slug}/`])
        cpSync(join(protoDir, 'build', 'web'), protoOutDir, { recursive: true })
        console.log(`[build] ${dir} (flutter) -> ${relative(ROOT, protoOutDir)} (ok)`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${dir} flutter build failed: ${message}`)
        process.exit(1)
      }
      continue
    }

    await ensureDeps(protoDir, dir)
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
