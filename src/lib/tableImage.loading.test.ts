import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('html2canvas-pro')
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('table image renderer loading', () => {
  it('renders four tables and copies an individual PNG without loading modules after initialization', async () => {
    vi.resetModules()
    let allowModuleLoad = true
    const png = new Blob(['table image'], { type: 'image/png' })
    const targets: HTMLElement[] = []
    const toDataURL = vi.fn()
      .mockReturnValueOnce('data:image/png;base64,table1')
      .mockReturnValueOnce('data:image/png;base64,table2')
      .mockReturnValueOnce('data:image/png;base64,table3')
      .mockReturnValueOnce('data:image/png;base64,table4')
    const toBlob = vi.fn((callback: BlobCallback) => callback(png))
    const renderer = vi.fn(async (target: HTMLElement) => {
      expect(target.isConnected).toBe(true)
      targets.push(target)
      return { toDataURL, toBlob }
    })
    const loadRenderer = vi.fn(() => {
      if (!allowModuleLoad) {
        throw new TypeError('Failed to fetch dynamically imported module')
      }
      return { default: renderer }
    })
    vi.doMock('html2canvas-pro', loadRenderer)

    const { copyTableAsImage, renderTablesAsDataUrls } = await import('./tableImage')
    allowModuleLoad = false

    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal('ClipboardItem', class {
      items: Record<string, Blob>

      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    })
    const tables = Array.from({ length: 4 }, (_, index) => ({
      header: ['设备', '端口'],
      rows: [[`EP_${index}`, `DP_${index}`]],
    }))

    await expect(renderTablesAsDataUrls(tables)).resolves.toEqual([
      'data:image/png;base64,table1',
      'data:image/png;base64,table2',
      'data:image/png;base64,table3',
      'data:image/png;base64,table4',
    ])
    await copyTableAsImage(tables[0])

    expect(loadRenderer).toHaveBeenCalledTimes(1)
    expect(renderer).toHaveBeenCalledTimes(5)
    expect(toDataURL).toHaveBeenCalledTimes(4)
    expect(toDataURL).toHaveBeenCalledWith('image/png')
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(write).toHaveBeenCalledWith([
      expect.objectContaining({ items: { 'image/png': png } }),
    ])
    expect(targets.every((target) => !target.isConnected)).toBe(true)
    expect(document.body.childElementCount).toBe(0)
  })
})
