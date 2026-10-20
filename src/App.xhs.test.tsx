import '@testing-library/jest-dom/vitest'
import JSZip from 'jszip'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { XHS_SETTINGS_KEY } from './components/XhsPanel'
import { createDomFits, downloadBlob, renderXhsCardBlobs } from './lib/xhsDom'

vi.mock('./lib/xhsDom', async () => {
  const actual = await vi.importActual<typeof import('./lib/xhsDom')>('./lib/xhsDom')
  const { estimateFits } = await vi.importActual<typeof import('./lib/xhsLayout')>('./lib/xhsLayout')
  return {
    ...actual,
    preloadImages: vi.fn(async () => ({ sizes: {}, failed: [] })),
    createDomFits: vi.fn(async () => ({ fits: estimateFits(), fitsCover: () => true, dispose: vi.fn() })),
    renderXhsCardBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    renderXhsCardBlobs: vi.fn(async (cards: unknown[], _meta: unknown, _sizes: unknown, onProgress?: (done: number, total: number) => void) => {
      cards.forEach((_, index) => onProgress?.(index + 1, cards.length))
      return cards.map(() => new Blob(['png'], { type: 'image/png' }))
    }),
    downloadBlob: vi.fn(),
  }
})

class ClipboardItemMock {
  items: Record<string, Blob>

  constructor(items: Record<string, Blob>) {
    this.items = items
  }
}

const editor = () => screen.getByRole('textbox', { name: 'Markdown 输入' })
const xhsPanel = () => within(screen.getByRole('heading', { name: '小红书版' }).closest('article')!)
const panelOf = (heading: string) => screen.getByRole('heading', { name: heading }).closest('article')!

