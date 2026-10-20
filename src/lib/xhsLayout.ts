import { displayWidth } from './codeMeta'
import type { InlineContent, ListItemBlock } from './markdown'
import type { RenderNode } from './renderers'
import { estimateCodeHeight } from './xhsCode'

export const XHS_CARD_WIDTH = 540 // CSS px; exported at scale 2 → 1080×1440 (3:4)
export const XHS_CARD_HEIGHT = 720
export const XHS_EXPORT_SCALE = 2
export const XHS_MAX_CARDS = 18
export const XHS_TITLE_LIMIT = 20
export const XHS_CAPTION_LIMIT = 1000
export const XHS_FIT_SAFETY = 8
/** Space below shadowed blocks (code windows, quotes); counted in layout so the body never clips a shadow. */
export const XHS_SHADOW_SPACE = 20
export const XHS_COVER_BULLET_LIMIT = 6
export const XHS_COVER_SUBTITLE_LIMIT = 60

export type XhsCover = { title: string; subtitle?: string; bullets: string[] }

export type XhsCard = {
  nodes: RenderNode[]
  sectionTitle: string
  cover?: XhsCover
}

/** Decides whether a group of nodes fits in one card body. DOM-measured in the browser, estimated in tests. */
export type FitsFn = (candidate: RenderNode[]) => boolean

export type XhsSplitOptions = {
  withCover?: boolean
  fallbackTitle?: string
  fitsCover?: (cover: XhsCover) => boolean
  maxCards?: number
}

export type XhsSplitResult = { cards: XhsCard[]; warnings: string[] }

type Paragraph = Extract<RenderNode, { type: 'paragraph' }>
type Heading = Extract<RenderNode, { type: 'heading' }>

const inlineValue = (part: InlineContent) => (part.type === 'text' ? part.value : part.text)
export const inlineText = (content: InlineContent[] = []) => content.map(inlineValue).join('')

export const countChars = (value: string) => [...value].length

export const clampText = (value: string, limit: number) => {
  const chars = [...value.trim()]
  if (limit <= 0) return ''
  return chars.length <= limit ? chars.join('') : `${chars.slice(0, limit - 1).join('')}…`
}

const sliceInline = (content: InlineContent[], start: number, end: number): InlineContent[] => {
  let offset = 0
  return content.flatMap((part) => {
    const value = inlineValue(part)
    const sliced = value.slice(Math.max(0, start - offset), Math.max(0, end - offset))
    offset += value.length
    if (!sliced) return []
    return [part.type === 'text' ? { ...part, value: sliced } : { ...part, text: sliced, content: undefined }]
  })
}

const isHeading = (node: RenderNode | undefined): node is Heading => node?.type === 'heading'

const listItemText = (item: ListItemBlock): string =>
  item.blocks
    .map((block) => {
      if (block.type === 'paragraph') return inlineText(block.content)
      if (block.type === 'quote') return block.content.map((line) => inlineText(line)).join('\n')
      return block.items.map(listItemText).join('\n')
    })
    .join('\n')

export const describeNode = (node: RenderNode) => {
  switch (node.type) {
    case 'heading': return `标题：${node.text}`
    case 'paragraph': return `段落：${clampText(node.text, 20)}`
    case 'code': return node.label
    case 'table': return `表格（${clampText(node.header.join(' / '), 30)}）`
    case 'image': return `图片：${node.alt}`
    case 'list': return `列表：${clampText(node.items[0] ? listItemText(node.items[0]) : '', 20)}`
    case 'quote': return `引用：${clampText(node.lines[0] ?? '', 20)}`
    default: return '内容块'
  }
}

// ---------- oversized node splitting ----------

type ChunkContext = { continuation: boolean; offset: number }

/**
 * Splits `pieces` into consecutive chunks, each as long as still fits (binary search).
 * The first chunk is measured together with `prefix` (e.g. the section heading it shares a
 * card with); if not even one piece fits beside the prefix, it is measured alone instead.
 * A single piece that never fits still forms its own chunk so content is never dropped.
 */
