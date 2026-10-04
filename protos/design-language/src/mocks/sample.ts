// 样例记录的内置 dummy 数据:贴近真实业务的文案与字段,不用 lorem ipsum。
// 刷新即重置,不做任何持久化。
import type { SampleRecord } from '../api/sample.types'

export const SAMPLE_RECORDS: readonly SampleRecord[] = [
  {
    id: 'DL-1042',
    title: '按钮圆角统一到 radius-md',
    owner: '林知远',
    status: 'active',
    updatedAt: '2026-09-28',
  },
  {
    id: 'DL-1039',
    title: '表格行高与信息密度对齐',
    owner: '周砚',
    status: 'paused',
    updatedAt: '2026-09-25',
  },
  {
    id: 'DL-1031',
    title: '深色模式下强调色对比度复核',
    owner: '许清和',
    status: 'active',
    updatedAt: '2026-09-21',
  },
  {
    id: 'DL-1024',
    title: '空态插画风格收敛',
    owner: '沈砚青',
    status: 'archived',
    updatedAt: '2026-09-16',
  },
]
