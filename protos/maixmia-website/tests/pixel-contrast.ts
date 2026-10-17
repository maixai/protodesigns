import type { Locator } from '@playwright/test'

// 从真实截图逐像素取样:最多的颜色为底色,最接近计算文字色的实际像素为笔画实心区。
// 抗锯齿边缘本就与底色混合,不把边缘当作文字固有色;同时返回距离以防空图假通过。
export async function sampleTextContrast(target: Locator): Promise<
  Record<'foreground' | 'background', number[]> & Record<'inkDistance' | 'ratio', number>
> {
  const image = (await target.screenshot({ animations: 'disabled', scale: 'css' })).toString('base64')
  return target.evaluate(async (element, base64) => {
    const picture = new Image()
    picture.src = `data:image/png;base64,${base64}`
    await picture.decode()
    const canvas = document.createElement('canvas')
    canvas.width = picture.width
    canvas.height = picture.height
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('Canvas unavailable')
    context.fillStyle = getComputedStyle(element).color
    context.fillRect(0, 0, 1, 1)
    const expected = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
    context.drawImage(picture, 0, 0)
    const pixels = context.getImageData(0, 0, picture.width, picture.height).data
    const counts = new Map<string, number>()
    const closest = { distance: Infinity, color: [0, 0, 0] }
    const offsets = Array.from({ length: pixels.length / 4 }, (_, index) => index * 4)
    for (const index of offsets) {
      const color = [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0]
      const key = color.join(',')
      counts.set(key, (counts.get(key) ?? 0) + 1)
      const distance = Math.hypot(...color.map((channel, channelIndex) => channel - (expected[channelIndex] ?? 0)))
      if (distance < closest.distance) { closest.distance = distance; closest.color = color }
    }
    const background = [...counts].sort((left, right) => right[1] - left[1])[0]?.[0].split(',').map(Number) ?? []
    const luminance = (color: number[]): number => color.reduce((sum, channel, index) => {
      const normalized = channel / 255
      const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      return sum + linear * ([0.2126, 0.7152, 0.0722][index] ?? 0)
    }, 0)
    const front = luminance(closest.color)
    const back = luminance(background)
    return { foreground: closest.color, background, inkDistance: closest.distance, ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05) }
  }, image)
}