const greedyChunks = <T>(
  pieces: T[],
  build: (subset: T[], context: ChunkContext) => RenderNode,
  fits: FitsFn,
  prefix: RenderNode[],
): RenderNode[] => {
  const chunks: RenderNode[] = []
  let cursor = 0
  while (cursor < pieces.length) {
    const rest = pieces.slice(cursor)
    const context = { continuation: cursor > 0, offset: cursor }
    const longest = (lead: RenderNode[]) => {
      let low = 1
      let high = rest.length
      let best = 0
      while (low <= high) {
        const mid = (low + high) >> 1
        if (fits([...lead, build(rest.slice(0, mid), context)])) {
          best = mid
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      return best
    }
    let take = longest(cursor === 0 ? prefix : [])
    if (take === 0 && cursor === 0 && prefix.length) take = longest([])
    take = Math.max(1, take)
    chunks.push(build(rest.slice(0, take), context))
    cursor += take
  }
  return chunks
}

const SENTENCE_BOUNDARY = /(?<=[。！？；!?;\n]|\. )/u

/** Splits inline content at sentence boundaries while preserving bold and link parts. */
const splitInlineBySentence = (content: InlineContent[]): InlineContent[][] => {
  const sentences: InlineContent[][] = [[]]
  for (const part of content) {
    if (part.type !== 'text') {
      sentences.at(-1)!.push(part)
      continue
    }
    part.value.split(SENTENCE_BOUNDARY).forEach((segment, index) => {
      if (!segment) return
      if (index > 0 && sentences.at(-1)!.length) sentences.push([])
      sentences.at(-1)!.push({ ...part, value: segment })
    })
  }
  return sentences.filter((sentence) => inlineText(sentence).trim())
}

const paragraphFrom = (content: InlineContent[]): Paragraph => ({
  type: 'paragraph',
  text: inlineText(content).trim(),
  content,
})

const splitParagraphByChars = (node: Paragraph, fits: FitsFn, prefix: RenderNode[]) => {
  const content = node.content ?? [{ type: 'text' as const, value: node.text }]
  const chars = [...inlineText(content)]
  if (chars.length <= 1) return [node]
  const offsets = [0]
  for (const char of chars) offsets.push(offsets.at(-1)! + char.length)
  return greedyChunks(
    chars,
    (subset, { offset }) => paragraphFrom(sliceInline(content, offsets[offset], offsets[offset + subset.length])),
    fits,
    prefix,
  )
}

const splitParagraph = (node: Paragraph, fits: FitsFn, prefix: RenderNode[]) => {
  const content = node.content ?? [{ type: 'text' as const, value: node.text }]
  const sentences = splitInlineBySentence(content)
  const chunks = sentences.length > 1
    ? greedyChunks(sentences, (subset) => paragraphFrom(subset.flat()), fits, prefix)
    : [node]
  // A single sentence can still be too tall (e.g. long text without punctuation), or too
  // tall to sit beside the pending heading; fall back to character-level splitting.
  return chunks.flatMap((chunk, index) => {
    const lead = index === 0 ? prefix : []
    if (chunk.type !== 'paragraph' || fits([...lead, chunk])) {
      return [chunk]
    }
    return splitParagraphByChars(chunk, fits, lead)
  })
}

const splitList = (node: Extract<RenderNode, { type: 'list' }>, fits: FitsFn, prefix: RenderNode[]) =>
  node.items.length <= 1
    ? [node]
    : greedyChunks(
        node.items,
        (subset, { offset }) => ({ type: 'list', ordered: node.ordered, start: node.start + offset, items: subset }),
        fits,
        prefix,
      )

const splitCode = (node: Extract<RenderNode, { type: 'code' }>, fits: FitsFn, prefix: RenderNode[]) => {
  const lines = node.code.split('\n')
  if (lines.length <= 1) return [node]
  const start = node.startLine ?? 1
  // Every chunk keeps whole-block facts so gutter width, font size and highlighting stay consistent across cards.
  const block = {
    blockEndLine: node.blockEndLine ?? start + lines.length - 1,
    maxLineWidth: node.maxLineWidth ?? Math.max(0, ...lines.map(displayWidth)),
    blockCode: node.blockCode ?? node.code,
    blockStartLine: node.blockStartLine ?? start,
  }
  return greedyChunks(
    lines,
    (subset, { continuation, offset }): RenderNode => ({
      ...node,
      ...block,
      label: continuation ? `${node.label}（续）` : node.label,
      code: subset.join('\n'),
      startLine: start + offset,
    }),
    fits,
    prefix,
  )
}

const splitQuote = (node: Extract<RenderNode, { type: 'quote' }>, fits: FitsFn, prefix: RenderNode[]) => {
  if (node.lines.length <= 1) return [node]
  const pieces = node.lines.map((line, index) => ({ line, content: node.content?.[index] }))
  return greedyChunks(
    pieces,
    (subset, { continuation }) => ({
      type: 'quote',
      lines: subset.map((piece) => piece.line),
      content: subset.every((piece) => piece.content) ? subset.map((piece) => piece.content!) : undefined,
      // Continuations keep the callout so the color stays the same; the label is marked「续」.
      calloutLabel: node.calloutLabel,
      ...(continuation || node.continued ? { continued: true } : {}),
    }),
    fits,
    prefix,
  )
}

const splitTable = (node: Extract<RenderNode, { type: 'table' }>, fits: FitsFn, prefix: RenderNode[]) => {
  if (node.rows.length <= 1) return [node]
  const pieces = node.rows.map((row, index) => ({ row, content: node.rowsContent?.[index] }))
  return greedyChunks(
    pieces,
    (subset) => ({
      type: 'table',
      header: node.header,
      rows: subset.map((piece) => piece.row),
      headerContent: node.headerContent,
      rowsContent: subset.every((piece) => piece.content) ? subset.map((piece) => piece.content!) : undefined,
    }),
    fits,
    prefix,
  )
}

export const splitOversized = (node: RenderNode, fits: FitsFn, prefix: RenderNode[] = []): RenderNode[] => {
  switch (node.type) {
    case 'paragraph':
      return splitParagraph(node, fits, prefix)
    case 'list':
      return splitList(node, fits, prefix)
    case 'code':
      return splitCode(node, fits, prefix)
    case 'quote':
      return splitQuote(node, fits, prefix)
    case 'table':
      return splitTable(node, fits, prefix)
    default:
      return [node] // headings and images cannot be split
  }
}

// ---------- cover ----------

const isBlankParagraph = (node: RenderNode) =>
  node.type === 'paragraph' && !node.text.trim() && !inlineText(node.content).trim()

export const buildCover = (
  nodes: RenderNode[],
  fallbackTitle?: string,
): { cover: XhsCover; rest: RenderNode[]; restWithIntro: RenderNode[] } => {
  const h1Index = nodes.findIndex((node) => isHeading(node) && node.level === 1)
  const firstH2Index = nodes.findIndex((node) => isHeading(node) && node.level === 2)
  const firstHeading = nodes.find(isHeading)
  const title =
    (h1Index >= 0 && (nodes[h1Index] as Heading).text.trim()) ||
    fallbackTitle?.trim() ||
    firstHeading?.text.trim() ||
    '未命名笔记'
  const introEnd = firstH2Index >= 0 ? firstH2Index : nodes.length
  const intro = nodes
    .slice(h1Index >= 0 ? h1Index + 1 : 0, introEnd)
    .find((node): node is Paragraph => node.type === 'paragraph' && Boolean(node.text.trim()))
  const introText = intro ? intro.text.replace(/\s*\n\s*/g, ' ').trim() : ''
  // A short intro moves onto the cover as its subtitle; a long one stays in the body.
  const subtitle = introText && countChars(introText) <= XHS_COVER_SUBTITLE_LIMIT ? introText : undefined
  const bullets = nodes
    .filter((node): node is Heading => isHeading(node) && node.level === 2)
    .slice(0, XHS_COVER_BULLET_LIMIT)
    .map((node) => node.text)
  const restWithIntro = h1Index >= 0 ? nodes.filter((_, index) => index !== h1Index) : nodes

  return {
    cover: { title, subtitle, bullets },
    rest: subtitle ? restWithIntro.filter((node) => node !== intro) : restWithIntro,
    restWithIntro,
  }
}

// ---------- main pagination ----------

export const splitIntoCards = (
  nodes: RenderNode[],
  fits: FitsFn,
  options: XhsSplitOptions = {},
): XhsSplitResult => {
  const maxCards = options.maxCards ?? XHS_MAX_CARDS
  const warnings: string[] = []
  const cards: XhsCard[] = []
  let current: RenderNode[] = []
  let section = ''
  let cardSection = ''

  const flush = () => {
    if (current.length) cards.push({ nodes: current, sectionTitle: cardSection })
    current = []
  }
  const append = (node: RenderNode) => {
    if (isHeading(node) && node.level <= 2) section = node.text
    if (!current.length) cardSection = section
    current.push(node)
  }
  const onlyHeadings = () => current.every(isHeading)

  let body = nodes.filter((node) => !isBlankParagraph(node))
  const hasContent = body.some((node) => node.type !== 'thematicBreak')
  if (!hasContent) {
    return { cards: [], warnings: ['原文为空，无法生成卡片。'] }
  }

  if (options.withCover) {
    const { cover, rest, restWithIntro } = buildCover(body, options.fallbackTitle)
    body = rest
    if (options.fitsCover) {
      while (cover.bullets.length && !options.fitsCover(cover)) cover.bullets.pop()
      if (cover.subtitle && !options.fitsCover(cover)) {
        // The intro no longer fits on the cover; keep it in the body instead.
        cover.subtitle = undefined
        body = restWithIntro
      }
      if (!options.fitsCover(cover)) warnings.push('封面标题过长，可能显示不全，请精简一级标题。')
    }
    cards.push({ nodes: [], sectionTitle: '', cover })
  }

  const place = (original: RenderNode, chunks: RenderNode[]) => {
    let warned = false
    chunks.forEach((chunk, index) => {
      if (index > 0) {
        flush()
      } else if (current.length && !fits([...current, chunk]) && fits([chunk])) {
        // Even the first chunk cannot share a card with the pending heading.
        flush()
      }
      if (!warned && !fits([...current, chunk])) {
        warnings.push(`「${describeNode(original)}」无法完整放入单张卡片，请在原文中精简或手动拆分。`)
        warned = true
      }
      append(chunk)
    })
  }

  for (const node of body) {
    if (node.type === 'thematicBreak') {
      flush()
      continue
    }

    if (fits([...current, node])) {
      append(node)
      continue
    }

    // Move trailing headings before filling the next card, so even split content
    // keeps its heading without relying on spare room after pagination.
    if (!onlyHeadings()) {
      let headingStart = current.length
      while (headingStart > 0 && isHeading(current[headingStart - 1])) headingStart -= 1
      const headings = current.splice(headingStart)
      flush()
      headings.forEach(append)
      if (fits([...current, node])) {
        append(node)
        continue
      }
    }
    place(node, splitOversized(node, fits, current))
  }
  flush()

  if (cards.length > maxCards) {
    warnings.push(
      `共生成 ${cards.length} 张卡片，超过小红书单篇 ${maxCards} 张上限；导出时将按每 ${maxCards} 张自动分组，请分多篇发布或精简原文。`,
    )
  }

  return { cards, warnings }
}

// ---------- estimation ----------

const CHARS_PER_LINE = 26
const lineCount = (text: string, perLine = CHARS_PER_LINE) =>
  text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(countChars(line) / perLine)), 0)

