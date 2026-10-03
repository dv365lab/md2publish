import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { copyTableAsImage, renderTablesAsDataUrls } from './lib/tableImage'

vi.mock('./lib/tableImage', async () => {
  const actual = await vi.importActual<typeof import('./lib/tableImage')>('./lib/tableImage')

  return {
    ...actual,
    renderTablesAsDataUrls: vi.fn(async (tables: unknown[]) =>
      tables.map((_, index) => `data:image/png;base64,dGFibGUt${index + 1}`),
    ),
    copyTableAsImage: vi.fn().mockResolvedValue(undefined),
  }
})

class ClipboardItemMock {
  items: Record<string, Blob>

  constructor(items: Record<string, Blob>) {
    this.items = items
  }
}

const readBlobText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsText(blob)
  })

afterEach(() => {
  cleanup()
})

describe('Knowledge Planet article length limit', () => {
  const longArticle = `### Q001\n\n${'甲'.repeat(55000)}\n\n| 第一表 | 内容 |\n| --- | --- |\n| 前篇 | one |\n\n### Q181\n\n**A181**\n\n${'乙'.repeat(55000)}\n\n| 第二表 | 内容 |\n| --- | --- |\n| 后篇 | two |\n\n全文最后一句。`

  it.each([false, true])('copies every part without losing A181 (immersive=%s)', async (immersive) => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: longArticle } })
    if (immersive) fireEvent.click(screen.getAllByText('整屏查看')[0])
    const surface = immersive ? within(screen.getByRole('dialog')) : screen

    expect(surface.getByText(/知识星球每篇正文上限为 100,000/)).toBeVisible()
    expect(surface.getByText(/不同的新文章/)).toBeVisible()
    expect(surface.getByRole('combobox', { name: '知识星球复制篇章' })).toHaveValue('0')
    fireEvent.click(surface.getByRole('button', { name: '复制第 1/2 篇' }))
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const firstPayload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    const first = await readBlobText(firstPayload.items['text/html'])
    expect(first).toContain('Q001')
    expect(first).not.toContain('A181')

    fireEvent.change(surface.getByRole('combobox', { name: '知识星球复制篇章' }), { target: { value: '1' } })
    fireEvent.click(surface.getByRole('button', { name: '复制第 2/2 篇' }))
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(2))
    const secondPayload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[1][0][0] as ClipboardItemMock
    const second = await readBlobText(secondPayload.items['text/html'])
    expect(second).toContain('A181')
    expect(second).toContain('全文最后一句。')
    expect(second).not.toContain('Q001')
    expect(new DOMParser().parseFromString(first + second, 'text/html').body.textContent)
      .toBe(`Q001${'甲'.repeat(55000)}Q181A181${'乙'.repeat(55000)}全文最后一句。`)
    expect(renderTablesAsDataUrls).toHaveBeenNthCalledWith(2,
      [expect.objectContaining({ header: ['第二表', '内容'] })], {},
    )
    expect(surface.getByRole('status')).toHaveTextContent('已复制第 2/2 篇')
  })

  it('keeps the global table width when copying the second part and resets for new input', async () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: longArticle } })
    const preview = within(screen.getByTestId('zsxq-output'))
    fireEvent.click(preview.getAllByText('调整列宽')[1])
    fireEvent.change(preview.getByRole('spinbutton', { name: '第二表 列宽 (px)' }), {
      target: { value: '180' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '知识星球复制篇章' }), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '复制第 2/2 篇' }))
    await waitFor(() => expect(renderTablesAsDataUrls).toHaveBeenCalledWith(
      [expect.objectContaining({ header: ['第二表', '内容'] })], { 0: { 0: 180 } },
    ))
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新的短文章' } })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('button', { name: '复制文章' })).toBeEnabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: longArticle } })
    expect(screen.getByRole('combobox', { name: '知识星球复制篇章' })).toHaveValue('0')
  })

  it('shows clipboard failures inside the immersive preview', async () => {
    ;(navigator.clipboard.write as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'))
    render(<App />)
    fireEvent.click(screen.getAllByText('整屏查看')[0])
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: '复制文章' }))
    await waitFor(() => expect(dialog.getByText(/富文本复制失败/)).toBeVisible())
  })

  it('blocks an oversized indivisible block with a visible explanation', () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '字'.repeat(100000) } })
    fireEvent.click(screen.getAllByText('整屏查看')[0])
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('alert')).toHaveTextContent('单个内容块超过')
    expect(dialog.getByRole('button', { name: '复制文章' })).toBeDisabled()
    expect(navigator.clipboard.write).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '复制' })).toBeDisabled()
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ClipboardItem', ClipboardItemMock)
  Object.assign(navigator, {
    clipboard: {
      write: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
})

describe('App list quote preservation', () => {
  const ordinaryExample = '“负责验证 DDR 控制器，使用 UVM 搭建了环境并写了测试用例，发现了 Bug。”'
  const starExample = '“针对支持低功耗切换的 DDR4 控制器项目（S），需在 3 周内攻坚高并发读写与自刷新切态下的数据一致性验证（T）；我主导扩展了 UVM Scoreboard 实现乱序读写重排校验，并编写定向并发压力序列注入跨 Bank 冲突与刷新中断（A）；最终提前 5 天实现功能覆盖率 100% 收敛，捕获 3 处在极端刷新反压下的数据错位 Bug（R）。”'
  const markdown = `## 一句话对比示例

- **普通描述（无结构）**:
  > “负责验证 DDR 控制器，使用 UVM 搭建了环境并写了测试用例，发现了 Bug。”

- **STAR 法则描述（结构化）**:
  > “针对支持低功耗切换的 DDR4 控制器项目（**S**），需在 3 周内攻坚高并发读写与自刷新切态下的数据一致性验证（**T**）；我主导扩展了 UVM Scoreboard 实现乱序读写重排校验，并编写定向并发压力序列注入跨 Bank 冲突与刷新中断（**A**）；最终提前 5 天实现功能覆盖率 100% 收敛，捕获 3 处在极端刷新反压下的数据错位 Bug（**R**）。”`
  const platforms = [
    { platform: 'zsxq', previewIndex: 0, copyLabel: '复制文章' },
    { platform: 'wechat', previewIndex: 1, copyLabel: '复制' },
  ] as const

  const enterExamples = () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: markdown } })
  }

  const expectCompleteExamples = (container: HTMLElement) => {
    const text = container.textContent ?? ''
    expect(text).toContain(ordinaryExample)
    expect(text).toContain(starExample)
    expect(text.indexOf(ordinaryExample)).toBeLessThan(text.indexOf(starExample))
    const boldText = Array.from(container.querySelectorAll('strong'), (element) => element.textContent)
    expect(boldText).toEqual(expect.arrayContaining(['普通描述（无结构）', 'STAR 法则描述（结构化）', 'S', 'T', 'A', 'R']))
  }

  it.each(platforms)('keeps complete quoted examples in the $platform preview', ({ platform }) => {
    enterExamples()

    expectCompleteExamples(screen.getByTestId(`${platform}-output`))
  })

  it.each(platforms)('keeps complete quoted examples in the $platform immersive preview', ({ previewIndex }) => {
    enterExamples()
    fireEvent.click(screen.getAllByText('整屏查看')[previewIndex])

    expectCompleteExamples(within(screen.getByRole('dialog')).getByTestId('immersive-output'))
  })

  it.each(platforms)('copies complete quoted examples for $platform', async ({ platform, copyLabel }) => {
    enterExamples()
    fireEvent.click(screen.getByRole('button', { name: copyLabel }))

    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const payload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    const html = await readBlobText(payload.items['text/html'])
    const copiedDocument = new DOMParser().parseFromString(html, 'text/html')
    expectCompleteExamples(copiedDocument.body)

    if (platform === 'wechat') {
      const text = await readBlobText(payload.items['text/plain'])
      expect(text).toContain(ordinaryExample)
      expect(text).toContain(starExample)
    }
  })
})

