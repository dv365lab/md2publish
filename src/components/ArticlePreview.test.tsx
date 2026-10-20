import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArticlePreview } from './ArticlePreview'
import { buildRenderNodes } from '../lib/renderers'

afterEach(() => {
  cleanup()
})

describe('ArticlePreview', () => {
  it.each((['zsxq', 'wechat'] as const).flatMap((platform) => [
    {
      platform,
      name: 'adjacent Chinese punctuation',
      source: '本期采用的普通单根透明Switch，有一个**上行端口（Upstream Port，USP）**朝向根侧，两个**下行端口（Downstream Port，DP）**朝向设备侧。',
      boldTexts: ['上行端口（Upstream Port，USP）', '下行端口（Downstream Port，DP）'],
    },
    {
      platform,
      name: 'spaces before both closing markers',
      source: '本期采用的普通单根透明Switch，有一个**上行端口（Upstream Port，USP） **朝向根侧，两个**下行端口（Downstream Port，DP） **朝向设备侧。',
      boldTexts: ['上行端口（Upstream Port，USP）', '下行端口（Downstream Port，DP）'],
    },
    {
      platform,
      name: 'mixed standard and spaced markers',
      source: '**Switch**有一个**上行端口（USP） **朝向根侧，两个**下行端口（DP）**朝向设备侧。',
      boldTexts: ['Switch', '上行端口（USP）', '下行端口（DP）'],
    },
  ]))('keeps exact bold ranges with $name in the $platform preview', ({ platform, source, boldTexts }) => {
    const { container } = render(
      <ArticlePreview nodes={buildRenderNodes(source, platform)} platform={platform} />,
    )

    expect(Array.from(container.querySelectorAll('strong'), (node) => node.textContent?.trim())).toEqual(boldTexts)
    expect(container.textContent).not.toContain('**')
    expect(container.textContent).toContain('朝向根侧，两个')
    expect(container.textContent).toContain('朝向设备侧。')
  })

  it.each(['zsxq', 'wechat'] as const)(
    'renders bold text and removes unresolved footnotes in the %s preview',
    (platform) => {
      const source = '**加粗** 正文[^1][^source]。\n\n**RC，全称Root Complex，根复合体。 **它是处理器。\n\n- **列表重点**[^note]\n\n> **引用重点**[^2]\n\n| 字段 | 内容 |\n| --- | --- |\n| 名称 | **表格重点**[^3] |'
      const { container } = render(
        <ArticlePreview nodes={buildRenderNodes(source, platform)} platform={platform} />,
      )
      const boldTexts = Array.from(container.querySelectorAll('strong'), (node) => node.textContent?.trim())

      expect(boldTexts).toEqual(expect.arrayContaining([
        '加粗',
        'RC，全称Root Complex，根复合体。',
        '列表重点',
        '引用重点',
        '表格重点',
      ]))
      expect(container.textContent).not.toMatch(/\[\^[^\]]+\]/u)
      expect(container.textContent).not.toContain('**')
      expect(container.textContent).toContain('它是处理器。')
    },
  )

  it.each(['zsxq', 'wechat'] as const)(
    'preserves code and escaped asterisks in the %s preview',
    (platform) => {
      const source = '`**行内代码**[^1]`\n\n```text\n**代码块**[^source]\n```\n\n\\*\\*字面星号\\*\\*'
      const { container } = render(
        <ArticlePreview nodes={buildRenderNodes(source, platform)} platform={platform} />,
      )

      expect(container.textContent).toContain('**行内代码**[^1]')
      expect(container.textContent).toContain('**代码块**[^source]')
      expect(container.textContent).toContain('**字面星号**')
      expect(container.querySelectorAll('strong')).toHaveLength(0)
    },
  )

  it.each(['zsxq', 'wechat'] as const)(
    'escapes html inside bold text in the %s preview',
    (platform) => {
      const { container } = render(
        <ArticlePreview nodes={buildRenderNodes('**1 < 2 & 3 > 2**', platform)} platform={platform} />,
      )

      expect(container.querySelector('strong')?.textContent).toBe('1 < 2 & 3 > 2')
      expect(container.innerHTML).toContain('1 &lt; 2 &amp; 3 &gt; 2')
    },
  )

  it('renders wechat markdown tables as actual table elements', () => {
    const nodes = buildRenderNodes(
      `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      'wechat',
    )

    render(<ArticlePreview nodes={nodes} platform="wechat" />)

    const table = screen.getByRole('table')
    expect(table).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: '使用场景' })).toBeTruthy()
    expect(within(table).getByRole('cell', { name: 'Windows + Claude Code' })).toBeTruthy()
  })

  it('renders zsxq tables as actual table elements', () => {
    const nodes = buildRenderNodes(
      `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      'zsxq',
    )

    render(<ArticlePreview nodes={nodes} platform="zsxq" />)

    const table = screen.getByRole('table')
    expect(table).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: '使用场景' })).toBeTruthy()
  })

  it('keeps ID values on one line and lets the reader adjust each column width', () => {
    const nodes = buildRenderNodes(
      '| ID | Test Point | 期望 |\n| --- | --- | --- |\n| EX-L01 | exclusive burst | 合法 |',
      'zsxq',
    )
    const onTableColumnWidthChange = vi.fn()

    render(
      <ArticlePreview
        nodes={nodes}
        platform="zsxq"
        tableColumnWidths={{}}
        onTableColumnWidthChange={onTableColumnWidthChange}
      />,
    )

    const idHeader = screen.getByRole('columnheader', { name: 'ID' })
    const idCell = screen.getByRole('cell', { name: 'EX-L01' })
    expect(idHeader).toHaveStyle({ minWidth: '136px', whiteSpace: 'nowrap' })
    expect(idCell).toHaveStyle({ minWidth: '136px', whiteSpace: 'nowrap' })

    fireEvent.click(screen.getByText('调整列宽'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'ID 列宽 (px)' }), {
      target: { value: '180' },
    })
    expect(onTableColumnWidthChange).toHaveBeenCalledWith(0, 0, 180)
  })

  it('renders markdown images at their natural aspect ratio', () => {
    const nodes = buildRenderNodes('![架构图](https://example.com/architecture.png)', 'wechat')

    render(<ArticlePreview nodes={nodes} platform="wechat" />)

    const image = screen.getByRole('img', { name: '架构图' })
    expect(image).toHaveAttribute('src', 'https://example.com/architecture.png')
    expect(image).toHaveStyle({ maxWidth: '100%', height: 'auto' })
  })

  it.each(['zsxq', 'wechat'] as const)(
    'omits link-only nested navigation from the %s preview',
    (platform) => {
      const nodes = buildRenderNodes(
        `## 导航栏

- [第一篇：精要入门与综合进阶](#第一篇精要入门与综合进阶)
  - [第一部分：AMBA ACE 协议面试题与详细答案](#第一部分-amba-ace-协议面试题与详细答案)
    - [一、ACE 基础与体系结构](#一ace-基础与体系结构)
      - [1. 什么是 ACE？](#1-什么是-ace)`,
        platform,
      )

      render(<ArticlePreview nodes={nodes} platform={platform} />)

      expect(screen.queryByRole('list')).toBeNull()
      expect(screen.queryByRole('link')).toBeNull()
      expect(screen.getByText(/导航栏/)).toBeTruthy()
      expect(screen.queryByText('（#第一篇精要入门与综合进阶）')).toBeNull()
    },
  )

  it('renders every heading level with a distinct color and bold weight', () => {
    const nodes = buildRenderNodes('# 一级标题\n\n## 二级标题\n\n### 三级标题', 'zsxq')

    render(<ArticlePreview nodes={nodes} platform="zsxq" />)

    expect(screen.getByText('【一级标题】')).toHaveStyle({ color: '#1d4ed8', fontWeight: '800' })
    expect(screen.getByText('一、二级标题')).toHaveStyle({ color: '#7c3aed', fontWeight: '700' })
    expect(screen.getByText('三级标题')).toHaveStyle({ color: '#0f766e', fontWeight: '700' })
  })

  it('uses the compact wechat heading palette and renders callout labels cleanly', () => {
    const nodes = buildRenderNodes(
      '# 一级标题\n\n## 二级标题\n\n### 三级标题\n\n> [!IMPORTANT] 关注公众号后回复关键词。',
      'wechat',
    )

    render(
      <ArticlePreview
        nodes={nodes}
        platform="wechat"
        className="article-output"
        testId="wechat-preview"
      />,
    )

    expect(screen.getByTestId('wechat-preview')).toHaveClass('article-output-wechat')
    expect(screen.getByText('一级标题')).toHaveStyle({ color: '#1d4ed8', fontWeight: '700' })
    expect(screen.getByText('一、二级标题')).toHaveStyle({ color: '#7c3aed', fontWeight: '700' })
    expect(screen.getByText('三级标题')).toHaveStyle({ color: '#0f766e', fontWeight: '700' })
    expect(screen.getByText('重要提示')).toBeTruthy()
    expect(screen.queryByText(/\[!IMPORTANT\]/)).toBeNull()
  })
})
