import { beforeAll } from 'vitest'
import { preview } from './preview'

// CSF 工厂与旧式 stories 共用配置的组合生命周期,避免各文件创建隔离的 preview。
beforeAll(preview.composed.beforeAll)
