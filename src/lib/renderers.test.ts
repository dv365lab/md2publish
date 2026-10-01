import { describe, expect, it } from 'vitest'
import { buildRenderNodes, renderArticle, renderClipboardArticle, renderClipboardHtml } from './renderers'

describe('ChatGPT content reference markers', () => {
  const marker = ':chatgpt-content-reference{index="0"}'

  it.each(['zsxq', 'wechat'] as const)('removes reference markers from every %s output without losing nearby text', (platform) => {
    const source = `前文。${marker}后文。

## 小节${marker}

- 列表前${marker}列表后
  > 引用前${marker}引用后

| 字段 | 内容 |
| --- | --- |
| 表格前${marker}表格后 | 保留 |

**加粗前${marker}加粗后**`
    const outputs = [
      JSON.stringify(buildRenderNodes(source, platform)),
      renderArticle(source, platform),
      renderClipboardArticle(source, platform),
      renderClipboardHtml(source, platform),
    ]
    for (const output of outputs) {
      expect(output).not.toContain('chatgpt-content-reference')
      expect(output).not.toContain('index=')
      for (const text of ['前文。后文。', '小节', '列表前列表后', '引用前引用后', '表格前表格后', '加粗前加粗后']) {
        expect(output).toContain(text)
      }
    }
  })

  it.each(['zsxq', 'wechat'] as const)('drops marker-only blocks, including different indices, from %s', (platform) => {
    const source = `正文之前\n\n:chatgpt-content-reference{index="1"}\n\n- :chatgpt-content-reference{index="23"}\n\n正文之后`
    expect(buildRenderNodes(source, platform).map((node) => node.type)).toEqual(['paragraph', 'paragraph'])
    expect(renderClipboardArticle(source, platform)).toBe('正文之前\n\n正文之后')
  })

  it.each(['zsxq', 'wechat'] as const)('keeps deliberate code literals in %s', (platform) => {
    const source = `\`${marker}\`\n\n\`\`\`text\n${marker}\n\`\`\``
    const nodes = buildRenderNodes(source, platform)
    expect(nodes[0]).toMatchObject({ type: 'paragraph', text: `“${marker}”` })
    expect(nodes[1]).toMatchObject({ type: 'code', code: marker })
  })
})

describe('remove every hyperlink from published content', () => {
  const source = `前文 [community.cadence](https://community.cadence.com/example) 后文。

| 维度 | ACE |
| --- | --- |
| 协议形态 | 保留说明 [jia](https://jia.je/kb/hardware/cache_coherence_protocol.html) |

- [独立链接](https://example.com/only)
- 保留列表项

> 引用 [来源资料](https://example.com/source)

\`[代码链接](https://example.com/code)\`

![配图](https://example.com/image.png)`

  it.each(['zsxq', 'wechat'] as const)('deletes labels and targets without leaving empty list items in %s', (platform) => {
    const nodes = buildRenderNodes(source, platform)
    const html = renderClipboardHtml(source, platform)
    for (const output of [JSON.stringify(nodes), renderArticle(source, platform), renderClipboardArticle(source, platform), html]) {
      for (const removed of ['community.cadence', 'jia', '独立链接', '来源资料', 'cache_coherence_protocol.html']) {
        expect(output).not.toContain(removed)
      }
      for (const kept of ['前文', '后文', '协议形态', '保留说明', '保留列表项', '引用', '代码链接', '配图']) {
        expect(output).toContain(kept)
      }
    }
    expect(html).not.toContain('<a ')
    expect(nodes.find((node) => node.type === 'list')).toMatchObject({
      items: [{ blocks: [{ type: 'paragraph', content: [{ type: 'text', value: '保留列表项' }] }] }],
    })
    expect(nodes.find((node) => node.type === 'table')).toMatchObject({ rows: [['协议形态', '保留说明']] })
  })

  it.each(['zsxq', 'wechat'] as const)('removes autolinks and link-only ordered items while keeping a linked image in %s', (platform) => {
    const source = `正文 <https://example.com/autolink> 继续。

3. [删除项](#target)
4. 保留项

[![架构图](https://example.com/diagram.png)](https://example.com/viewer)`
    const nodes = buildRenderNodes(source, platform)
    const html = renderClipboardHtml(source, platform)

    expect(nodes[0]).toMatchObject({ type: 'paragraph', text: '正文  继续。' })
    expect(nodes[1]).toMatchObject({ type: 'list', ordered: true, start: 4, items: [{ blocks: [{ type: 'paragraph' }] }] })
    expect(nodes[2]).toMatchObject({ type: 'image', alt: '架构图', url: 'https://example.com/diagram.png' })
    expect(html).toContain('alt="架构图"')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('删除项')
    expect(html).not.toContain('autolink')
  })
})

