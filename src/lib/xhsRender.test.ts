import { describe, expect, it } from 'vitest'
import { buildRenderNodes } from './renderers'
import { CODE_THEME_GITHUB_LIGHT, CODE_THEME_MOCHA, CODE_THEME_SLATE } from './xhsCode'
import { codeThemeFor, fitImageSize, renderXhsCardHtml, renderXhsInline, XHS_BODY_BLEED, type XhsMeta } from './xhsRender'
import { CALLOUT_LABELS, XHS_THEMES } from './xhsThemes'

const meta: XhsMeta = { series: '验证笔记', author: '@author', theme: 'paper' }
const nodesOf = (markdown: string) => buildRenderNodes(markdown, 'wechat')

describe('renderXhsCardHtml', () => {
  it('escapes text content and shows series, author and page numbers', () => {
    const html = renderXhsCardHtml(
      { nodes: [{ type: 'paragraph', text: '<script>alert(1)</script> & 更多' }], sectionTitle: '一、背景' },
      2,
      5,
      meta,
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; 更多')
    expect(html).toContain('验证笔记')
    expect(html).toContain('@author')
    expect(html).toContain('3 / 5')
    expect(html).toContain('一、背景')
    expect(html).toContain('class="xhs-flow"')
  })

  it('hides the header section title when the card already starts with that heading', () => {
    const html = renderXhsCardHtml({ nodes: nodesOf('## 背景\n\n内容'), sectionTitle: '一、背景' }, 0, 1, meta)
    expect(html.match(/一、背景/g)).toHaveLength(1)
  })

  it('keeps footer padding outside its text height so the author is not clipped by border-box', () => {
    const element = document.createElement('div')
    element.innerHTML = renderXhsCardHtml({ nodes: nodesOf('正文'), sectionTitle: '' }, 0, 1, {
      ...meta,
      author: '@芯片验证日记',
    })
    const footer = element.querySelector<HTMLElement>('.xhs-footer')!
    expect(footer.style.boxSizing).toBe('content-box')
    expect(footer.style.height).toBe(footer.style.lineHeight)
    expect(footer.firstElementChild?.textContent).toBe('@芯片验证日记')
  })

  it('renders the cover template', () => {
    const html = renderXhsCardHtml(
      { nodes: [], sectionTitle: '', cover: { title: '封面标题', subtitle: '副标题', bullets: ['一、要点'] } },
      0,
      3,
      meta,
    )
    expect(html).toContain('封面标题')
    expect(html).toContain('副标题')
    expect(html).toContain('一、要点')
    expect(html).toContain('justify-content:center')
  })

  it('applies theme tokens', () => {
    const html = renderXhsCardHtml({ nodes: nodesOf('内容'), sectionTitle: '' }, 0, 1, { ...meta, theme: 'ink' })
    expect(html).toContain(`background:${XHS_THEMES.ink.bg}`)
    expect(html).toContain(`font-size:${XHS_THEMES.ink.size.body}px`)
  })

  it('gives preloaded images explicit dimensions and replaces failed images with a placeholder', () => {
    const nodes = nodesOf('![宽图](wide.png)\n\n![坏图](broken.png)')
    const html = renderXhsCardHtml({ nodes, sectionTitle: '' }, 0, 1, meta, {
      'wide.png': { width: 1000, height: 500 },
      'broken.png': null,
    })
    expect(html).toContain('width="468" height="234"')
    expect(html).toContain('图片无法加载：坏图')
    expect(html).not.toContain('src="broken.png"')
  })

  it('renders list markers as text with continuous numbering', () => {
    const html = renderXhsCardHtml({ nodes: nodesOf('3. 甲\n4. 乙'), sectionTitle: '' }, 0, 1, meta)
    expect(html).toContain('>3.</span>')
    expect(html).toContain('>4.</span>')
  })

  it('widens the body clip box for shadows without changing the content box', () => {
    const element = document.createElement('div')
    element.innerHTML = renderXhsCardHtml({ nodes: nodesOf('正文'), sectionTitle: '' }, 0, 1, meta)
    const body = element.querySelector<HTMLElement>('.xhs-body')!
    expect(body.style.margin).toBe(`-${XHS_BODY_BLEED.top}px -${XHS_BODY_BLEED.x}px 0px`)
    expect(body.style.padding).toBe(`${XHS_BODY_BLEED.top}px ${XHS_BODY_BLEED.x}px 0px`)
    expect(body.style.overflow).toBe('hidden')
  })
})

describe('quote callouts', () => {
  const quoteHtml = (markdown: string, theme: XhsMeta['theme'] = 'paper') => {
    const element = document.createElement('div')
    element.innerHTML = renderXhsCardHtml({ nodes: nodesOf(markdown), sectionTitle: '' }, 0, 1, { ...meta, theme })
    return element.querySelector<HTMLElement>('.xhs-quote')!
  }

  it.each(CALLOUT_LABELS.map((label, index) => [label, ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'][index]] as const))(
    'gives the %s callout its own palette and a capsule label',
    (label, marker) => {
      const quote = quoteHtml(`> [!${marker}]\n> 内容`)
      const palette = XHS_THEMES.paper.quote.callouts[label]
      const aside = quote.querySelector('aside')!
      expect(aside.getAttribute('style')).toContain(`linear-gradient(135deg,${palette.bgFrom},${palette.bgTo})`)
      expect(aside.getAttribute('style')).toContain('box-shadow:0 6px 16px')
      const pill = aside.querySelector('div > span')!
      expect(pill.textContent).toContain(label)
      expect(pill.getAttribute('style')).toContain(`background:${palette.accent}`)
      expect(quote.getAttribute('style')).toBe('padding:0 0 20px;')
    },
  )

  it('draws plain quotes with the theme accent, an accent bar and a large quote mark', () => {
    const quote = quoteHtml('> 普通引用', 'red')
    const aside = quote.querySelector('aside')!
    expect(aside.getAttribute('style')).toContain(XHS_THEMES.red.quote.base.bgFrom)
    expect(aside.textContent).toContain('“')
    expect(aside.querySelector('div > span')).toBeNull()
  })

  it('uses dark callout palettes on the dark theme', () => {
    const aside = quoteHtml('> [!NOTE]\n> 内容', 'ink').querySelector('aside')!
    expect(aside.getAttribute('style')).toContain(XHS_THEMES.ink.quote.callouts.说明.bgFrom)
    expect(XHS_THEMES.ink.quote.callouts.说明.bgFrom).toMatch(/^rgba/)
  })

  it('marks continued callouts', () => {
    const html = renderXhsCardHtml(
      { nodes: [{ type: 'quote', lines: ['续写'], calloutLabel: '提示', continued: true }], sectionTitle: '' },
      0,
      1,
      meta,
    )
    expect(html).toContain('提示 · 续')
  })
})

describe('code windows in cards', () => {
  it('maps each card theme to its code theme', () => {
    expect(XHS_THEMES.paper.code).toBe(CODE_THEME_MOCHA)
    expect(XHS_THEMES.red.code).toBe(CODE_THEME_MOCHA)
    expect(XHS_THEMES.morandi.code).toBe(CODE_THEME_GITHUB_LIGHT)
    expect(XHS_THEMES.ink.code).toBe(CODE_THEME_SLATE)
    expect(XHS_THEMES.ink.code.bg).not.toBe(XHS_THEMES.ink.bg)
  })

  it('applies line number options and color overrides from meta', () => {
    const nodes = nodesOf('```sv\na\n```')
    const withNumbers = renderXhsCardHtml({ nodes, sectionTitle: '' }, 0, 1, meta)
    expect(withNumbers).toContain(`linear-gradient(90deg,${CODE_THEME_MOCHA.gutter.bg} 0px`)
    const without = renderXhsCardHtml({ nodes, sectionTitle: '' }, 0, 1, { ...meta, codeLineNumbers: false })
    expect(without).not.toContain(`linear-gradient(90deg,${CODE_THEME_MOCHA.gutter.bg}`)
    const recolored = renderXhsCardHtml({ nodes, sectionTitle: '' }, 0, 1, { ...meta, codeGutter: { fg: '#ff0000', bg: '' } })
    expect(recolored).toContain('color:#ff0000;')
    expect(recolored).toContain(`linear-gradient(90deg,${CODE_THEME_MOCHA.gutter.bg} 0px`)
    expect(codeThemeFor({ theme: 'paper' })).toBe(CODE_THEME_MOCHA)
  })
})

describe('renderXhsInline', () => {
  it('renders links as accent-colored text without href and keeps bold', () => {
    const html = renderXhsInline(
      [{ type: 'link', text: '文档', url: 'https://example.com' }, { type: 'text', value: '加粗', bold: true }],
      XHS_THEMES.paper,
    )
    expect(html).not.toContain('href')
    expect(html).toContain(`<span style="color:${XHS_THEMES.paper.accent};">文档</span>`)
    expect(html).toContain('<strong style="font-weight:700;">加粗</strong>')
  })
})

describe('fitImageSize', () => {
  it('scales to the content width and caps the height', () => {
    expect(fitImageSize({ width: 1000, height: 500 }, 468)).toEqual({ width: 468, height: 234 })
    expect(fitImageSize({ width: 400, height: 1600 }, 468)).toEqual({ width: 90, height: 360 })
    expect(fitImageSize({ width: 100, height: 50 }, 468)).toEqual({ width: 100, height: 50 })
  })
})