const generateCards = async () => {
  fireEvent.click(screen.getByRole('tab', { name: '小红书' }))
  fireEvent.click(xhsPanel().getByRole('button', { name: '生成卡片' }))
  await waitFor(() => expect(screen.getByTestId('xhs-cards').children.length).toBeGreaterThan(1))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  vi.stubGlobal('ClipboardItem', ClipboardItemMock)
  Object.assign(navigator, {
    clipboard: {
      write: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('preview tabs', () => {
  it('switches between platforms with clicks and arrow keys while keeping every panel mounted', () => {
    render(<App />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['知识星球', '公众号', '小红书'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(panelOf('知识星球版')).not.toHaveClass('is-inactive')
    expect(panelOf('小红书版')).toHaveClass('is-inactive')

    fireEvent.click(tabs[2])
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(panelOf('小红书版')).not.toHaveClass('is-inactive')
    expect(panelOf('知识星球版')).toHaveClass('is-inactive')
    expect(panelOf('小红书版')).toHaveAttribute('aria-labelledby', tabs[2].id)

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(tabs[2])
  })
})

describe('Xiaohongshu panel', () => {
  it('generates a cover and content cards with an editable caption', async () => {
    render(<App />)
    await generateCards()

    const cards = within(screen.getByTestId('xhs-cards'))
    expect(cards.getByText(/1 \/ \d+ · 封面/)).toBeInTheDocument()
    expect(xhsPanel().getByRole('button', { name: '重新生成卡片' })).toBeEnabled()

    const title = xhsPanel().getByDisplayValue('用 Markdown 一次生成两版文章')
    fireEvent.change(title, { target: { value: '自定义标题' } })
    expect(xhsPanel().getByDisplayValue('自定义标题')).toBeInTheDocument()
    fireEvent.click(xhsPanel().getByRole('button', { name: '恢复自动文案' }))
    expect(xhsPanel().getByDisplayValue('用 Markdown 一次生成两版文章')).toBeInTheDocument()

    fireEvent.click(xhsPanel().getByRole('button', { name: '复制文案' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/^用 Markdown 一次生成两版文章\n\n/)))
  })

  it('exports all cards as a zip named after the caption title', async () => {
    render(<App />)
    await generateCards()
    fireEvent.click(xhsPanel().getByRole('button', { name: '下载全部（zip）' }))

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('用 Markdown 一次生成两版文章-小红书.zip')
    expect(renderXhsCardBlobs).toHaveBeenCalledTimes(1)
    expect(xhsPanel().getByText(/已导出 \d+ 张 1080×1440 图片和文案。/)).toBeInTheDocument()
  })

  it('flows section headings directly after preceding text on the same card', async () => {
    render(<App />)
    fireEvent.change(editor(), {
      target: { value: '# 标题\n\n## 背景\n\n前一节最后一段。\n\n## CPU负责决定，存储器负责保存\n\n后一节内容。' },
    })
    await generateCards()
    const cards = screen.getByTestId('xhs-cards').children
    expect(cards).toHaveLength(2)
    const body = within(cards[1] as HTMLElement)
    expect(body.getByRole('heading', { name: '一、背景' })).toBeInTheDocument()
    expect(body.getByText('前一节最后一段。')).toBeInTheDocument()
    expect(body.getByRole('heading', { name: '二、CPU负责决定，存储器负责保存' })).toBeInTheDocument()
    expect(body.getByText('后一节内容。')).toBeInTheDocument()
  })

  it('exports exactly the 19 preview cards into two complete groups', async () => {
    render(<App />)
    fireEvent.change(editor(), {
      target: { value: ['# 完整笔记', ...Array.from({ length: 18 }, (_, index) => `## 第 ${index + 1} 节\n\n内容 ${index + 1}`)].join('\n\n---\n\n') },
    })
    await generateCards()
    fireEvent.change(xhsPanel().getByLabelText('署名'), { target: { value: '@芯片验证日记' } })
    expect(screen.getByTestId('xhs-cards').children).toHaveLength(19)
    fireEvent.click(xhsPanel().getByRole('button', { name: '下载全部（zip）' }))

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    const reader = new FileReader()
    const zipData = new Promise<ArrayBuffer>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
    })
    reader.readAsArrayBuffer(vi.mocked(downloadBlob).mock.calls[0][0])
    const zip = await JSZip.loadAsync(await zipData)
    const images = Object.keys(zip.files).filter((name) => name.endsWith('.png'))
    expect(images).toHaveLength(19)
    expect(images.filter((name) => name.startsWith('part1/'))).toHaveLength(18)
    expect(images.filter((name) => name.startsWith('part2/'))).toEqual(['part2/01.png'])
    expect(await zip.file('part1/caption.txt')!.async('string')).toContain('\n\n@芯片验证日记\n')
    expect(await zip.file('part2/caption.txt')!.async('string')).toContain('\n\n@芯片验证日记\n')
    expect(xhsPanel().getByText(/已导出 19 张 1080×1440 图片和文案/)).toBeInTheDocument()
  })

  it('updates the caption, clipboard and card footers when the author changes, preserving manual copy', async () => {
    render(<App />)
    await generateCards()
    const panel = xhsPanel()
    const author = panel.getByLabelText('署名')
    fireEvent.change(panel.getByLabelText('话题标签'), { target: { value: 'CPU SoC' } })
    fireEvent.change(author, { target: { value: '@芯片验证日记' } })
    const body = panel.getByRole<HTMLTextAreaElement>('textbox', { name: /^正文/ })
    expect(body.value).toContain('\n\n@芯片验证日记\n\n#CPU #SoC')
    expect(Array.from(screen.getByTestId('xhs-cards').querySelectorAll('.xhs-footer > span:first-child'))
      .every((span) => span.textContent === '@芯片验证日记')).toBe(true)
    expect(panel.queryByText(/当前卡片为旧版本/)).toBeNull()

    fireEvent.change(body, { target: { value: '手动编辑的正文。\n\n@芯片验证日记\n\n#CPU #SoC' } })
    fireEvent.change(panel.getByRole('textbox', { name: /^标题/ }), { target: { value: '手动标题' } })
    fireEvent.change(author, { target: { value: '@新的署名' } })
    expect(body).toHaveValue('手动编辑的正文。\n\n@新的署名\n\n#CPU #SoC')
    fireEvent.click(panel.getByRole('button', { name: '复制文案' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '手动标题\n\n手动编辑的正文。\n\n@新的署名\n\n#CPU #SoC',
    ))

    fireEvent.change(author, { target: { value: '' } })
    expect(body).toHaveValue('手动编辑的正文。\n\n#CPU #SoC')
  })

  it('refuses to download a partial ZIP if only 11 of 19 cards are rendered', async () => {
    render(<App />)
    fireEvent.change(editor(), {
      target: { value: ['# 完整笔记', ...Array.from({ length: 18 }, (_, index) => `## 第 ${index + 1} 节\n\n内容 ${index + 1}`)].join('\n\n---\n\n') },
    })
    await generateCards()
    vi.mocked(renderXhsCardBlobs).mockResolvedValueOnce(
      Array.from({ length: 11 }, () => new Blob(['png'], { type: 'image/png' })),
    )
    fireEvent.click(xhsPanel().getByRole('button', { name: '下载全部（zip）' }))

    await waitFor(() => expect(xhsPanel().getByText(/应生成 19 张，实际生成 11 张/)).toBeInTheDocument())
    expect(downloadBlob).not.toHaveBeenCalled()
    expect(xhsPanel().getByText(/本次未生成新的 ZIP/)).toBeInTheDocument()

    fireEvent.click(xhsPanel().getByRole('button', { name: '下载全部（zip）' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(xhsPanel().queryByText(/本次未生成新的 ZIP/)).toBeNull()
  })

  it('reports a failed export without downloading or claiming success, and allows retrying', async () => {
    render(<App />)
    await generateCards()
    vi.mocked(renderXhsCardBlobs).mockRejectedValueOnce(new Error('图片生成失败'))
    fireEvent.click(xhsPanel().getByRole('button', { name: '下载全部（zip）' }))

    await waitFor(() => expect(xhsPanel().getByText('导出失败，本次未生成新的 ZIP：图片生成失败')).toBeInTheDocument())
    expect(downloadBlob).not.toHaveBeenCalled()
    expect(xhsPanel().queryByText(/已导出/)).toBeNull()
    expect(xhsPanel().getByRole('button', { name: '下载全部（zip）' })).toBeEnabled()
  })

  it('copies a single card image to the clipboard', async () => {
    render(<App />)
    await generateCards()
    fireEvent.click(xhsPanel().getAllByRole('button', { name: '复制此图' })[0])

    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(navigator.clipboard.write).mock.calls[0][0][0] as unknown as ClipboardItemMock
    expect(Object.keys(payload.items)).toEqual(['image/png'])
  })

  it('re-paginates automatically after theme changes, but marks markdown edits stale', async () => {
    render(<App />)
    await generateCards()
    const panel = xhsPanel()

    fireEvent.change(panel.getByLabelText('系列名'), { target: { value: '验证笔记' } })
    expect(panel.queryByText(/当前卡片为旧版本/)).toBeNull()
    expect(createDomFits).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem(XHS_SETTINGS_KEY)!)).toMatchObject({ series: '验证笔记' })

    fireEvent.change(panel.getByLabelText('主题'), { target: { value: 'ink' } })
    await waitFor(() => expect(createDomFits).toHaveBeenCalledTimes(2))
    expect(vi.mocked(createDomFits).mock.calls[1][0]).toMatchObject({ theme: 'ink' })
    await waitFor(() => expect(screen.getByTestId('xhs-cards').innerHTML).toContain('background:#0f172a'))
    expect(panel.queryByText(/当前卡片为旧版本/)).toBeNull()
    expect(panel.getByRole('button', { name: '下载全部（zip）' })).toBeEnabled()

    fireEvent.change(editor(), { target: { value: '# 新文章\n\n新的内容。' } })
    expect(panel.getByText(/当前卡片为旧版本/)).toBeInTheDocument()
    expect(createDomFits).toHaveBeenCalledTimes(2)
  })

  it('toggles code line numbers with automatic re-pagination and remembers the choice', async () => {
    render(<App />)
    await generateCards()
    const panel = xhsPanel()
    const toggle = panel.getByLabelText('代码显示行号')
    expect(toggle).toBeChecked()
    expect(toggle).toBeEnabled()
    expect(screen.getByTestId('xhs-cards').innerHTML).toContain('linear-gradient(90deg,#181825')

    fireEvent.click(toggle)
    await waitFor(() => expect(createDomFits).toHaveBeenCalledTimes(2))
    expect(vi.mocked(createDomFits).mock.calls[1][0]).toMatchObject({ codeLineNumbers: false })
    await waitFor(() => expect(screen.getByTestId('xhs-cards').innerHTML).not.toContain('linear-gradient(90deg,#181825'))
    expect(screen.getByTestId('xhs-cards').innerHTML).toContain('class="xhs-code"')
    expect(JSON.parse(window.localStorage.getItem(XHS_SETTINGS_KEY)!)).toMatchObject({ codeLineNumbers: false })
  })

  it('disables the line number toggle when the article has no code block', () => {
    render(<App />)
    fireEvent.change(editor(), { target: { value: '# 无代码\n\n只有正文。' } })
    const panel = xhsPanel()
    expect(panel.getByLabelText('代码显示行号')).toBeDisabled()
    expect(panel.getByText('当前文章没有代码块')).toBeInTheDocument()
  })

  it('applies line number colors live per theme without re-pagination and restores defaults', async () => {
    render(<App />)
    await generateCards()
    const panel = xhsPanel()
    const cards = () => screen.getByTestId('xhs-cards').innerHTML
    expect(panel.getByLabelText('行号文字色')).toHaveValue('#585b70')
    expect(panel.getByRole('button', { name: '恢复主题默认' })).toBeDisabled()

    fireEvent.change(panel.getByLabelText('行号文字色'), { target: { value: '#ff0000' } })
    fireEvent.change(panel.getByLabelText('行号背景色'), { target: { value: '#00ff00' } })
    expect(cards()).toContain('color:#ff0000;')
    expect(cards()).toContain('linear-gradient(90deg,#00ff00')
    expect(createDomFits).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem(XHS_SETTINGS_KEY)!).codeGutter).toEqual({ paper: { fg: '#ff0000', bg: '#00ff00' } })

    fireEvent.change(panel.getByLabelText('主题'), { target: { value: 'morandi' } })
    await waitFor(() => expect(cards()).toContain('linear-gradient(90deg,#eaeef2'))
    expect(panel.getByLabelText('行号文字色')).toHaveValue('#8c959f')
    expect(cards()).not.toContain('#ff0000')

    fireEvent.change(panel.getByLabelText('主题'), { target: { value: 'paper' } })
    await waitFor(() => expect(cards()).toContain('linear-gradient(90deg,#00ff00'))
    fireEvent.click(panel.getByRole('button', { name: '恢复主题默认' }))
    expect(cards()).toContain('linear-gradient(90deg,#181825')
    expect(cards()).not.toContain('#ff0000')
    expect(JSON.parse(window.localStorage.getItem(XHS_SETTINGS_KEY)!).codeGutter).toEqual({})
  })

  it('keeps an edited caption when settings re-paginate the cards', async () => {
    render(<App />)
    await generateCards()
    const panel = xhsPanel()
    fireEvent.change(panel.getByRole('textbox', { name: /^标题/ }), { target: { value: '我改过的标题' } })

    fireEvent.click(panel.getByLabelText('生成封面卡'))
    await waitFor(() => expect(createDomFits).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(panel.getByRole('button', { name: '重新生成卡片' })).toBeEnabled())
    expect(panel.getByRole('textbox', { name: /^标题/ })).toHaveValue('我改过的标题')
  })

  it('uses the latest settings when re-paginations overlap', async () => {
    render(<App />)
    await generateCards()
    const panel = xhsPanel()
    const { estimateFits } = await vi.importActual<typeof import('./lib/xhsLayout')>('./lib/xhsLayout')
    let releaseSlow: () => void = () => {}
    vi.mocked(createDomFits).mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseSlow = () => resolve({ fits: estimateFits(), fitsCover: () => true, dispose: vi.fn() })
      }),
    )

    fireEvent.change(panel.getByLabelText('主题'), { target: { value: 'red' } })
    await waitFor(() => expect(createDomFits).toHaveBeenCalledTimes(2))
    fireEvent.change(panel.getByLabelText('主题'), { target: { value: 'morandi' } })
    await waitFor(() => expect(screen.getByTestId('xhs-cards').innerHTML).toContain('background:#f2f4f1'))
    releaseSlow()
    await waitFor(() => expect(panel.getByRole('button', { name: '重新生成卡片' })).toBeEnabled())
    expect(screen.getByTestId('xhs-cards').innerHTML).not.toContain('background:#fff5f5')
    expect(panel.getByLabelText('主题')).toHaveValue('morandi')
  })

  it('restores saved settings', () => {
    window.localStorage.setItem(XHS_SETTINGS_KEY, JSON.stringify({
      series: '系列',
      author: '@me',
      theme: 'red',
      tags: 'a b',
      withCover: false,
      codeLineNumbers: false,
      codeGutter: { red: { fg: '#123456', bg: 'red' }, unknown: { fg: '#000000' } },
    }))
    render(<App />)
    const panel = xhsPanel()
    expect(panel.getByLabelText('系列名')).toHaveValue('系列')
    expect(panel.getByLabelText('署名')).toHaveValue('@me')
    expect(panel.getByLabelText('主题')).toHaveValue('red')
    expect(panel.getByLabelText('生成封面卡')).not.toBeChecked()
    expect(panel.getByLabelText('代码显示行号')).not.toBeChecked()
    expect(panel.getByLabelText('行号文字色')).toHaveValue('#123456')
    expect(panel.getByLabelText('行号背景色')).toHaveValue('#181825')
  })
})

describe('PPTX import', () => {
  it('converts a deck into markdown in the editor', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="t"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>演示标题</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    )
    const deck = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'deck.pptx')
    render(<App />)

    fireEvent.change(screen.getByLabelText('导入 Markdown/PPTX/图片'), { target: { files: [deck] } })

    await waitFor(() => expect(screen.getByText(/已从 deck\.pptx 转换 1 页为 Markdown/)).toBeInTheDocument())
    expect(editor()).toHaveValue('# 演示标题\n')
    expect(screen.getByTestId('wechat-output')).toHaveTextContent('演示标题')
  })

  it('rejects legacy ppt files with guidance', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('导入 Markdown/PPTX/图片'), { target: { files: [new File(['x'], 'old.ppt')] } })
    await waitFor(() => expect(screen.getByText(/另存为 \.pptx/)).toBeInTheDocument())
  })
})
