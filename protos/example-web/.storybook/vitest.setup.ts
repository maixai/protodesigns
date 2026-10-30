import { setProjectAnnotations } from '@storybook/vue3-vite'
import * as projectAnnotations from './preview'

// 让 Vitest 直接跑 stories 时也加载 Storybook 的 preview 配置。
setProjectAnnotations([projectAnnotations])
