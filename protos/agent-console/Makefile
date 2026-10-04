# 本原型固定使用 5173 之外的起始端口:本机 127.0.0.1:5173 可能被 SSH 端口转发等
# 只绑回环的进程占用,而 vite / playwright 探测的是回环地址,会把占用方误判为已有服务。
# 仍可用 make run PORT=<端口> / make calibrate PORT=<端口> 覆盖。
PORT ?= 5185
# 必须 export:playwright.config 从环境变量读取 PORT 拼 BASE_URL,
# 否则它按默认 5173 轮询,而 dev server 跑在 5185,必然等超时。
export PORT

include ../Make.def