export type XhsEstimateOptions = { codeLineNumbers?: boolean }

const estimateNode = (node: RenderNode, options: XhsEstimateOptions): number => {
  switch (node.type) {
    case 'heading':
      return node.level === 1 ? 20 + lineCount(node.text, 15) * 41 : node.level === 2 ? 18 + lineCount(node.text, 18) * 34 : 14 + lineCount(node.text, 22) * 30
    case 'paragraph':
      return lineCount(node.text) * 30 + 14
    case 'list':
      return node.items.reduce((sum, item) => sum + lineCount(listItemText(item), CHARS_PER_LINE - 2) * 30 + 6, 14)
    case 'quote':
      return node.lines.reduce(
        (sum, line) => sum + lineCount(line, CHARS_PER_LINE - 3) * 28 + 8,
        32 + XHS_SHADOW_SPACE + (node.calloutLabel ? 34 : 0),
      )
    case 'code':
      return estimateCodeHeight(node, {
        fontSize: 13,
        lineHeight: 1.6,
        contentWidth: XHS_CARD_WIDTH - 72,
        bottomSpace: XHS_SHADOW_SPACE,
        showLineNumbers: options.codeLineNumbers,
      })
    case 'table':
      return (node.rows.length + 1) * 36 + 14
    case 'image':
      return 300
    default:
      return 0
  }
}

/** Rough height estimate without DOM: used as the fits function in tests and as a coarse pre-filter in the browser. */
export const estimateFits = (budget = 560, options: XhsEstimateOptions = {}): FitsFn => (candidate) =>
  candidate.reduce((sum, node) => sum + estimateNode(node, options), 0) <= budget
