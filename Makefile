# 根 Makefile:一键本地预览全部 protos(聚合 -> 统一构建 -> 静态 serve)。
# 可覆盖变量:make run PORT=8080 / HOST=localhost 或设置对应环境变量覆盖默认值。

HOST ?= 0.0.0.0
PORT ?= 5173
PNPM ?= pnpm

.PHONY: deps run build serve list help

# 安装 preview 与全部原型的依赖(新克隆的仓库先跑一次)。
# 各原型装什么由 Make.def / Make.def.flutter 定义,这里只负责遍历调用,不重复实现。
deps: ## 安装 preview 与全部原型的依赖(新克隆后先跑一次)
	cd preview && $(PNPM) install
	@for d in protos/*/; do \
	  [ -f "$$d/Makefile" ] || continue; \
	  echo "==> $$d"; \
	  $(MAKE) -C "$$d" deps || exit 1; \
	done

# 一键启动:聚合 -> 统一构建 -> 静态 serve(HOST/PORT 透传给 serve)
run: build ## 一键启动:聚合 -> 构建 -> 静态 serve(HOST/PORT 可覆盖)
	node scripts/serve.mjs --host $(HOST) --port $(PORT)

# 仅聚合 + 统一构建,不启动服务
build: ## 仅聚合 + 统一构建,不启动服务
	node scripts/aggregate.mjs
	node scripts/build.mjs

# 先 build,再启动静态 serve
serve: build ## 先 build,再启动静态 serve
	node scripts/serve.mjs --host $(HOST) --port $(PORT)

# 打印 registry 摘要(各 proto 的 slug / name / owner / updated_at)
list: ## 打印 registry 摘要(slug / name / owner / updated_at)
	@node --input-type=module -e "import { readFile } from 'node:fs/promises'; try { const r = JSON.parse(await readFile('preview/src/generated/protos-registry.json', 'utf8')); console.log('total protos: ' + r.protos.length); for (const p of r.protos) console.log(p.slug + '\t' + p.name + '\t' + p.owner + '\t' + p.updated_at) } catch (err) { console.error('registry not found, run: make build'); process.exit(1) }"

help: ## 显示本帮助
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
