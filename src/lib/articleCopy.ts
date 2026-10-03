import { renderClipboardNodesHtml, renderClipboardNodesText, type Platform, type RenderNode } from './renderers'

export const WECHAT_ARTICLE_LIMIT = 50000
export const WECHAT_COPY_SAFE_LIMIT = 45000

export type ArticleCopyPart = {
  nodes: RenderNode[]
  estimatedLength: number
  startTableIndex: number
}

export type ArticleCopyPlan = {
  estimatedLength: number
  parts: ArticleCopyPart[]
  error: string | null
}

const estimateNodeLength = (node: RenderNode, platform: Platform, container: HTMLTemplateElement) => {
  // Rich copies use table images. Their pixels/Base64 and source cell text
  // do not consume the text limit; only the image embed and its line do.
  container.innerHTML = renderClipboardNodesHtml([node], platform, ['data:image/png;base64,AA=='])
  const fragment = container.content
  // Count UTF-16, explicit code breaks, and both a block-ending newline and
  // possible spacing newline. Inline styles/attributes do not count.
  const richLength = (fragment.textContent?.length ?? 0)
    + fragment.querySelectorAll('img,br').length
    + fragment.querySelectorAll('p,li,pre,figure,figcaption,blockquote,ul,ol,h1,h2,h3,section').length * 2
  // WeChat can fall back to text, which contains full tables and code indents.
  // Reserve the inter-node separator too, so either clipboard format fits.
  return platform === 'wechat'
    ? Math.max(richLength, renderClipboardNodesText([node], platform).length + 2)
    : richLength
}

export const buildArticleCopyPlan = (nodes: RenderNode[], platform: Platform, safeLimit: number): ArticleCopyPlan => {
  const container = document.createElement('template')
  const measured = nodes.map((node) => ({ node, length: estimateNodeLength(node, platform, container) }))
  const estimatedLength = measured.reduce((length, entry) => length + entry.length, 0)
  const oversizedIndex = measured.findIndex((entry) => entry.length > safeLimit)
  if (oversizedIndex !== -1) {
    return {
      estimatedLength,
      parts: [],
      error: `第 ${oversizedIndex + 1} 个内容块过长，单个内容块超过 ${safeLimit} 字符的安全复制容量。请先将该段落、列表或代码块拆成较短的内容块，再复制。`,
    }
  }

  if (estimatedLength <= safeLimit) {
    return { estimatedLength, parts: [{ nodes, estimatedLength, startTableIndex: 0 }], error: null }
  }

  const groups: (typeof measured)[] = []
  for (const entry of measured) {
    if (entry.node.type === 'heading' || groups.length === 0) groups.push([])
    groups.at(-1)!.push(entry)
  }

  const parts: ArticleCopyPart[] = []
  let tableIndex = 0
  let current: ArticleCopyPart = { nodes: [], estimatedLength: 0, startTableIndex: 0 }
  const flush = () => {
    if (current.nodes.length === 0) return
    parts.push(current)
    current = { nodes: [], estimatedLength: 0, startTableIndex: tableIndex }
  }
  const append = (entries: typeof measured, length: number) => {
    if (current.estimatedLength + length > safeLimit) flush()
    for (const entry of entries) {
      current.nodes.push(entry.node)
      if (entry.node.type === 'table') tableIndex += 1
    }
    current.estimatedLength += length
  }

  for (const group of groups) {
    const length = group.reduce((total, entry) => total + entry.length, 0)
    if (length <= safeLimit) {
      // Keep a heading and its following answer together when they fit.
      append(group, length)
    } else {
      // Split large sections only between nodes to retain complete formatting.
      for (const entry of group) append([entry], entry.length)
    }
  }
  flush()
  return { estimatedLength, parts, error: null }
}

export const buildWechatCopyPlan = (nodes: RenderNode[]) => buildArticleCopyPlan(nodes, 'wechat', WECHAT_COPY_SAFE_LIMIT)
