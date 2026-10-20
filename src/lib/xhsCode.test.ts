import { describe, expect, it } from 'vitest'
import { buildRenderNodes, type RenderNode } from './renderers'
import {
  CODE_THEME_MOCHA,
  codeFontSize,
  codeGutterWidth,
  estimateCodeHeight,
  highlightCode,
  renderXhsCode,
  resolveLanguage,
  splitHighlightedLines,
  type CodeRenderOptions,
} from './xhsCode'

type CodeNode = Extract<RenderNode, { type: 'code' }>

const codeNodeOf = (markdown: string) => buildRenderNodes(markdown, 'wechat')[0] as CodeNode

const options: CodeRenderOptions = {
  theme: CODE_THEME_MOCHA,
  fontSize: 13,
  lineHeight: 1.6,
  monoFamily: 'monospace',
  radius: 10,
  bottomSpace: 20,
  smallFontSize: 13,
}

const rowsOf = (html: string) => html.split('<div style="display:flex;align-items:stretch;').slice(1)
const count = (text: string, part: string) => text.split(part).length - 1

describe('resolveLanguage', () => {
  it('maps fence aliases to registered highlight.js languages', () => {
    expect(resolveLanguage('sv')).toBe('verilog')
    expect(resolveLanguage('SystemVerilog')).toBe('verilog')
    expect(resolveLanguage('py')).toBe('python')
    expect(resolveLanguage('vhdl')).toBe('vhdl')
    expect(resolveLanguage('tcl')).toBe('tcl')
  })

  it('returns undefined for empty or unregistered languages', () => {
    expect(resolveLanguage('')).toBeUndefined()
    expect(resolveLanguage('uvm')).toBeUndefined()
  })
})

describe('highlightCode', () => {
  const verilog = 'module m;\n/* line one\n   line two */\nassign a = 1;\nendmodule'

  it('keeps spans balanced per line and carries multi-line comment colors to the next line', () => {
    const { language, lines } = highlightCode(verilog, 'sv', CODE_THEME_MOCHA.tokens)
    expect(language).toBe('verilog')
    expect(lines).toHaveLength(5)
    for (const line of lines) expect(count(line, '<span')).toBe(count(line, '</span>'))
    expect(lines[2].startsWith(`<span style="color:${CODE_THEME_MOCHA.tokens.comment};">`)).toBe(true)
    expect(lines[0]).toContain(`color:${CODE_THEME_MOCHA.tokens.keyword};`)
    expect(lines.join('')).not.toContain('class=')
  })

  it('escapes unknown languages as plain text', () => {
    expect(highlightCode('<a & "b">', 'uvm', CODE_THEME_MOCHA.tokens)).toEqual({ lines: ['&lt;a &amp; &quot;b&quot;&gt;'] })
  })

  it('reopens nested spans after a newline', () => {
    expect(splitHighlightedLines('<span a><span b>x\ny</span></span>z')).toEqual([
      '<span a><span b>x</span></span>',
      '<span a><span b>y</span></span>z',
    ])
  })
})

