import { describe, expect, it } from 'vitest'
import { buildRenderNodes, renderArticle, renderClipboardArticle, renderClipboardHtml } from './renderers'

describe('renderArticle', () => {
  const markdown = `# 主标题

## 二级标题

这是正文段落。

- 列表一
- 列表二

> 引用内容

\`\`\`js
console.log('hello')
\`\`\`

---

![封面图](https://example.com/a.png)`

  it('renders zsxq article output', () => {
    const result = renderArticle(markdown, 'zsxq')

    expect(result).toContain('【主标题】')
    expect(result).toContain('一、二级标题')
    expect(result).toContain('- 列表一')
    expect(result).toContain('> 引用内容')
    expect(result).toContain('代码示例（js）：')
    expect(result).toContain('[图片]')
  })

  it('renders wechat article output', () => {
    const result = renderArticle(markdown, 'wechat')

    expect(result).toContain('主标题')
    expect(result).toContain('一、二级标题')
    expect(result).toContain('• 列表一')
    expect(result).toContain('引用：引用内容')
    expect(result).toContain('代码示例（js）')
    expect(result).toContain('图注：封面图')
  })

  it.each(['zsxq', 'wechat'] as const)(
    'omits markdown separators from every %s output format',
    (platform) => {
      const source = '第一部分\n\n---\n\n## 第二部分'

      expect(buildRenderNodes(source, platform).some((node) => node.type === 'thematicBreak')).toBe(false)
      expect(renderArticle(source, platform)).not.toContain('——')
      expect(renderClipboardArticle(source, platform)).not.toContain('——')
      expect(renderClipboardHtml(source, platform)).not.toContain('>——')
    },
  )

  it('normalizes numbered headings and converts markdown tables', () => {
    const result = renderArticle(
      `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      'zsxq',
    )
    const nodes = buildRenderNodes(
      `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      'zsxq',
    )

    expect(result).toContain('一、先看结论：四种环境到底有什么不同')
    expect(result).not.toContain('一、一、先看结论')
    expect(result).toContain('使用场景 | 配置入口 | 最关键的区别')
    expect(nodes[1]).toMatchObject({
      type: 'table',
      header: ['使用场景', '配置入口', '最关键的区别'],
    })
  })

  it.each(['zsxq', 'wechat'] as const)(
    'preserves explicit section numbers and auto-numbers unnumbered sections for %s',
    (platform) => {
      const explicitNodes = buildRenderNodes(
        '## 一、先看结论\n\n## 二、开始之前\n\n## 三、开始配置',
        platform,
      )
      const automaticNodes = buildRenderNodes('## 第一部分\n\n## 第二部分\n\n## 第三部分', platform)

      expect(explicitNodes.map((node) => ('text' in node ? node.text : null))).toEqual([
        '一、先看结论',
        '二、开始之前',
        '三、开始配置',
      ])
      expect(automaticNodes.map((node) => ('text' in node ? node.text : null))).toEqual([
        '一、第一部分',
        '二、第二部分',
        '三、第三部分',
      ])
    },
  )

  it('uses stable clipboard table blocks for zsxq', () => {
    const result = renderClipboardArticle(
      `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      'zsxq',
    )

    expect(result).toContain('表格字段如下：')
    expect(result).toContain('使用场景：Windows + Claude Code')
    expect(result).toContain('配置入口：PowerShell 环境变量')
    expect(result).toContain('最关键的区别：PowerShell 使用 "$env:变量名=\'值\'"')
    expect(result).not.toContain('\t')
    expect(result).not.toContain('｜')
  })

  it('renders html clipboard table for zsxq', () => {
    const result = renderClipboardHtml(
      `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      'zsxq',
    )

    expect(result).toContain('<table border="1"')
    expect(result).toContain('>使用场景</th>')
    expect(result).toContain('>Windows + Claude Code</td>')
  })

  it.each(['zsxq', 'wechat'] as const)(
    'preserves nested navigation hierarchy and internal links in copied html for %s',
    (platform) => {
      const markdown = `## 导航栏

- [第一篇：精要入门与综合进阶](#第一篇精要入门与综合进阶)
  - [第一部分：AMBA ACE 协议面试题与详细答案](#第一部分-amba-ace-协议面试题与详细答案)
    - [一、ACE 基础与体系结构](#一ace-基础与体系结构)
      - [1. 什么是 ACE？](#1-什么是-ace)`

      const result = renderClipboardHtml(markdown, platform)

      expect(result.match(/<ul/g)).toHaveLength(4)
      expect(result).toContain(
        '<a href="#第一篇精要入门与综合进阶">第一篇：精要入门与综合进阶</a><ul>',
      )
      expect(result).toContain(
        '<a href="#1-什么是-ace">1. 什么是 ACE？</a>',
      )
      expect(result).not.toContain('（#第一篇精要入门与综合进阶）')
    },
  )

  it.each(['zsxq', 'wechat'] as const)(
    'copies colored bold headings for %s',
    (platform) => {
      const result = renderClipboardHtml('# 一级标题\n\n## 二级标题\n\n### 三级标题', platform)

      expect(result).toContain('<h1 style="color:#1d4ed8;font-weight:800;')
      expect(result).toContain('color:#7c3aed;font-weight:700;')
      expect(result).toContain('color:#0f766e;font-weight:700;')
      expect(result.match(/<strong>/g)).toHaveLength(3)
    },
  )

  it('copies wechat headings with font sizes larger than the 16px body text', () => {
    const markdown = '# 一级标题\n\n## 二级标题\n\n### 三级标题\n\n正文内容'
    const wechatHtml = renderClipboardHtml(markdown, 'wechat')
    const zsxqHtml = renderClipboardHtml(markdown, 'zsxq')

    expect(wechatHtml).toContain('font-size:32px;line-height:1.35;')
    expect(wechatHtml).toContain('font-size:24px;line-height:1.5;')
    expect(wechatHtml).toContain('font-size:20px;line-height:1.6;')
    expect(zsxqHtml).not.toContain('font-size:32px;')
    expect(zsxqHtml).not.toContain('font-size:24px;')
    expect(zsxqHtml).not.toContain('font-size:20px;')
  })

  it('keeps structural spacing between adjacent zsxq headings after inline styles are removed', () => {
    const markdown = '## 二、开始之前，需要准备什么\n\n### 1. 创建 DeepSeek API Key'
    const zsxqHtml = renderClipboardHtml(markdown, 'zsxq').replace(/ style="[^"]*"/g, '')
    const wechatHtml = renderClipboardHtml(markdown, 'wechat').replace(/ style="[^"]*"/g, '')

    expect(zsxqHtml).toContain('</h2><p>&nbsp;</p><h3>')
    expect(wechatHtml).toContain('</h2><h3>')
  })

  it('keeps readable paragraph margins in copied wechat html', () => {
    const result = renderClipboardHtml('第一段。\n\n第二段。', 'wechat')

    expect(result).toBe(
      '<p style="margin:0 0 16px;line-height:1.9;">第一段。</p>' +
        '<p style="margin:0 0 16px;line-height:1.9;">第二段。</p>',
    )
  })

  it('copies wechat code blocks as one editable box with compact line breaks', () => {
    const markdown = `\`\`\`bash
xrun -64bit -uvm -f filelist.f \\
  +UVM_TESTNAME=packet_stress_test \\
  -svseed random -l run_random.log
\`\`\``
    const wechatHtml = renderClipboardHtml(markdown, 'wechat')
    const zsxqHtml = renderClipboardHtml(markdown, 'zsxq')

    expect(wechatHtml).toContain('<section style="margin:24px 0;">')
    expect(wechatHtml).toContain('<section style="padding:18px 20px;')
    expect(wechatHtml).toContain('<p style="margin:0;padding:0;')
    expect(wechatHtml).toContain('background-color:#eff3f8')
    expect(wechatHtml).toContain('white-space:pre-wrap')
    expect(wechatHtml).toContain('text-align:left')
    expect(wechatHtml).toContain('word-spacing:normal')
    expect(wechatHtml).toContain('xrun -64bit -uvm -f filelist.f \\<br>  +UVM_TESTNAME=packet_stress_test')
    expect(wechatHtml).not.toContain('<pre')
    expect(wechatHtml).not.toContain('<code')
    expect(zsxqHtml).not.toContain('<section style="margin:24px 0;">')
  })

  it('keeps structural paragraph spacing for zsxq after inline styles are removed', () => {
    const result = renderClipboardHtml('第一段。\n\n第二段。', 'zsxq')
    const styleStripped = result.replace(/ style="[^"]*"/g, '')

    expect(styleStripped).toBe('<p>第一段。</p><p>&nbsp;</p><p>第二段。</p>')
  })

  it('keeps standalone and inline markdown images as real clipboard images', () => {
    const markdown = `正文之前 ![流程图](<images/flow chart.png>) 正文之后

![封面图](https://example.com/cover.png)`
    const result = renderClipboardHtml(markdown, 'wechat', {
      'images/flow chart.png': 'data:image/png;base64,ZmFrZQ==',
    })

    expect(result).toContain('src="data:image/png;base64,ZmFrZQ=="')
    expect(result).toContain('alt="流程图"')
    expect(result).toContain('src="https://example.com/cover.png"')
    expect(result).toContain('alt="封面图"')
    expect(result).toContain('max-width:100%')
    expect(result).toContain('height:auto')
    expect(result).not.toContain('来源：https://example.com/cover.png')

    const nodes = buildRenderNodes(markdown, 'wechat')
    expect(nodes.filter((node) => node.type === 'image')).toHaveLength(2)
  })

  it('replaces zsxq html tables with generated images at their original positions', () => {
    const result = renderClipboardHtml(
      `表格之前

| 字段 | 内容 |
| --- | --- |
| 平台 | 知识星球 |

表格之后`,
      'zsxq',
      {},
      ['data:image/png;base64,dGFibGU='],
    )

    expect(result).not.toContain('<table')
    expect(result).toContain('src="data:image/png;base64,dGFibGU="')
    expect(result).toContain('alt="表格 1"')
    expect(result).not.toContain('&nbsp;')
    expect(result).toContain('<figure style="margin:0;text-align:center;">')
    expect(result.indexOf('表格之前')).toBeLessThan(result.indexOf('alt="表格 1"'))
    expect(result.indexOf('alt="表格 1"')).toBeLessThan(result.indexOf('表格之后'))
  })
})
