import { setProjectAnnotations } from '@storybook/vue3-vite'
import * as projectAnnotations from './preview'

// Vitest 直接跑 stories 时不会加载 Storybook 的 preview 初始化;
// 这一步把 decorators / parameters / global 配置注入 renderer。
setProjectAnnotations([projectAnnotations])
