import { describe, expect, it } from 'vitest'
import { buildRenderNodes, type RenderNode } from './renderers'
import { estimateFits, splitIntoCards, type FitsFn, type XhsCard } from './xhsLayout'

const nodesOf = (markdown: string) => buildRenderNodes(markdown, 'wechat', {}, { keepThematicBreaks: true })

const cost = (node: RenderNode): number => {
  switch (node.type) {
    case 'heading': return 10
    case 'paragraph': return [...node.text].length
    case 'list': return node.items.length * 10
    case 'code': return node.code.split('\n').length * 10
    case 'quote': return node.lines.length * 10
    case 'table': return (node.rows.length + 1) * 10
    case 'image': return 1000
    default: return 0
  }
}

const budgetFits = (budget: number): FitsFn => (candidate) =>
  candidate.reduce((sum, node) => sum + cost(node), 0) <= budget

const types = (card: XhsCard) => card.nodes.map((node) => node.type)

describe('splitIntoCards', () => {
  it('keeps H2 headings and their content on the current card when space allows', () => {
    const { cards, warnings } = splitIntoCards(nodesOf('## 背景\n\n段落一\n\n## 方案\n\n段落二'), budgetFits(500))
    expect(cards).toHaveLength(1)
    expect(cards.map(types)).toEqual([['heading', 'paragraph', 'heading', 'paragraph']])
    expect(cards[0].sectionTitle).toBe('一、背景')
    expect(warnings).toEqual([])
  })

  it('places a heading immediately after preceding text instead of starting a new card', () => {
    const { cards } = splitIntoCards(nodesOf('前面章节的最后一段。\n\n## CPU负责决定，存储器负责保存\n\n下一章节的内容。'), budgetFits(100))
    expect(cards.map(types)).toEqual([['paragraph', 'heading', 'paragraph']])
    expect(cards[0].sectionTitle).toBe('')
  })

  it('only starts a new card when there is not enough room and tracks the new section', () => {
    const { cards } = splitIntoCards(
      nodesOf(`## 背景\n\n${'甲'.repeat(10)}\n\n## 方案\n\n${'乙'.repeat(20)}`),
      budgetFits(30),
    )
    expect(cards.map(types)).toEqual([['heading', 'paragraph'], ['heading', 'paragraph']])
    expect(cards.map((card) => card.sectionTitle)).toEqual(['一、背景', '二、方案'])
  })

  it('does not force additional H1 headings onto a new card when the cover is disabled', () => {
    const { cards } = splitIntoCards(nodesOf('# 第一部分\n\n段落一\n\n# 第二部分\n\n段落二'), budgetFits(100))
    expect(cards.map(types)).toEqual([['heading', 'paragraph', 'heading', 'paragraph']])
  })

  it('treats a thematic break as a manual page break without rendering it', () => {
    const { cards } = splitIntoCards(nodesOf('段落一\n\n---\n\n段落二'), budgetFits(500))
    expect(cards.map(types)).toEqual([['paragraph'], ['paragraph']])
  })

  it('splits long code blocks by line and labels continuation chunks', () => {
    const code = Array.from({ length: 25 }, (_, index) => `line${index + 1}`).join('\n')
    const { cards } = splitIntoCards(nodesOf(`\`\`\`ts\n${code}\n\`\`\``), budgetFits(100))
    const chunks = cards.flatMap((card) => card.nodes).filter((node) => node.type === 'code')
    expect(chunks.length).toBe(3)
    expect(chunks.map((chunk) => chunk.type === 'code' && chunk.label)).toEqual([
      '代码示例（ts）',
      '代码示例（ts）（续）',
      '代码示例（ts）（续）',
    ])
    expect(chunks.map((chunk) => (chunk.type === 'code' ? chunk.code : '')).join('\n')).toBe(code)
  })

  it('numbers split code chunks continuously and keeps whole-block facts on every chunk', () => {
    const code = Array.from({ length: 25 }, (_, index) => `line${index + 1}${index === 11 ? ' // [!code warning] 关键' : ''}`).join('\n')
    const { cards } = splitIntoCards(nodesOf(`\`\`\`sv {start=100}\n${code}\n\`\`\``), budgetFits(100))
    const chunks = cards.flatMap((card) => card.nodes).filter((node) => node.type === 'code')
    expect(chunks.map((chunk) => chunk.startLine)).toEqual([100, 110, 120])
    for (const chunk of chunks) {
      expect(chunk).toMatchObject({
        lang: 'sv',
        blockStartLine: 100,
        blockEndLine: 124,
        maxLineWidth: 6,
        decorations: { 111: { kind: 'warning', note: '关键' } },
      })
      expect(chunk.blockCode?.split('\n')).toHaveLength(25)
      expect(chunk.blockCode).not.toContain('[!code')
    }
  })

  it('keeps the callout label on quote continuations and marks them as continued', () => {
    const quote = ['> [!TIP]', ...Array.from({ length: 6 }, (_, index) => `> 提示第 ${index + 1} 行`)].join('\n')
    const { cards } = splitIntoCards(nodesOf(quote), budgetFits(30))
    const chunks = cards.flatMap((card) => card.nodes).filter((node) => node.type === 'quote')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((chunk) => chunk.calloutLabel)).toEqual(chunks.map(() => '提示'))
    expect(chunks.map((chunk) => Boolean(chunk.continued))).toEqual(chunks.map((_, index) => index > 0))
  })

  it('keeps ordered list numbering continuous across split chunks', () => {
    const list = Array.from({ length: 12 }, (_, index) => `${index + 1}. 第 ${index + 1} 项`).join('\n')
    const { cards } = splitIntoCards(nodesOf(list), budgetFits(50))
    const lists = cards.flatMap((card) => card.nodes).filter((node) => node.type === 'list')
    expect(lists.map((node) => node.type === 'list' && [node.start, node.items.length])).toEqual([[1, 5], [6, 5], [11, 2]])
  })

  it('splits long paragraphs at sentence boundaries and preserves bold text', () => {
    const sentences = Array.from({ length: 8 }, (_, index) => `这是第${index + 1}句内容。`)
    const source = `**重点开头**${sentences.join('')}`
    const { cards } = splitIntoCards(nodesOf(source), budgetFits(30))
    const paragraphs = cards.flatMap((card) => card.nodes).filter((node) => node.type === 'paragraph')
    expect(paragraphs.length).toBeGreaterThan(1)
    expect(paragraphs.every((node) => [...node.text].length <= 30)).toBe(true)
    expect(paragraphs.map((node) => node.type === 'paragraph' && node.text).join('')).toBe(`重点开头${sentences.join('')}`)
    const first = paragraphs[0]
    expect(first.type === 'paragraph' && first.content?.[0]).toMatchObject({ type: 'text', value: '重点开头', bold: true })
  })

  it('falls back to character splitting for text without sentence punctuation', () => {
    const { cards } = splitIntoCards(nodesOf('字'.repeat(250)), budgetFits(100))
    expect(cards.map((card) => card.nodes.map((node) => node.type === 'paragraph' && [...node.text].length))).toEqual([[100], [100], [50]])
  })

  it('repeats the table header on every split chunk', () => {
    const rows = Array.from({ length: 12 }, (_, index) => `| r${index} | v${index} |`).join('\n')
    const { cards } = splitIntoCards(nodesOf(`| 名称 | 值 |\n| --- | --- |\n${rows}`), budgetFits(60))
    const tables = cards.flatMap((card) => card.nodes).filter((node) => node.type === 'table')
    expect(tables.length).toBe(3)
    expect(tables.every((node) => node.type === 'table' && node.header.join() === '名称,值')).toBe(true)
    expect(tables.reduce((sum, node) => sum + (node.type === 'table' ? node.rows.length : 0), 0)).toBe(12)
  })

  it('keeps a section heading together with the first part of oversized content', () => {
    const code = Array.from({ length: 20 }, (_, index) => `x${index}`).join('\n')
    const { cards } = splitIntoCards(nodesOf(`## 代码\n\n\`\`\`\n${code}\n\`\`\``), budgetFits(100))
    expect(types(cards[0])).toEqual(['heading', 'code'])
    expect(cards[0].nodes[1].type === 'code' && cards[0].nodes[1].code.split('\n')).toHaveLength(9)
  })

  it('moves a heading stranded at the bottom of a card to the next card', () => {
    const { cards } = splitIntoCards(nodesOf(`${'甲'.repeat(20)}\n\n### 小标题\n\n${'乙'.repeat(15)}`), budgetFits(30))
    expect(cards.map(types)).toEqual([['paragraph'], ['heading', 'paragraph']])
  })

  it('keeps trailing headings with the first chunk of oversized content without overflow or content loss', () => {
    const code = Array.from({ length: 20 }, (_, index) => `line${index}`).join('\n')
    const source = `${'甲'.repeat(80)}\n\n## 代码\n\n### 示例\n\n\`\`\`ts\n${code}\n\`\`\``
    const fits = budgetFits(100)
    const { cards, warnings } = splitIntoCards(nodesOf(source), fits)
    expect(cards.map(types)).toEqual([['paragraph'], ['heading', 'heading', 'code'], ['code'], ['code']])
    expect(cards[1].nodes[2].type === 'code' && cards[1].nodes[2].code.split('\n')).toHaveLength(8)
    expect(cards.every((card) => fits(card.nodes))).toBe(true)
    expect(cards.flatMap((card) => card.nodes).filter((node) => node.type === 'code').map((node) => node.code).join('\n')).toBe(code)
    expect(warnings).toEqual([])
  })

  it('never moves headings across a manual page break', () => {
    const { cards } = splitIntoCards(nodesOf(`${'甲'.repeat(10)}\n\n### 小标题\n\n---\n\n${'乙'.repeat(5)}`), budgetFits(30))
    expect(cards.map(types)).toEqual([['paragraph', 'heading'], ['paragraph']])
  })

  it('builds a cover from the H1, intro paragraph and H2 headings, moving them out of the body', () => {
    const source = '# 芯片验证入门\n\n一段导语。\n\n## 背景\n\n内容一\n\n## 方法\n\n内容二'
    const { cards } = splitIntoCards(nodesOf(source), budgetFits(500), { withCover: true })
    expect(cards[0].cover).toEqual({ title: '芯片验证入门', subtitle: '一段导语。', bullets: ['一、背景', '二、方法'] })
    const body = cards.slice(1).flatMap((card) => card.nodes)
    expect(body.some((node) => node.type === 'heading' && node.level === 1)).toBe(false)
    expect(body.some((node) => node.type === 'paragraph' && node.text === '一段导语。')).toBe(false)
    expect(cards[1].nodes[0]).toMatchObject({ type: 'heading', text: '一、背景' })
  })

  it('keeps a long intro in the body instead of truncating it on the cover', () => {
    const intro = '导语'.repeat(40)
    const { cards } = splitIntoCards(nodesOf(`# 标题\n\n${intro}\n\n## 小节\n\n内容`), budgetFits(500), { withCover: true })
    expect(cards[0].cover?.subtitle).toBeUndefined()
    expect(cards[1].nodes[0]).toMatchObject({ type: 'paragraph', text: intro })
  })

  it('returns the intro to the body when the subtitle does not fit on the cover', () => {
    const { cards } = splitIntoCards(nodesOf('# 标题\n\n短导语\n\n## 小节\n\n内容'), budgetFits(500), {
      withCover: true,
      fitsCover: (cover) => !cover.subtitle,
    })
    expect(cards[0].cover?.subtitle).toBeUndefined()
    expect(cards[1].nodes[0]).toMatchObject({ type: 'paragraph', text: '短导语' })
  })

  it('uses the fallback title for the cover when there is no H1', () => {
    const { cards } = splitIntoCards(nodesOf('## 第一页\n\n内容'), budgetFits(500), { withCover: true, fallbackTitle: 'deck' })
    expect(cards[0].cover?.title).toBe('deck')
  })

  it('drops cover bullets until the cover fits', () => {
    const source = ['# 标题', ...Array.from({ length: 5 }, (_, index) => `## 小节${index}\n\n内容`)].join('\n\n')
    const { cards } = splitIntoCards(nodesOf(source), budgetFits(500), {
      withCover: true,
      fitsCover: (cover) => cover.bullets.length <= 2,
    })
    expect(cards[0].cover?.bullets).toHaveLength(2)
  })

  it('warns when the result exceeds the card limit', () => {
    const source = Array.from({ length: 20 }, (_, index) => `## 节${index}\n\n内容`).join('\n\n---\n\n')
    const { cards, warnings } = splitIntoCards(nodesOf(source), budgetFits(500))
    expect(cards).toHaveLength(20)
    expect(warnings.some((warning) => warning.includes('超过小红书单篇 18 张上限'))).toBe(true)
  })

  it('warns once when an unsplittable image does not fit in a card', () => {
    const { cards, warnings } = splitIntoCards(nodesOf('段落\n\n![架构图](a.png)'), budgetFits(100))
    expect(cards.map(types)).toEqual([['paragraph'], ['image']])
    expect(warnings).toEqual(['「图片：架构图」无法完整放入单张卡片，请在原文中精简或手动拆分。'])
  })

  it('returns no cards for an empty document', () => {
    expect(splitIntoCards(nodesOf('  \n\n---\n'), budgetFits(100))).toEqual({ cards: [], warnings: ['原文为空，无法生成卡片。'] })
  })
})