describe('App attachment link removal', () => {
  const attachmentUrl = 'https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/test/paper.pdf?Signature=test-signature&Expires=123'
  const normalUrl = 'https://example.com/reference'
  const markdown = `正文之前 [待删除附件](${attachmentUrl}) 正文之后。\n\n[正常参考链接](${normalUrl})`

  const expectPublishedOutput = (output: string) => {
    expect(output).toContain('正文之前')
    expect(output).toContain('正文之后。')
    expect(output).not.toContain('正常参考链接')
    expect(output).not.toContain(normalUrl)
    expect(output).not.toContain('待删除附件')
    expect(output).not.toContain('ppl-ai-file-upload.s3.amazonaws.com')
    expect(output).not.toContain('test-signature')
  }

  it.each([
    { platform: 'zsxq', previewIndex: 0, copyLabel: '复制文章' },
    { platform: 'wechat', previewIndex: 1, copyLabel: '复制' },
  ])('removes attachment links from $platform previews and copied content without changing the source', async ({ platform, previewIndex, copyLabel }) => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: markdown } })

    expect(screen.getByRole('textbox')).toHaveValue(markdown)
    expectPublishedOutput(screen.getByTestId(`${platform}-output`).innerHTML)

    fireEvent.click(screen.getAllByText('整屏查看')[previewIndex])
    const dialog = within(screen.getByRole('dialog'))
    expectPublishedOutput(dialog.getByTestId('immersive-output').innerHTML)
    fireEvent.click(dialog.getByRole('button', { name: copyLabel }))

    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const payload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    expect(Object.keys(payload.items)).toEqual(platform === 'wechat' ? ['text/html', 'text/plain'] : ['text/html'])
    for (const blob of Object.values(payload.items)) {
      expectPublishedOutput(await readBlobText(blob))
    }
    expect(screen.getByRole('textbox')).toHaveValue(markdown)
  })
})

