// 强类型 API 层:函数签名即"规范化 API 设计",供后续真实开发参考。
// 数据来自内置 dummy,通过 delay() 模拟 150-300ms 网络往返;不引入 MSW。
import { delay } from '../mocks/delay'
import { SAMPLE_RECORDS } from '../mocks/sample'
import type { Result } from './result'
import type { SampleRecord } from './sample.types'

// 演示场景:让"四态"能被真实驱动,而不是靠组件里写假的 loading 分支。
export type SampleScenario = 'normal' | 'empty' | 'error'

// 拉取样例记录。业务失败走 Result 的失败分支,不抛异常。
export async function fetchSamples(
  scenario: SampleScenario = 'normal',
): Promise<Result<SampleRecord[]>> {
  await delay()

  if (scenario === 'error') {
    return { ok: false, error: new Error('样例数据加载失败,请稍后重试') }
  }
  if (scenario === 'empty') {
    return { ok: true, value: [] }
  }
  return { ok: true, value: [...SAMPLE_RECORDS] }
}
