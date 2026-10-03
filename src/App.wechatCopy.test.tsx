import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { renderTablesAsDataUrls } from './lib/tableImage'

vi.mock('./lib/tableImage', async () => {
  const actual = await vi.importActual<typeof import('./lib/tableImage')>('./lib/tableImage')
  return {
    ...actual,
    renderTablesAsDataUrls: vi.fn(),
    copyTableAsImage: vi.fn().mockResolvedValue(undefined),
  }
})

class ClipboardItemMock {
  items: Record<string, Blob>

  constructor(items: Record<string, Blob>) {
    this.items = items
  }
}

const readBlobText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
  reader.addEventListener('error', () => reject(reader.error))
  reader.readAsText(blob)
})

const longArticle = `### Q001\n\n${'甲'.repeat(25000)}\n\n| 第一表 | 内容 |\n| --- | --- |\n| 前篇 | one |\n\n### Q181\n\n**A181**\n\n${'乙'.repeat(25000)}\n\n| 第二表 | 内容 |\n| --- | --- |\n| 后篇 | two |\n\n全文最后一句。`

const enterArticle = (markdown = longArticle) => {
  render(<App />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: markdown } })
}

const wechatPanel = () => within(screen.getByRole('heading', { name: '微信公众号版' }).closest('article')!)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ClipboardItem', ClipboardItemMock)
  Object.assign(navigator, {
    clipboard: {
      write: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
  vi.mocked(renderTablesAsDataUrls).mockReset().mockImplementation(async (tables) =>
    tables.map((_, index) => `data:image/png;base64,dGFibGUt${index + 1}`),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WeChat article copy capacity', () => {
  it.each([false, true])('copies complete selected parts in rich text and plain text (immersive=%s)', async (immersive) => {
    enterArticle()
    if (immersive) fireEvent.click(wechatPanel().getByRole('button', { name: '整屏查看' }))
    const surface = immersive ? within(screen.getByRole('dialog')) : wechatPanel()
    expect(surface.queryByRole('combobox', { name: '微信公众号复制篇章' })).not.toBeNull()
    expect(surface.getByText(/45,000/)).toBeVisible()
    expect(surface.getByText(/不同的新文章/)).toBeVisible()
    expect(surface.getByRole('combobox', { name: '微信公众号复制篇章' })).toHaveValue('0')
    expect(surface.getByTestId(immersive ? 'immersive-output' : 'wechat-output')).toHaveTextContent('全文最后一句。')

    fireEvent.click(surface.getByRole('button', { name: '复制第 1/2 篇' }))
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const firstPayload = vi.mocked(navigator.clipboard.write).mock.calls[0][0][0] as unknown as ClipboardItemMock
    expect(Object.keys(firstPayload.items)).toEqual(['text/html', 'text/plain'])
    const firstHtml = await readBlobText(firstPayload.items['text/html'])
    const firstText = await readBlobText(firstPayload.items['text/plain'])
    expect(firstHtml).toContain('Q001')
    expect(firstHtml).not.toContain('A181')
    expect(firstText).toContain('甲'.repeat(25000))
    expect(firstText).toContain('前篇')
    expect(firstText).not.toContain('A181')
    expect(surface.getByRole('status')).toHaveTextContent('已复制第 1/2 篇')
    expect(surface.getByRole('status')).toHaveTextContent(/新.*文章/)

    fireEvent.change(surface.getByRole('combobox', { name: '微信公众号复制篇章' }), { target: { value: '1' } })
    fireEvent.click(surface.getByRole('button', { name: '复制第 2/2 篇' }))
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(2))
    const secondPayload = vi.mocked(navigator.clipboard.write).mock.calls[1][0][0] as unknown as ClipboardItemMock
    const secondHtml = await readBlobText(secondPayload.items['text/html'])
    const secondText = await readBlobText(secondPayload.items['text/plain'])
    expect(secondHtml).toContain('A181')
    expect(secondHtml).toContain('全文最后一句。')
    expect(secondHtml).not.toContain('Q001')
    expect(secondText).toContain('A181')
    expect(secondText).toContain('乙'.repeat(25000))
    expect(secondText).toContain('后篇')
    expect(secondText).toContain('全文最后一句。')
    expect(secondText).not.toContain('Q001')
    expect(new DOMParser().parseFromString(firstHtml + secondHtml, 'text/html').body.textContent)
      .toBe(`Q001${'甲'.repeat(25000)}Q181A181${'乙'.repeat(25000)}全文最后一句。`)
    expect(new DOMParser().parseFromString(firstHtml + secondHtml, 'text/html').querySelectorAll('img')).toHaveLength(2)
    expect(renderTablesAsDataUrls).toHaveBeenNthCalledWith(2,
      [expect.objectContaining({ header: ['第二表', '内容'] })], {},
    )
    expect(surface.getByRole('status')).toHaveTextContent('已复制第 2/2 篇')
  })

  it.each(['unavailable', 'rejected'])('limits the plain-text fallback to the selected part when rich clipboard is %s', async (mode) => {
    if (mode === 'unavailable') vi.stubGlobal('ClipboardItem', undefined)
    else vi.mocked(navigator.clipboard.write).mockRejectedValueOnce(new Error('denied'))
    enterArticle()
    const panel = wechatPanel()
    expect(panel.queryByRole('combobox', { name: '微信公众号复制篇章' })).not.toBeNull()
    fireEvent.change(panel.getByRole('combobox', { name: '微信公众号复制篇章' }), { target: { value: '1' } })
    fireEvent.click(panel.getByRole('button', { name: '复制第 2/2 篇' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1))
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]
    expect(copied).toContain('A181')
    expect(copied).toContain('乙'.repeat(25000))
    expect(copied).toContain('全文最后一句。')
    expect(copied).not.toContain('Q001')
    expect(copied).not.toContain('前篇')
    expect(copied.length).toBeLessThanOrEqual(45000)
    expect(panel.getByRole('status')).toHaveTextContent('已复制第 2/2 篇')
    expect(panel.getByRole('status')).toHaveTextContent('纯文本')
  })

  it('applies a later table’s global column widths to that part’s local image rendering', async () => {
    enterArticle()
    const panel = wechatPanel()
    expect(panel.queryByRole('combobox', { name: '微信公众号复制篇章' })).not.toBeNull()
    const preview = within(screen.getByTestId('wechat-output'))
    fireEvent.click(preview.getAllByText('调整列宽')[1])
    fireEvent.change(preview.getByRole('spinbutton', { name: '第二表 列宽 (px)' }), { target: { value: '180' } })
    fireEvent.change(panel.getByRole('combobox', { name: '微信公众号复制篇章' }), { target: { value: '1' } })
    fireEvent.click(panel.getByRole('button', { name: '复制第 2/2 篇' }))
    await waitFor(() => expect(renderTablesAsDataUrls).toHaveBeenCalledWith(
      [expect.objectContaining({ header: ['第二表', '内容'] })], { 0: { 0: 180 } },
    ))
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
  })

  it('keeps platform selections independent and resets the selection and status after editing', async () => {
    const bothMultipart = Array.from({ length: 10 }, (_, index) => `### Q${index + 1}\n\n${'字'.repeat(25000)}`).join('\n\n')
    enterArticle(bothMultipart)
    expect(screen.queryByRole('combobox', { name: '微信公众号复制篇章' })).not.toBeNull()
    const wechatSelect = screen.getByRole('combobox', { name: '微信公众号复制篇章' })
    const zsxqSelect = screen.getByRole('combobox', { name: '知识星球复制篇章' })
    fireEvent.change(wechatSelect, { target: { value: '1' } })
    expect(zsxqSelect).toHaveValue('0')
    fireEvent.change(zsxqSelect, { target: { value: '1' } })
    expect(wechatSelect).toHaveValue('1')
    fireEvent.change(zsxqSelect, { target: { value: '0' } })
    expect(wechatSelect).toHaveValue('1')
    fireEvent.click(wechatPanel().getByRole('button', { name: /^复制第 2\/\d+ 篇$/ }))
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    expect(wechatPanel().getByRole('status')).toHaveTextContent('已复制第 2/')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新的短文章' } })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(wechatPanel().queryByRole('status')).toBeNull()
    expect(wechatPanel().getByRole('button', { name: '复制' })).toBeEnabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: bothMultipart } })
    expect(screen.getByRole('combobox', { name: '微信公众号复制篇章' })).toHaveValue('0')
    expect(screen.getByRole('combobox', { name: '知识星球复制篇章' })).toHaveValue('0')
  })

  it('shows copy failures inside the WeChat immersive preview', async () => {
    vi.mocked(navigator.clipboard.write).mockRejectedValueOnce(new Error('rich denied'))
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('clipboard denied'))
    enterArticle('测试复制失败')
    fireEvent.click(wechatPanel().getByRole('button', { name: '整屏查看' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: '复制' }))
    await waitFor(() => expect(dialog.queryByRole('status')).not.toBeNull())
    await waitFor(() => expect(dialog.getByRole('status')).toHaveTextContent('公众号内容复制失败'))
    expect(dialog.getByRole('status')).toHaveTextContent('clipboard denied')
  })

  it('blocks an indivisible oversized block in both surfaces without blocking Knowledge Planet', () => {
    enterArticle('字'.repeat(45001))
    const panel = wechatPanel()
    expect(panel.queryByRole('alert')).not.toBeNull()
    expect(panel.getByRole('alert')).toHaveTextContent('单个内容块超过')
    expect(panel.getByRole('button', { name: '复制' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '复制文章' })).toBeEnabled()
    fireEvent.click(panel.getByRole('button', { name: '整屏查看' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('alert')).toHaveTextContent('单个内容块超过')
    expect(dialog.getByRole('button', { name: '复制' })).toBeDisabled()
    expect(navigator.clipboard.write).not.toHaveBeenCalled()
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })
})