describe('App web citation removal', () => {
  const markdown = `| 维度 | ACE | CHI |
| --- | --- | --- |
| 协议形态 | 等信号 [jia](https://jia.je/kb/hardware/cache_coherence_protocol.html) | 分层结构 [community.cadence](https://community.cadence.com/example) |`

  it.each([
    { platform: 'zsxq', previewIndex: 0, copyLabel: '复制文章' },
    { platform: 'wechat', previewIndex: 1, copyLabel: '复制' },
  ])('removes citation labels and web addresses from the $platform preview and table image source', async ({ platform, previewIndex, copyLabel }) => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: markdown } })

    const preview = screen.getByTestId(`${platform}-output`)
    expect(preview).toHaveTextContent('等信号')
    expect(preview).toHaveTextContent('分层结构')
    expect(preview.textContent).not.toContain('jia')
    expect(preview.textContent).not.toContain('community.cadence')
    expect(preview.textContent).not.toContain('https://')

    fireEvent.click(screen.getAllByText('整屏查看')[previewIndex])
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByTestId('immersive-output').textContent).not.toContain('https://')
    expect(dialog.getByTestId('immersive-output').textContent).not.toContain('community.cadence')
    fireEvent.click(dialog.getByRole('button', { name: copyLabel }))
    await waitFor(() => expect(renderTablesAsDataUrls).toHaveBeenCalledTimes(1))
    const tables = (renderTablesAsDataUrls as ReturnType<typeof vi.fn>).mock.calls[0][0] as { rows: string[][] }[]
    expect(tables[0].rows).toEqual([['协议形态', '等信号', '分层结构']])
    expect(screen.getByRole('textbox')).toHaveValue(markdown)
  })
})

describe('App ChatGPT content reference cleanup', () => {
  const marker = ':chatgpt-content-reference{index="0"}'
  const markdown = `本期用两个故事厘清边界。${marker}\n\n> 系统结构以实际项目规格为准。`

  it.each([
    { platform: 'zsxq', previewIndex: 0, copyLabel: '复制文章' },
    { platform: 'wechat', previewIndex: 1, copyLabel: '复制' },
  ])('removes markers from the $platform previews and copied content', async ({ platform, previewIndex, copyLabel }) => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: markdown } })

    expect(screen.getByRole('textbox')).toHaveValue(markdown)
    const preview = screen.getByTestId(`${platform}-output`)
    expect(preview.textContent).toContain('本期用两个故事厘清边界。')
    expect(preview.textContent).toContain('系统结构以实际项目规格为准。')
    expect(preview.textContent).not.toContain('chatgpt-content-reference')

    fireEvent.click(screen.getAllByText('整屏查看')[previewIndex])
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByTestId('immersive-output').textContent).not.toContain('chatgpt-content-reference')
    fireEvent.click(dialog.getByRole('button', { name: copyLabel }))

    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const payload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    for (const blob of Object.values(payload.items)) {
      const content = await readBlobText(blob)
      expect(content).toContain('本期用两个故事厘清边界。')
      expect(content).not.toContain('chatgpt-content-reference')
    }
    expect(screen.getByRole('textbox')).toHaveValue(markdown)
  })
})