describe('estimateFits', () => {
  it('accepts a short card and rejects a very long one', () => {
    const fits = estimateFits()
    expect(fits(nodesOf('## 标题\n\n一小段内容。'))).toBe(true)
    expect(fits(nodesOf(Array.from({ length: 40 }, () => '一段比较长的正文内容，用来测试估算器是否会拒绝。').join('\n\n')))).toBe(false)
  })

  it('accounts for the line number gutter when long code lines wrap', () => {
    const wide = Array.from({ length: 16 }, (_, index) => `assign bus_${index + 10} = (sel_a & data_a) | (sel_b & data_b) | sel_c;`).join('\n')
    const nodes = nodesOf(`\`\`\`sv\n${wide}\n\`\`\``)
    const budgetFor = (codeLineNumbers: boolean) => {
      let low = 0
      let high = 4000
      while (low < high) {
        const mid = (low + high) >> 1
        if (estimateFits(mid, { codeLineNumbers })(nodes)) high = mid
        else low = mid + 1
      }
      return low
    }
    expect(budgetFor(true)).toBeGreaterThan(budgetFor(false))
  })

  it('keeps the coarse browser pre-filter well above a full card of commented code', () => {
    const lines = Array.from({ length: 28 }, (_, index) => `cnt <= cnt + ${index}; // 第 ${index + 1} 行：带中文注释的验证代码`).join('\n')
    expect(estimateFits(1600)(nodesOf(`## 标题\n\n\`\`\`sv\n${lines}\n\`\`\``))).toBe(true)
  })
})
