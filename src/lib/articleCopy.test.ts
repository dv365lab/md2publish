import { describe, expect, it } from 'vitest'
import { buildArticleCopyPlan, buildWechatCopyPlan, WECHAT_ARTICLE_LIMIT, WECHAT_COPY_SAFE_LIMIT } from './articleCopy'
import { buildRenderNodes, renderClipboardArticle, renderClipboardNodesText, type RenderNode } from './renderers'
import { buildZsxqCopyPlan, ZSXQ_COPY_SAFE_LIMIT } from './zsxqCopy'

const paragraph = (text: string): RenderNode => ({ type: 'paragraph', text })
const heading = (text: string): RenderNode => ({ type: 'heading', text, level: 3 })

describe('platform article copy plans', () => {
  it('splits wechat at the conservative tool threshold and retains the final A181', () => {
    const nodes = Array.from({ length: 181 }, (_, index) => [heading(`Q${index + 1}`), paragraph(`A${index + 1} ${'内容'.repeat(310)}`)]).flat()
    const plan = buildWechatCopyPlan(nodes)
    expect(WECHAT_ARTICLE_LIMIT).toBe(50000)
    expect(WECHAT_COPY_SAFE_LIMIT).toBe(45000)
    expect(plan.error).toBeNull()
    expect(plan.parts.length).toBeGreaterThan(1)
    expect(plan.parts.every((part) => part.estimatedLength <= WECHAT_COPY_SAFE_LIMIT)).toBe(true)
    expect(plan.parts.flatMap((part) => part.nodes)).toEqual(nodes)
    expect(renderClipboardNodesText(plan.parts.at(-1)!.nodes, 'wechat')).toContain('A181')
    expect(plan.parts.slice(1).every((part) => part.nodes[0].type === 'heading')).toBe(true)
  })

  it('bounds the plain text fallback as well as image-based rich table content', () => {
    const table = (cell: string): RenderNode => ({ type: 'table', header: ['字段'], rows: [[cell]] })
    const nodes = [heading('Q1'), table('甲'.repeat(24000)), heading('Q2'), table('乙'.repeat(24000))]
    const plan = buildWechatCopyPlan(nodes)
    expect(plan.error).toBeNull()
    expect(plan.parts).toHaveLength(2)
    expect(plan.parts.map((part) => part.startTableIndex)).toEqual([0, 1])
    for (const part of plan.parts) {
      expect(renderClipboardNodesText(part.nodes, 'wechat').length).toBeLessThanOrEqual(part.estimatedLength)
      expect(part.estimatedLength).toBeLessThanOrEqual(WECHAT_COPY_SAFE_LIMIT)
    }
    const oversized = buildWechatCopyPlan([table('表'.repeat(45000))])
    expect(oversized.error).toMatch(/单个.*45000/)
    expect(oversized.parts).toEqual([])
    expect(buildZsxqCopyPlan([table('表'.repeat(45000))]).error).toBeNull()
  })

  it('counts actual code br lines even when the plain text formatter trims blank lines', () => {
    const node: RenderNode = { type: 'code', label: '代码示例', code: '\n'.repeat(100), trailingColon: false }
    expect(renderClipboardNodesText([node], 'wechat').length).toBeLessThan(20)
    const plan = buildArticleCopyPlan([node], 'wechat', 90)
    expect(plan.estimatedLength).toBeGreaterThanOrEqual(100)
    expect(plan.error).toMatch(/单个.*90/)
    expect(plan.parts).toEqual([])
  })

  it('uses each platform rendering when estimating quote labels and paragraph lines', () => {
    const nodes = buildRenderNodes('> 提示\n> 第二行\n\n正文第一行\n正文第二行', 'wechat')
    const plan = buildWechatCopyPlan(nodes)
    expect(plan.estimatedLength).toBeGreaterThanOrEqual(renderClipboardNodesText(nodes, 'wechat').length)
    expect(plan.error).toBeNull()
  })

  it.each(['zsxq', 'wechat'] as const)('preserves the existing %s clipboard text API', (platform) => {
    const source = '# 标题\n\n## 第一节\n\n正文。\n\n- 项目\n\n> 引用\n\n```ts\na()\nb()\n```\n\n| 字段 | 值 |\n| --- | --- |\n| 测试 | 内容 |'
    const nodes = buildRenderNodes(source, platform)
    expect(renderClipboardNodesText(nodes, platform)).toBe(renderClipboardArticle(source, platform))
  })

  it('keeps zsxq wrapper behavior and empty wechat output unchanged', () => {
    const nodes = [heading('Q1'), paragraph('甲'.repeat(94000)), heading('Q2'), paragraph('乙'.repeat(2000))]
    expect(buildArticleCopyPlan(nodes, 'zsxq', ZSXQ_COPY_SAFE_LIMIT)).toEqual(buildZsxqCopyPlan(nodes))
    expect(buildWechatCopyPlan([])).toEqual({ estimatedLength: 0, parts: [{ nodes: [], estimatedLength: 0, startTableIndex: 0 }], error: null })
  })
})