describe('renderXhsCode', () => {
  it('draws a titled window with traffic lights, a gutter band and numbers from the start line', () => {
    const html = renderXhsCode(codeNodeOf('```sv {start=9}\na\nb\n```'), options)
    expect(html).toContain('#ff5f57')
    expect(html).toContain('>SV</span>')
    expect(html).toContain(`linear-gradient(90deg,${CODE_THEME_MOCHA.gutter.bg} 0px`)
    expect(html).toContain('box-shadow:0 6px 16px')
    expect(html).toContain('padding:0 0 20px;')
    const rows = rowsOf(html)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('>9</span>')
    expect(rows[1]).toContain('>10</span>')
  })

  it('keeps the shadow off the clipping layer so html2canvas-pro exports it', () => {
    const html = renderXhsCode(codeNodeOf('```\nx\n```'), options)
    const section = html.match(/<section style="([^"]*)">/)![1]
    expect(section).toContain('box-shadow')
    expect(section).not.toContain('overflow:hidden')
    expect(html).toMatch(/<section[^>]*><div style="border-radius:13px;overflow:hidden;">/)
  })

  it('supports hiding line numbers and window chrome, and marks continuations', () => {
    const node = { ...codeNodeOf('```py\nx = 1\n```'), label: '代码示例（py）（续）' }
    const html = renderXhsCode(node, { ...options, showLineNumbers: false, windowChrome: false })
    expect(html).not.toContain('#ff5f57')
    expect(html).not.toContain('linear-gradient(90deg')
    expect(html).not.toContain('text-align:right')
    expect(html).toContain('PY · 续')
    expect(renderXhsCode(codeNodeOf('```\nx\n```'), options)).toContain('>CODE</span>')
  })

  it('decorates marked lines, strikes removed lines without decoration colors and escapes notes', () => {
    const node = codeNodeOf([
      '```sv',
      'a; // [!code highlight]',
      'b; // [!code ++]',
      'c; // [!code --]',
      'd; // [!code warning] <b>位宽</b>',
      'e;',
      '```',
    ].join('\n'))
    const rows = rowsOf(renderXhsCode(node, options))
    const { decorations } = CODE_THEME_MOCHA
    expect(rows[0]).toContain(`border-left:3px solid ${decorations.highlight.bar}`)
    expect(rows[1]).toContain('>+</span>')
    expect(rows[2]).toContain('>−</span>')
    expect(rows[2]).toContain('text-decoration:line-through;')
    expect(rows.join('')).not.toContain('text-decoration-color')
    expect(rows[3]).toContain('&lt;b&gt;位宽&lt;/b&gt;')
    expect(rows[3]).toContain(`background:${decorations.warning.badgeBg}`)
    expect(rows[4]).not.toContain('border-left:3px')
    expect(rows.join('')).not.toContain('opacity:')
  })

  it('dims every non-focused line exactly once', () => {
    const node = codeNodeOf('```sv\na;\nb; // [!code focus]\nc; // [!code highlight]\nd;\n```')
    const rows = rowsOf(renderXhsCode(node, options))
    expect(rows.map((row) => count(row, 'opacity:'))).toEqual([1, 0, 1, 1])
    expect(rows[0]).toContain(`opacity:${CODE_THEME_MOCHA.focusDim};`)
  })

  it('keeps gutter width and font size of the whole block on split chunks', () => {
    const chunk: CodeNode = { ...codeNodeOf('```sv\nshort\n```'), startLine: 98, blockEndLine: 120, maxLineWidth: 70 }
    const html = renderXhsCode(chunk, options)
    expect(html).toContain(`font-size:${codeFontSize(13, 70)}px`)
    expect(html).toContain(`width:${codeGutterWidth(120, codeFontSize(13, 70))}px`)
    expect(codeFontSize(13, 48)).toBe(13)
    expect(codeFontSize(13, 50)).toBe(12)
    expect(codeFontSize(13, 61)).toBe(11)
  })

  it('highlights continuation chunks with the whole block as context', () => {
    const whole = codeNodeOf('```sv\nmodule m;\n/* one\n   two */\nassign a = 1;\n```')
    const chunk: CodeNode = { ...whole, code: '   two */\nassign a = 1;', startLine: 3, blockStartLine: 1, blockCode: whole.code }
    const rows = rowsOf(renderXhsCode(chunk, options))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain(`<span style="color:${CODE_THEME_MOCHA.tokens.comment};">   two */</span>`)
    expect(rows[0]).toContain('>3</span>')
  })

  it('uses a hanging indent for wrapped lines', () => {
    expect(renderXhsCode(codeNodeOf('```\nx\n```'), options)).toContain('padding:0 16px 0 calc(16px + 2ch);text-indent:-2ch;')
  })
})

describe('estimateCodeHeight', () => {
  const estimate = { fontSize: 13, lineHeight: 1.6, contentWidth: 468, bottomSpace: 20 }

  it('grows with wrapped lines, the gutter and line notes', () => {
    const short = codeNodeOf('```\na\nb\n```')
    // 58 columns: no wrap at full width, but wraps once the line number gutter takes its share.
    const wide = codeNodeOf(`\`\`\`\n${'x'.repeat(58)}\n${'y'.repeat(58)}\n\`\`\``)
    expect(estimateCodeHeight(wide, estimate)).toBeGreaterThan(estimateCodeHeight(short, estimate))
    expect(estimateCodeHeight(wide, { ...estimate, showLineNumbers: true }))
      .toBeGreaterThan(estimateCodeHeight(wide, { ...estimate, showLineNumbers: false }))
    const noted = codeNodeOf(`\`\`\`\n${'x'.repeat(40)} // [!code warning] 这是一条比较长的行尾说明\n\`\`\``)
    const plain = codeNodeOf(`\`\`\`\n${'x'.repeat(40)}\n\`\`\``)
    expect(estimateCodeHeight(noted, estimate)).toBeGreaterThan(estimateCodeHeight(plain, estimate))
  })
})
