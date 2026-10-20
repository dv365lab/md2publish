import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildXhsZip, collectImageSources, createDomFits, safeFileName, xhsPartCount, xhsZipPaths } from './xhsDom'
import { buildRenderNodes } from './renderers'
import { XHS_FIT_SAFETY } from './xhsLayout'
import { XHS_BODY_BLEED } from './xhsRender'

vi.mock('html2canvas-pro', () => ({ default: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
})

const readBlob = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })

const png = (label: string) => new Blob([label], { type: 'image/png' })

describe('createDomFits', () => {
  it('does not count the shadow bleed padding of the card body as usable height', async () => {
    const bodyHeight = 600
    let flowHeight = 0
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('xhs-body') ? bodyHeight : 0
    })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return { height: this.classList.contains('xhs-flow') ? flowHeight : 0 } as DOMRect
    })
    const { fits, dispose } = await createDomFits({ series: '', author: '', theme: 'paper' }, {})
    const nodes = buildRenderNodes('短段落', 'wechat')
    try {
      flowHeight = bodyHeight - XHS_BODY_BLEED.top - XHS_FIT_SAFETY
      expect(fits(nodes)).toBe(true)
      flowHeight += 1
      expect(fits(nodes)).toBe(false)
    } finally {
      dispose()
    }
  })
})

describe('xhsZipPaths', () => {
  it('keeps a flat layout within one note and groups by 18 beyond that', () => {
    expect(xhsZipPaths(3)).toEqual(['01.png', '02.png', '03.png'])
    const grouped = xhsZipPaths(20)
    expect(grouped[0]).toBe('part1/01.png')
    expect(grouped[17]).toBe('part1/18.png')
    expect(grouped[18]).toBe('part2/01.png')
    expect(grouped[19]).toBe('part2/02.png')
    expect(xhsPartCount(18)).toBe(1)
    expect(xhsPartCount(19)).toBe(2)
  })
})

describe('buildXhsZip', () => {
  it('writes images and a single caption for one note', async () => {
    const zip = await JSZip.loadAsync(await readBlob(await buildXhsZip([png('a'), png('b')], [{ title: '标题', body: '正文' }])))
    expect(Object.keys(zip.files).sort()).toEqual(['01.png', '02.png', 'caption.txt'])
    expect(await zip.file('02.png')!.async('string')).toBe('b')
    expect(await zip.file('caption.txt')!.async('string')).toBe('标题\n\n正文\n')
  })

  it('writes one caption per part when cards exceed the limit', async () => {
    const blobs = Array.from({ length: 4 }, (_, index) => png(String(index)))
    const zip = await JSZip.loadAsync(
      await readBlob(await buildXhsZip(blobs, [{ title: 'A（1/2）', body: 'x' }, { title: 'A（2/2）', body: 'x' }], 3)),
    )
    const files = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()
    expect(files).toEqual(['part1/01.png', 'part1/02.png', 'part1/03.png', 'part1/caption.txt', 'part2/01.png', 'part2/caption.txt'])
    expect(await zip.file('part2/caption.txt')!.async('string')).toBe('A（2/2）\n\nx\n')
  })

  it('preserves all 19 images across the 18-card boundary without overwriting any', async () => {
    const blobs = Array.from({ length: 19 }, (_, index) => png(`card-${index + 1}`))
    const captions = [
      { title: '完整笔记（1/2）', body: '正文' },
      { title: '完整笔记（2/2）', body: '正文' },
    ]
    const zip = await JSZip.loadAsync(await readBlob(await buildXhsZip(blobs, captions)))
    const images = Object.keys(zip.files).filter((name) => name.endsWith('.png'))

    expect(images).toHaveLength(19)
    expect(images.filter((name) => name.startsWith('part1/'))).toHaveLength(18)
    expect(images.filter((name) => name.startsWith('part2/'))).toEqual(['part2/01.png'])
    for (const [index, name] of xhsZipPaths(19).entries()) {
      expect(await zip.file(name)!.async('string')).toBe(`card-${index + 1}`)
    }
    expect(await zip.file('part1/caption.txt')!.async('string')).toBe('完整笔记（1/2）\n\n正文\n')
    expect(await zip.file('part2/caption.txt')!.async('string')).toBe('完整笔记（2/2）\n\n正文\n')
  })
})

describe('helpers', () => {
  it('removes characters that are invalid in file names', () => {
    expect(safeFileName('a/b:c*?"<>|  标题')).toBe('abc 标题')
    expect(safeFileName('///')).toBe('xhs')
  })

  it('collects unique image sources', () => {
    const nodes = buildRenderNodes('![a](x.png)\n\n![b](x.png)\n\n![c](y.png)', 'wechat')
    expect(collectImageSources(nodes)).toEqual(['x.png', 'y.png'])
  })
})