describe('web citation removal', () => {
  const source = `正文 [资料](https://example.com/reference) 后文。

| 维度 | ACE | CHI |
| --- | --- | --- |
| 协议形态 | 等信号 [jia](https://jia.je/kb/hardware/cache_coherence_protocol.html) | 分层结构 [community.cadence](https://community.cadence.com/example) |

- 阅读 [其他资料](https://example.com/other)

> 引用 [来源](https://example.com/source)`

  it.each(['zsxq', 'wechat'] as const)('omits citation labels and web addresses in %s outputs', (platform) => {
    const nodes = buildRenderNodes(source, platform)
    const copied = document.createElement('div')
    copied.innerHTML = renderClipboardHtml(source, platform)
    const visibleOutputs = [
      renderArticle(source, platform),
      renderClipboardArticle(source, platform),
      copied.textContent ?? '',
    ]

    for (const output of visibleOutputs) {
      for (const removed of ['资料', 'jia', 'community.cadence', '其他资料', '来源']) {
        expect(output).not.toContain(removed)
      }
      expect(output).not.toMatch(/https?:\/\//u)
      expect(output).not.toContain('（https')
      for (const kept of ['正文', '后文', '协议形态', '等信号', '分层结构', '阅读', '引用']) {
        expect(output).toContain(kept)
      }
    }
    expect(copied.querySelector('a')).toBeNull()
    expect(nodes.find((node) => node.type === 'table')).toMatchObject({
      rows: [['协议形态', '等信号', '分层结构']],
    })
    expect(nodes.find((node) => node.type === 'paragraph')).toMatchObject({ text: '正文  后文。' })
  })
})

describe('uploaded attachment link filtering', () => {
  const url = 'https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/test/paper.pdf?Signature=test-signature&Expires=123'
  const citation = `[上传附件引用](${url})`
  const outputs = (source: string, platform: 'zsxq' | 'wechat') => [
    JSON.stringify(buildRenderNodes(source, platform)),
    renderArticle(source, platform),
    renderClipboardArticle(source, platform),
    renderClipboardHtml(source, platform),
  ]

  it.each(['zsxq', 'wechat'] as const)('removes attachment labels and URLs throughout %s output', (platform) => {
    const source = `## 标题${citation}

前文**重点**。${citation}${citation}后文。[正常资料](https://example.com/paper.pdf)

- 列表正文${citation}
  > 引用正文${citation}

| 字段${citation} | 内容 |
| --- | --- |
| 表格正文${citation} | 保留内容 |

**加粗正文${citation}**`
    for (const output of outputs(source, platform)) {
      expect(output).not.toContain('上传附件引用')
      expect(output).not.toContain('ppl-ai-file-upload')
      expect(output).not.toContain('test-signature')
      expect(output).not.toContain('正常资料')
      for (const text of ['标题', '前文', '重点', '后文', '列表正文', '引用正文', '字段', '表格正文', '保留内容', '加粗正文']) {
        expect(output).toContain(text)
      }
    }
    expect(renderClipboardHtml(source, platform)).toContain('<strong style="font-weight:700;">重点</strong>')
  })

  it.each(['zsxq', 'wechat'] as const)('omits standalone attachment links and autolinks from %s output', (platform) => {
    const source = `前文。\n\n${citation}\n\n<${url}>\n\n${url}\n\n[另一附件](https://PPL-AI-FILE-UPLOAD.S3.AMAZONAWS.COM/test.pdf)\n\n后文。`
    expect(buildRenderNodes(source, platform).map((node) => node.type)).toEqual(['paragraph', 'paragraph'])
    expect(renderClipboardArticle(source, platform)).toBe('前文。\n\n后文。')
    expect(renderClipboardHtml(source, platform)).not.toContain('ppl-ai-file-upload')
  })

  it.each(['zsxq', 'wechat'] as const)('removes links at other hosts while retaining code and images in %s output', (platform) => {
    const normalUrls = [
      'https://example.com/?source=ppl-ai-file-upload.s3.amazonaws.com',
      'https://other-bucket.s3.amazonaws.com/paper.pdf?Signature=test',
      'https://ppl-ai-file-upload.s3.amazonaws.com.example.com/paper.pdf',
      '/files/ppl-ai-file-upload.s3.amazonaws.com.pdf',
    ]
    const source = normalUrls.map((target, index) => `- [正常链接${index + 1}](${target})`).join('\n')
    const nodes = buildRenderNodes(source, platform)
    const html = renderClipboardHtml(source, platform)
    expect(nodes).toEqual([])
    expect(html).toBe('')
    for (const output of [renderArticle(source, platform), renderClipboardArticle(source, platform)]) {
      expect(output).toBe('')
    }

    const literals = `\`${citation}\`\n\n\`\`\`markdown\n${citation}\n\`\`\`\n\n![原图片](${url})`
    const literalNodes = buildRenderNodes(literals, platform)
    expect(literalNodes[0]).toMatchObject({ type: 'paragraph', text: `“${citation}”` })
    expect(literalNodes[1]).toMatchObject({ type: 'code', code: citation })
    expect(literalNodes[2]).toMatchObject({ type: 'image', alt: '原图片', url })
  })
})

describe('quotes inside list items', () => {
  const source = `3. **STAR 法则描述（结构化）**:
   > DDR4 控制器（**S**），3 周内完成验证（**T**）。
   > UVM Scoreboard（**A**），覆盖率 **100%**，捕获 3 处 Bug（**R**）。

   引用后的说明。

   - 子列表
     > **内层引用**与[资料](https://example.com)

   最后说明。

4. 下一项`

  it.each(['zsxq', 'wechat'] as const)('preserves quote text and source order in every %s output', (platform) => {
    const expected = [
      'STAR 法则描述（结构化）', 'DDR4 控制器（S）', '3 周内完成验证（T）',
      'UVM Scoreboard（A）', '覆盖率 100%', '捕获 3 处 Bug（R）',
      '引用后的说明。', '子列表', '内层引用', '最后说明。', '下一项',
    ]
    const container = document.createElement('div')
    container.innerHTML = renderClipboardHtml(source, platform)
    for (const output of [renderArticle(source, platform), renderClipboardArticle(source, platform), container.textContent ?? '']) {
      let previous = -1
      for (const text of expected) {
        expect(output).toContain(text)
        const position = output.indexOf(text)
        expect(position).toBeGreaterThan(previous)
        expect(output.indexOf(text, position + text.length)).toBe(-1)
        previous = position
      }
    }
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('3')
    expect(container.querySelectorAll('li')).toHaveLength(3)
    expect(container.textContent).not.toContain('资料')
    expect(Array.from(container.querySelectorAll('strong'), (node) => node.textContent)).toEqual(
      expect.arrayContaining(['S', 'T', 'A', '100%', 'R', '内层引用']),
    )
  })

  it.each(['zsxq', 'wechat'] as const)('keeps a quote-only item and nested quote continuations for %s', (platform) => {
    const markdown = '- > **第一段**\n  >\n  > 第二段\n  >\n  > > **嵌套引用**'
    const html = renderClipboardHtml(markdown, platform)
    const container = document.createElement('div')
    container.innerHTML = html
    expect(container.textContent).toContain('第一段')
    expect(container.textContent).toContain('第二段')
    expect(container.textContent).toContain('嵌套引用')
    expect(Array.from(container.querySelectorAll('strong'), (node) => node.textContent)).toEqual(
      expect.arrayContaining(['第一段', '嵌套引用']),
    )
  })
})

describe('inline formatting regressions', () => {
  it.each(['-', '3.'])(
    'keeps bold labels and following punctuation in one wechat list paragraph (%s)',
    (marker) => {
      const source = `${marker} **DRAM**：说明它仍然属于动态存储器。\n${marker} **Synchronous**: 说明它的相关接口操作与时钟建立了规定的时序关系。`
      const container = document.createElement('div')
      container.innerHTML = renderClipboardHtml(source, 'wechat')

      const items = Array.from(container.querySelectorAll('li'))
      expect(items).toHaveLength(2)
      for (const [index, label] of ['DRAM', 'Synchronous'].entries()) {
        const paragraph = items[index].querySelector<HTMLParagraphElement>(':scope > p')
        expect(paragraph).not.toBeNull()
        expect(items[index].children).toHaveLength(1)
        expect(paragraph?.querySelector('strong')?.textContent).toBe(label)
        expect(paragraph?.textContent).toBe(items[index].textContent)
        expect(paragraph?.querySelector('strong')?.nextSibling?.textContent).toMatch(/^[：:]/u)
        expect(paragraph?.querySelector('br, p, div')).toBeNull()
        expect(paragraph?.style.margin).toBe('0px')
      }
    },
  )

  it('keeps wechat list paragraphs, quotes and nested lists as separate ordered blocks', () => {
    const source = '- **结果**：第一段说明。\n\n  > 引用内容。\n\n  - **子项**：子项说明。\n\n  **补充**：第二段说明。'
    const container = document.createElement('div')
    container.innerHTML = renderClipboardHtml(source, 'wechat')
    const item = container.querySelector('li')!

    expect(Array.from(item.children, (child) => child.tagName)).toEqual(['P', 'BLOCKQUOTE', 'UL', 'P'])
    expect(item.children[0].textContent).toBe('结果：第一段说明。')
    expect(item.children[1].textContent).toBe('引用内容。')
    expect(item.children[2].querySelector('li > p')?.textContent).toBe('子项：子项说明。')
    expect(item.children[3].textContent).toBe('补充：第二段说明。')
  })

  it.each(['zsxq', 'wechat'] as const)('removes links with bold labels without changing nearby %s text', (platform) => {
    const container = document.createElement('div')
    container.innerHTML = renderClipboardHtml(
      '- 前文 [阅读**上行（USP） **朝向根侧，两个**下行（DP）**内容](https://example.com) 后文', platform,
    )
    expect(container.querySelector('a, strong')).toBeNull()
    expect(container.textContent).toContain('前文')
    expect(container.textContent).toContain('后文')
    expect(container.textContent).not.toContain('上行（USP）')
    expect(container.textContent).not.toContain('下行（DP）')
  })

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
  ]))('keeps exact bold ranges with $name in $platform output', ({ platform, source, boldTexts }) => {
    const container = document.createElement('div')
    container.innerHTML = renderClipboardHtml(source, platform)

    expect(Array.from(container.querySelectorAll('strong'), (node) => node.textContent?.trim())).toEqual(boldTexts)
    expect(container.textContent).not.toContain('**')
    expect(container.textContent).toContain('朝向根侧，两个')
    expect(container.textContent).toContain('朝向设备侧。')
    expect(renderArticle(source, platform)).not.toContain('**')
    expect(renderClipboardArticle(source, platform)).not.toContain('**')
  })

  it('removes hyperlink text while leaving inline code literal', () => {
    const source = '- 前文 [阅读**重点**内容](https://example.com) 后文\n\n`[代码链接](https://example.com/a)`'
    const container = document.createElement('div')
    container.innerHTML = renderClipboardHtml(source, 'wechat')

    expect(container.querySelector('a, strong')).toBeNull()
    expect(renderClipboardArticle(source, 'wechat')).not.toContain('阅读重点内容')
    expect(container.textContent).toContain('前文')
    expect(container.textContent).toContain('后文')
    expect(container.textContent).toContain('[代码链接](https://example.com/a)')
  })

  it('filters defined footnotes without exposing their definitions', () => {
    const source = '正文[^1]与**重点[^other]**。\n\n[^1]: 脚注说明'
    expect(renderClipboardArticle(source, 'wechat')).toBe('正文与重点。')
    const html = renderClipboardHtml(source, 'wechat')
    expect(html).not.toContain('[^')
    expect(html).not.toContain('脚注说明')
  })

  it('preserves every quote continuation when cleaning inline markers', () => {
    const source = '> [!IMPORTANT]\n> **重要内容[^1]。 **\n> 后续内容[^2]。\n> 最后一行 **加粗**'
    const html = renderClipboardHtml(source, 'wechat')
    const container = document.createElement('div')
    container.innerHTML = html

    expect(container.textContent).toBe('重要提示重要内容。后续内容。最后一行 加粗')
    expect(Array.from(container.querySelectorAll('strong'), (node) => node.textContent)).toEqual(['重要内容。', '加粗'])
    expect(renderArticle('> 第一行[^1]\n> 第二行。', 'wechat')).toBe('引用：第一行\n引用：第二行。')
  })

  it.each(['zsxq', 'wechat'] as const)(
    'filters unresolved footnotes from every %s output format',
    (platform) => {
      const source = '正文[^1]继续[^source]。\n\n> 引用[^2]\n\n- 列表[^note]\n\n| 字段 | 内容 |\n| --- | --- |\n| 名称[^3] | 值[^value] |'
      const nodes = buildRenderNodes(source, platform)

      expect(JSON.stringify(nodes)).not.toMatch(/\[\^[^\]]+\]/u)
      expect(renderArticle(source, platform)).not.toMatch(/\[\^[^\]]+\]/u)
      expect(renderClipboardArticle(source, platform)).not.toMatch(/\[\^[^\]]+\]/u)
      expect(renderClipboardHtml(source, platform)).not.toMatch(/\[\^[^\]]+\]/u)
      expect(renderArticle(source, platform)).toContain('正文继续。')
    },
  )

  it.each(['zsxq', 'wechat'] as const)(
    'preserves standard and tolerant bold formatting in %s clipboard html',
    (platform) => {
      const source = '**加粗** 正文。\n\n**RC，全称Root Complex，根复合体。 **它是处理器。\n\n- **列表重点**\n\n> **引用重点**\n\n| 字段 | 内容 |\n| --- | --- |\n| 名称 | **表格重点** |'
      const html = renderClipboardHtml(source, platform)
      const container = document.createElement('div')
      container.innerHTML = html
      const boldTexts = Array.from(container.querySelectorAll('strong'), (node) => node.textContent?.trim())

      expect(boldTexts).toEqual(expect.arrayContaining([
        '加粗',
        'RC，全称Root Complex，根复合体。',
        '列表重点',
        '引用重点',
        '表格重点',
      ]))
      expect(container.textContent).not.toContain('**')
      expect(container.textContent).toContain('它是处理器。')
      expect(renderArticle(source, platform)).not.toContain('**')
      expect(renderClipboardArticle(source, platform)).not.toContain('**')
    },
  )

  it.each(['zsxq', 'wechat'] as const)(
    'keeps literal syntax in code and escaped asterisks for %s',
    (platform) => {
      const source = '`**行内代码**[^1]`\n\n```text\n**代码块**[^source]\n```\n\n\\*\\*字面星号\\*\\*'
      const container = document.createElement('div')
      container.innerHTML = renderClipboardHtml(source, platform)

      expect(container.textContent).toContain('**行内代码**[^1]')
      expect(container.textContent).toContain('**代码块**[^source]')
      expect(container.textContent).toContain('**字面星号**')
      const boldTexts = Array.from(container.querySelectorAll('strong'), (node) => node.textContent)
      expect(boldTexts).not.toContain('行内代码')
      expect(boldTexts).not.toContain('代码块')
      expect(boldTexts).not.toContain('字面星号')
    },
  )

  it.each(['zsxq', 'wechat'] as const)(
    'escapes html inside bold content copied for %s',
    (platform) => {
      const html = renderClipboardHtml('**1 < 2 & 3 > 2**', platform)
      const container = document.createElement('div')
      container.innerHTML = html

      expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 2')
      expect(container.querySelector('strong')?.textContent).toBe('1 < 2 & 3 > 2')
    },
  )
})

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
    'removes link-only nested navigation lists from copied %s html',
    (platform) => {
      const markdown = `## 导航栏

- [第一篇：精要入门与综合进阶](#第一篇精要入门与综合进阶)
  - [第一部分：AMBA ACE 协议面试题与详细答案](#第一部分-amba-ace-协议面试题与详细答案)
    - [一、ACE 基础与体系结构](#一ace-基础与体系结构)
      - [1. 什么是 ACE？](#1-什么是-ace)`

      const result = renderClipboardHtml(markdown, platform)

      expect(result).toContain('导航栏')
      expect(result).not.toContain('<ul')
      expect(result).not.toContain('<a ')
      expect(result).not.toContain('第一篇：精要入门与综合进阶')
    },
  )

  it('keeps colored bold headings for zsxq', () => {
    const result = renderClipboardHtml('# 一级标题\n\n## 二级标题\n\n### 三级标题', 'zsxq')

    expect(result).toContain('color:#1d4ed8;font-size:18px;font-weight:800;')
    expect(result).toContain('color:#7c3aed;font-size:17px;font-weight:700;')
    expect(result).toContain('color:#0f766e;font-size:15px;font-weight:700;')
    expect(result.match(/<strong\b/g)).toHaveLength(3)
  })

  it('uses neutral zsxq heading blocks that do not trigger Quill spacer paragraphs', () => {
    const html = renderClipboardHtml('## 二级标题\n\n正文。\n\n### 三级标题', 'zsxq')

    expect(html).not.toMatch(/<h[1-3]\b/u)
    expect(html).toContain(
      '<p class="ql-line-height-2" style="margin:0 0 18px;line-height:2;"><strong class="ql-size-17px"',
    )
    expect(html).toContain(
      '<p class="ql-line-height-1_75" style="margin:0;line-height:1.75;"><strong class="ql-size-15px"',
    )
  })

  it('keeps every zsxq heading level larger than the body with graded spacing', () => {
    const html = renderClipboardHtml(
      '# 一级标题\n\n正文一。\n\n## 二级标题\n\n正文二。\n\n### 三级标题\n\n正文三。',
      'zsxq',
    )

    expect(html.match(/class="ql-size-18px"/g)).toHaveLength(1)
    expect(html.match(/class="ql-size-17px"/g)).toHaveLength(1)
    expect(html.match(/class="ql-size-15px"/g)).toHaveLength(1)
    expect(html.match(/class="ql-size-14px"/g)).toHaveLength(3)
    expect(html).toContain('class="ql-line-height-2_5"')
    expect(html).toContain('class="ql-line-height-2"')
    expect(html).toContain('class="ql-line-height-1_75"')
    expect(html.match(/font-weight:(?:700|800)/g)).toHaveLength(3)
    expect(html.match(/<strong\b/g)).toHaveLength(3)
  })

  it('copies wechat headings with a compact neutral hierarchy', () => {
    const html = renderClipboardHtml('# 一级标题\n\n## 二级标题\n\n### 三级标题', 'wechat')

    expect(html).toContain('font-size:26px;line-height:1.4;')
    expect(html).toContain('font-size:22px;line-height:1.45;')
    expect(html).toContain('font-size:20px;line-height:1.55;')
    expect(html.match(/color:#1f2937;font-weight:700/g)).toHaveLength(3)
    expect(html.match(/<strong>/g)).toHaveLength(3)
  })

  it('uses compact explicit spacing between adjacent zsxq headings', () => {
    const markdown = '## 二、开始之前，需要准备什么\n\n### 1. 创建 DeepSeek API Key'
    const zsxqHtml = renderClipboardHtml(markdown, 'zsxq')
    const wechatHtml = renderClipboardHtml(markdown, 'wechat')

    expect(zsxqHtml).not.toContain('&nbsp;')
    expect(zsxqHtml).toContain(
      '<p class="ql-line-height-2" style="margin:0 0 18px;line-height:2;"><strong class="ql-size-17px"',
    )
    expect(zsxqHtml).toContain(
      '<p class="ql-line-height-1_75" style="margin:0;line-height:1.75;"><strong class="ql-size-15px"',
    )
    expect(wechatHtml.replace(/ style="[^"]*"/g, '')).toContain('</h2><h3>')
  })

  it('uses balanced body line spacing in copied html', () => {
    const wechatHtml = renderClipboardHtml('第一段。\n\n第二段。', 'wechat')
    const zsxqHtml = renderClipboardHtml('第一段。\n\n第二段。', 'zsxq')

    expect(wechatHtml).toBe(
      '<p style="margin:0 0 14px;color:#374151;font-size:16px;line-height:1.75;text-align:left;">第一段。</p>' +
        '<p style="margin:0 0 14px;color:#374151;font-size:16px;line-height:1.75;text-align:left;">第二段。</p>',
    )
    expect(zsxqHtml).toBe(
      '<p class="ql-line-height-1_6" style="margin:0 0 18px;line-height:1.6;"><span class="ql-size-14px" style="font-size:14px;">第一段。</span></p>' +
        '<p class="ql-line-height-1_6" style="margin:0;line-height:1.6;"><span class="ql-size-14px" style="font-size:14px;">第二段。</span></p>',
    )
  })

  it('copies zsxq blocks with preview-like spacing instead of empty spacer paragraphs', () => {
    const html = renderClipboardHtml(
      `波形轨道为空，不是设计或仿真本身出错。

> 关键认知：波形里没有值，而是对象没有被记录下来。

## 根因分类与解决方案

可能原因可归纳为四大类。

### 原因 1：信号缺少读访问权限`,
      'zsxq',
    )

    expect(html).not.toContain('&nbsp;')
    expect(html).toContain(
      '<p class="ql-line-height-1_6" style="margin:0 0 18px;line-height:1.6;"><span class="ql-size-14px" style="font-size:14px;">波形轨道为空，不是设计或仿真本身出错。</span></p>',
    )
    expect(html).toContain(
      '<p class="ql-line-height-1_6" style="margin:0 0 18px;line-height:1.6;"><span class="ql-size-14px" style="color:#475569;font-size:14px;"><strong style="color:#94a3b8;">▍</strong>',
    )
    expect(html).not.toContain('<blockquote')
    expect(html).not.toMatch(/<h[1-3]\b/u)
  })

  it('uses explicit, balanced spacing around wechat lists', () => {
    const html = renderClipboardHtml(
      '列表前的正文。\n\n- 第一项\n- 第二项\n\n列表后的正文。',
      'wechat',
    )

    expect(html).toContain(
      '<ul style="margin:0 0 14px;padding-left:1.5em;color:#374151;font-size:16px;line-height:1.75;text-align:left;">',
    )
    expect(html.match(/<li style="margin:0;padding:0;line-height:1.75;">/g)).toHaveLength(2)
    expect(html).toContain('</p><ul style="margin:0 0 14px;')
    expect(html).toContain('</ul><p style="margin:0 0 14px;')
  })

  it('uses balanced explicit spacing around zsxq lists without empty paragraphs', () => {
    const html = renderClipboardHtml(
      '列表前的正文。\n\n- 第一项\n- 第二项\n\n列表后的正文。',
      'zsxq',
    )
    const styleStripped = html.replace(/ style="[^"]*"/g, '')

    expect(html).toContain('<ul style="margin:0 0 18px;padding-left:1.5em;line-height:1.75;">')
    expect(styleStripped).toBe(
      '<p class="ql-line-height-1_6"><span class="ql-size-14px">列表前的正文。</span></p>' +
        '<ul><li><span class="ql-size-14px">第一项</span></li>' +
        '<li><span class="ql-size-14px">第二项</span></li></ul>' +
        '<p class="ql-line-height-1_6"><span class="ql-size-14px">列表后的正文。</span></p>',
    )
    expect(html).not.toContain('&nbsp;')
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
    expect(zsxqHtml).not.toContain('<div>')
    expect(zsxqHtml).toContain('</p><pre style="margin:0;')
  })

  it('formats markdown IMPORTANT quotes as clean wechat callouts', () => {
    const html = renderClipboardHtml(
      '> [!IMPORTANT] 完整资料获取方式：关注公众号后回复关键词。\n> 第二行说明。',
      'wechat',
    )

    expect(html).not.toContain('[!IMPORTANT]')
    expect(html).toContain('重要提示')
    expect(html).toContain('background:#f7f8fa')
    expect(html).toContain('完整资料获取方式：关注公众号后回复关键词。')
    expect(html).toContain('第二行说明。')
  })

  it('does not add empty paragraphs between copied zsxq paragraphs', () => {
    const result = renderClipboardHtml('第一段。\n\n第二段。', 'zsxq')

    expect(result).not.toContain('&nbsp;')
    expect(result).toContain('margin:0 0 18px;')
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

  it.each(['zsxq', 'wechat'] as const)(
    'replaces %s html tables with generated images at their original positions',
    (platform) => {
      const result = renderClipboardHtml(
        `表格之前

| 字段 | 内容 |
| --- | --- |
| 平台 | 知识星球 |

表格之后`,
        platform,
        {},
        ['data:image/png;base64,dGFibGU='],
      )

      expect(result).not.toContain('<table')
      expect(result).toContain('src="data:image/png;base64,dGFibGU="')
      expect(result).toContain('alt="表格 1"')
      expect(result).not.toContain('&nbsp;')
      expect(result.indexOf('表格之前')).toBeLessThan(result.indexOf('alt="表格 1"'))
      expect(result.indexOf('alt="表格 1"')).toBeLessThan(result.indexOf('表格之后'))
    },
  )
})

describe('wechat soft line breaks in clipboard html', () => {
  it('keeps each newline-separated recruiting detail as an independent paragraph', () => {
    const markdown = '帮一家靠谱的芯片公司找人：\n🔹 项目：TSN验证；\n🔹 周期：3个月；\n🔹 人数：3-4人。'
    const container = document.createElement('div')
    container.innerHTML = renderClipboardHtml(markdown, 'wechat')

    const paragraphs = Array.from(container.querySelectorAll(':scope > p'))
    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
      '帮一家靠谱的芯片公司找人：',
      '🔹 项目：TSN验证；',
      '🔹 周期：3个月；',
      '🔹 人数：3-4人。',
    ])
    expect(paragraphs.every((paragraph) => !paragraph.innerHTML.includes('\n'))).toBe(true)
  })

  it('keeps inline bold ranges valid when a soft line break splits one bold run', () => {
    const container = document.createElement('div')
    container.innerHTML = renderClipboardHtml('**第一行\n第二行**\n第三行', 'wechat')
    const paragraphs = Array.from(container.querySelectorAll(':scope > p'))

    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual(['第一行', '第二行', '第三行'])
    expect(paragraphs[0].querySelector('strong')?.textContent).toBe('第一行')
    expect(paragraphs[1].querySelector('strong')?.textContent).toBe('第二行')
  })
})
