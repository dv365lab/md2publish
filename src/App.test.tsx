import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/tableImage', async () => {
  const actual = await vi.importActual<typeof import('./lib/tableImage')>('./lib/tableImage')

  return {
    ...actual,
    renderTablesAsDataUrls: vi.fn(async (tables: unknown[]) =>
      tables.map((_, index) => `data:image/png;base64,dGFibGUt${index + 1}`),
    ),
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

beforeEach(() => {
  vi.stubGlobal('ClipboardItem', ClipboardItemMock)
  Object.assign(navigator, {
    clipboard: {
      write: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
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
