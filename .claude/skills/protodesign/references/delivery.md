# 交付模板

本文件是 `/protodesign` 交付环节的固定格式。交付发生在快检绿了之后,**不等待任何 LLM 评审**。

## 一、模板

```text
cd protos/<slug> && make run
(web / 桌面)访问 http://localhost:5173;并行开发用 make run PORT=<端口>
(mobile)默认起 Chrome 预览;真机 / 模拟器用 make run DEVICE=<设备 id>

做了什么:<一句话:新建 / 修改了哪些页面与交互,契约有哪些实体>

本轮交互方向与关键决策:<若本次触发 researcher 调研:采用的方向 + developer 在实现中的关键取舍;未触发则删除此行>

本轮检查:
- make quick-component:通过(或未配置组件测试)
- make quick-check:通过(tests/smoke + tests/quick)
- make quick-check SPECS="..." GREP="...":通过(<列出 spec / area>)
- 未跑:全量校准、完整评审

这版你先看。需要完整验收时:
- /protodesign-review —— 深色 / 排版 / a11y / 反模式 / 桌面壳能力
- /protodesign-verify —— 全量校准(双引擎 + 全部 spec + 像素基线)
```

## 二、必须写清的四个事实

| 项 | 为什么 |
| --- | --- |
| 运行命令与真实端口 | 端口可能被占用而自动后移,写实际地址 |
| 本轮做了什么 | 让用户知道交付范围 |
| **本轮交互方向与关键决策** | 让用户知道方向依据与开发中的关键取舍;未触发调研时省略 |
| **本轮跑了哪些检查、哪些没跑** | 让用户知道结论的边界,防止误以为已完整验收 |

如果本次改动影响全局(主题 / 通用布局 / i18n),额外加一句:

> 本次改动影响全局,快检只覆盖了通用冒烟与 <spec 列表>;建议跑一次 `/protodesign-verify`。

## 三、不要做

- 不交付截图,不铺陈代码讲解;
- 不说"已经完整验收""所有页面都正常" —— 快检不覆盖这些;
- 不因为"想确认"而自动跑全量或派评审 SubAgent;
- 不在用户没有要求时执行 `/protodesign-review` 或 `/protodesign-verify`。
