import { describe, expect, it } from 'vitest'
import { buildRenderNodes, renderClipboardHtml, renderClipboardNodesHtml, type RenderNode } from './renderers'
import { buildZsxqCopyPlan, ZSXQ_ARTICLE_LIMIT, ZSXQ_COPY_SAFE_LIMIT } from './zsxqCopy'

const paragraph = (text: string): RenderNode => ({ type: 'paragraph', text })
const heading = (text: string): RenderNode => ({ type: 'heading', text, level: 3 })

describe('knowledge planet article copy limits', () => {
  it('keeps short and empty articles in one copy part', () => {
    const nodes = [heading('Q1'), paragraph('A1：完整答案。')]
    expect(buildZsxqCopyPlan(nodes)).toMatchObject({ parts: [{ nodes, startTableIndex: 0 }], error: null })
    expect(buildZsxqCopyPlan([])).toEqual({ estimatedLength: 0, parts: [{ nodes: [], estimatedLength: 0, startTableIndex: 0 }], error: null })
    expect(ZSXQ_ARTICLE_LIMIT).toBe(100000)
    expect(ZSXQ_COPY_SAFE_LIMIT).toBe(95000)
  })

  it('keeps the whole long article in ordered, bounded parts including A181', () => {
    const nodes = Array.from({ length: 181 }, (_, index) => [heading(`Q${index + 1}`), paragraph(`A${index + 1} ${'内容'.repeat(310)}`)]).flat()
    const plan = buildZsxqCopyPlan(nodes)
    expect(plan.error).toBeNull()
    expect(plan.parts.length).toBeGreaterThan(1)
    expect(plan.parts.flatMap((part) => part.nodes)).toEqual(nodes)
    expect(plan.parts.every((part) => part.estimatedLength <= ZSXQ_COPY_SAFE_LIMIT)).toBe(true)
    expect(plan.parts.at(-1)?.nodes.at(-1)).toEqual(nodes.at(-1))
    expect(plan.parts.slice(1).every((part) => part.nodes[0].type === 'heading')).toBe(true)
    expect(plan.estimatedLength).toBe(plan.parts.reduce((length, part) => length + part.estimatedLength, 0))
  })

  it('moves a question and its answer together rather than orphaning the heading', () => {
    const nodes = [heading('Q1'), paragraph('前'.repeat(94000)), heading('Q2'), paragraph('后'.repeat(2000))]
    const plan = buildZsxqCopyPlan(nodes)
    expect(plan.parts.map((part) => part.nodes)).toEqual([nodes.slice(0, 2), nodes.slice(2)])
  })

  it('counts UTF-16 text and conservative line breaks at the safe boundary', () => {
    const atBoundary = buildZsxqCopyPlan([paragraph('🙂'.repeat(47499))])
    expect(atBoundary.estimatedLength).toBe(ZSXQ_COPY_SAFE_LIMIT)
    expect(atBoundary.error).toBeNull()
    const tooLong = buildZsxqCopyPlan([paragraph('字'.repeat(94999))])
    expect(tooLong.error).toMatch(/单个.*95000/)
    expect(tooLong.parts).toEqual([])
  })

  it('does not count table text or image data URLs as body text', () => {
    const nodes: RenderNode[] = [
      { type: 'table', header: ['字段'], rows: [['表格内容'.repeat(30000)]] },
      { type: 'image', title: '[图片]', metaLabel: '说明', urlLabel: '链接', alt: '配图', url: 'cover.png', src: `data:image/png;base64,${'a'.repeat(200000)}` },
    ]
    const plan = buildZsxqCopyPlan(nodes)
    expect(plan.error).toBeNull()
    expect(plan.parts).toHaveLength(1)
    expect(plan.estimatedLength).toBeLessThan(20)
  })

  it('tracks original table positions across parts', () => {
    const table: RenderNode = { type: 'table', header: ['字段'], rows: [['值']] }
    const nodes = [heading('Q1'), table, paragraph('前'.repeat(94000)), heading('Q2'), table, paragraph('后'.repeat(2000))]
    const plan = buildZsxqCopyPlan(nodes)
    expect(plan.parts.map((part) => part.startTableIndex)).toEqual([0, 1])
  })

  it('splits a large heading group between blocks without losing content', () => {
    const nodes = [heading('Q1'), paragraph('甲'.repeat(60000)), paragraph('乙'.repeat(60000))]
    const plan = buildZsxqCopyPlan(nodes)
    expect(plan.error).toBeNull()
    expect(plan.parts).toHaveLength(2)
    expect(plan.parts.flatMap((part) => part.nodes)).toEqual(nodes)
    expect(plan.parts.every((part) => part.estimatedLength <= ZSXQ_COPY_SAFE_LIMIT)).toBe(true)
  })

  it('reports an oversized code or list block instead of silently truncating it', () => {
    const code: RenderNode = { type: 'code', label: '代码示例', code: 'x'.repeat(95000), trailingColon: true }
    const list: RenderNode = { type: 'list', ordered: false, start: 1, items: [{ blocks: [{ type: 'paragraph', content: [{ type: 'text', value: 'x'.repeat(95000) }] }] }] }
    for (const node of [code, list]) {
      const plan = buildZsxqCopyPlan([node])
      expect(plan.error).toMatch(/单个/)
      expect(plan.parts).toEqual([])
      expect(plan.estimatedLength).toBeGreaterThan(ZSXQ_COPY_SAFE_LIMIT)
    }
  })

  it('renders prebuilt nodes identically and preserves section numbering in later parts', () => {
    const source = `## 第一节\n\n${'甲'.repeat(94000)}\n\n## 第二节\n\n${'乙'.repeat(2000)}`
    const nodes = buildRenderNodes(source, 'zsxq')
    expect(renderClipboardNodesHtml(nodes, 'zsxq')).toBe(renderClipboardHtml(source, 'zsxq'))
    const plan = buildZsxqCopyPlan(nodes)
    expect(renderClipboardNodesHtml(plan.parts[1].nodes, 'zsxq')).toContain('二、第二节')
  })
})