describe('App immersive preview', () => {
  it('opens zsxq immersive preview', () => {
    render(<App />)

    fireEvent.click(screen.getAllByText('整屏查看')[0])

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('知识星球版整屏预览')).toBeTruthy()
    expect(screen.getByTestId('immersive-output')).toHaveTextContent('【用 Markdown 一次生成两版文章】')
  })

  it('adjusts immersive width manually', () => {
    render(<App />)

    fireEvent.click(screen.getAllByText('整屏查看')[0])
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '1360' } })

    expect(screen.getAllByText('阅读宽度 1360px')).toHaveLength(2)
    expect(screen.getByTestId('immersive-output')).toHaveStyle({ maxWidth: '1360px' })
  })

  it('opens wechat immersive preview and closes it', () => {
    render(<App />)

    fireEvent.click(screen.getAllByText('整屏查看')[1])

    expect(screen.getByText('微信公众号版整屏预览')).toBeTruthy()
    expect(screen.getByTestId('immersive-output')).toHaveTextContent('用 Markdown 一次生成两版文章')

    fireEvent.click(screen.getByText('关闭'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('copies zsxq tables as inline images in html-only rich content', async () => {
    render(<App />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: '复制文章' }))

    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const payload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    expect(Object.keys(payload.items)).toEqual(['text/html'])
    const html = await readBlobText(payload.items['text/html'])
    expect(html).not.toContain('<table')
    expect(html).toContain('src="data:image/png;base64,dGFibGUt1"')
  })

  it('keeps both rich html and plain text when copying for wechat', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '复制' }))

    const payload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    expect(Object.keys(payload.items)).toEqual(['text/html', 'text/plain'])
  })

  it('copies previewed single-newline details as separate wechat paragraphs', async () => {
    const markdown = '帮一家靠谱的芯片公司找人：\n🔹 项目：TSN验证；\n🔹 周期：3个月；\n🔹 人数：3-4人。\n\n有兴趣的人请联系。'
    const expected = [
      '帮一家靠谱的芯片公司找人：',
      '🔹 项目：TSN验证；',
      '🔹 周期：3个月；',
      '🔹 人数：3-4人。',
      '有兴趣的人请联系。',
    ]
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: markdown } })

    expect(screen.getByTestId('wechat-output').textContent).toContain(expected.slice(0, 4).join('\n'))
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const payload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    const html = await readBlobText(payload.items['text/html'])
    const copiedDocument = new DOMParser().parseFromString(html, 'text/html')

    expect(Array.from(copiedDocument.body.querySelectorAll(':scope > p'), (paragraph) => paragraph.textContent)).toEqual(expected)
    expect(await readBlobText(payload.items['text/plain'])).toContain(expected.slice(0, 4).join('\n'))
    expect(screen.getByRole('textbox')).toHaveValue(markdown)
  })

  it('copies each wechat list label and its explanation in one paragraph', async () => {
    const markdown = '- **DRAM**：说明它仍然属于动态存储器。\n- **Synchronous**：说明它的相关接口操作与时钟建立了规定的时序关系。'
    const labels = ['DRAM', 'Synchronous']
    const expectedItems = [
      'DRAM：说明它仍然属于动态存储器。',
      'Synchronous：说明它的相关接口操作与时钟建立了规定的时序关系。',
    ]
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: markdown } })

    expect(screen.getByRole('textbox')).toHaveValue(markdown)
    const previewItems = within(screen.getByTestId('wechat-output')).getAllByRole('listitem')
    expect(previewItems.map((item) => item.textContent)).toEqual(expectedItems)
    previewItems.forEach((item, index) => {
      expect(item.querySelector('strong')).toHaveTextContent(labels[index])
      expect(item.querySelector('br')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: '复制' }))

    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const payload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    const html = await readBlobText(payload.items['text/html'])
    const copiedDocument = new DOMParser().parseFromString(html, 'text/html')
    const copiedItems = copiedDocument.querySelectorAll('li')
    expect(copiedItems).toHaveLength(2)
    copiedItems.forEach((item, index) => {
      const paragraphs = item.querySelectorAll(':scope > p')
      expect(paragraphs).toHaveLength(1)
      expect(paragraphs[0].textContent).toBe(expectedItems[index])
      expect(paragraphs[0].querySelector('strong')?.textContent).toBe(labels[index])
      expect(item.textContent).toBe(expectedItems[index])
      expect(item.querySelector('br')).toBeNull()
    })
    expect(screen.getByRole('textbox')).toHaveValue(markdown)
  })

  it('copies wechat tables as inline images while keeping plain text fallback', async () => {
    render(<App />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: `表格之前

| 字段 | 内容 |
| --- | --- |
| 平台 | 微信公众号 |

表格之后`,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: '复制' }))

    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1))
    const payload = (navigator.clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as ClipboardItemMock
    const html = await readBlobText(payload.items['text/html'])
    const text = await readBlobText(payload.items['text/plain'])

    expect(html).not.toContain('<table')
    expect(html).toContain('src="data:image/png;base64,dGFibGUt1"')
    expect(text).toContain('字段 | 内容')
  })

  it('does not silently replace a failed zsxq rich copy with compatibility text', async () => {
    ;(navigator.clipboard.write as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('clipboard rejected'),
    )
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '复制文章' }))

    await waitFor(() => {
      expect(screen.getByText('富文本复制失败，请使用最新版 Chrome 或 Edge，并允许剪贴板权限。')).toBeTruthy()
    })
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('shows copy table image button', () => {
    render(<App />)

    expect(screen.getAllByRole('button', { name: '复制表格图片' }).length).toBeGreaterThan(0)
  })

  it('shows zsxq preview as a visual table', () => {
    render(<App />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      },
    })

    expect(screen.getByTestId('zsxq-output').querySelector('table')).toBeTruthy()
  })

  it('uses an adjusted ID width in both previews and both table-copy actions', async () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: '| ID | Test Point | 期望 |\n| --- | --- | --- |\n| EX-L01 | exclusive burst | 合法 |',
      },
    })

    const zsxqPreview = within(screen.getByTestId('zsxq-output'))
    fireEvent.click(zsxqPreview.getByText('调整列宽'))
    fireEvent.change(zsxqPreview.getByRole('spinbutton', { name: 'ID 列宽 (px)' }), {
      target: { value: '180' },
    })

    expect(zsxqPreview.getByRole('cell', { name: 'EX-L01' })).toHaveStyle({ minWidth: '180px' })
    expect(within(screen.getByTestId('wechat-output')).getByRole('cell', { name: 'EX-L01' }))
      .toHaveStyle({ minWidth: '180px' })

    fireEvent.click(screen.getByRole('button', { name: '复制文章' }))
    await waitFor(() => expect(renderTablesAsDataUrls).toHaveBeenCalledWith(
      expect.any(Array),
      { 0: { 0: 180 } },
    ))

    fireEvent.click(screen.getByRole('button', { name: '复制表格图片' }))
    await waitFor(() => expect(copyTableAsImage).toHaveBeenCalledWith(
      expect.objectContaining({ header: ['ID', 'Test Point', '期望'] }),
      { 0: 180 },
    ))
  })

  it('imports a markdown file with its local image assets', async () => {
    render(<App />)
    const markdown = new File(['# 文件文章\n\n![本地图](images/local.png)'], 'article.md', {
      type: 'text/markdown',
    })
    const image = new File(['fake-png'], 'local.png', { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('导入 Markdown/图片'), {
      target: { files: [markdown, image] },
    })

    await waitFor(() => {
      expect(screen.getByText('已导入 article.md，并载入 1 张本地图片。')).toBeTruthy()
    })
    const previewImages = screen.getAllByRole('img', { name: '本地图' })
    expect(previewImages).toHaveLength(2)
    expect(previewImages[0].getAttribute('src')).toMatch(/^data:image\/png;base64,/)
  })
})
