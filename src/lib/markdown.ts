import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { SKIP, visit } from 'unist-util-visit'
import type {
  Root,
  RootContent,
  List,
  ListItem,
  Blockquote,
  PhrasingContent,
  InlineCode,
  Image,
  Table,
  TableRow,
  TableCell,
} from 'mdast'

export type InlineContent = (
  | { type: 'text'; value: string }
  | { type: 'link'; text: string; url: string; content?: InlineContent[] }
) & { bold?: boolean }

export type TableContent = { headerContent: InlineContent[][]; rowsContent: InlineContent[][][] }

export type ListItemBlock = {
  blocks: ListItemContent[]
}

export type ListItemContent =
  | { type: 'paragraph'; content: InlineContent[] }
  | { type: 'quote'; content: InlineContent[][] }
  | ({ type: 'list' } & ListBlock)

export type ListBlock = {
  ordered: boolean
  start: number
  items: ListItemBlock[]
}

type Block =
  | { type: 'heading'; depth: number; text: string }
  | { type: 'paragraph'; text: string; content: InlineContent[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItemBlock[] }
  | { type: 'quote'; text: string[]; content: InlineContent[][] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'thematicBreak' }
  | { type: 'image'; alt: string; url: string }
  | ({ type: 'table'; header: string[]; rows: string[][] } & TableContent)

const parser = unified().use(remarkParse).use(remarkGfm)

// Repair only prose text tokens, so code, link destinations and escaped markers
// retain their original meaning. Sentinels keep fragments in inline context and
// preserve boundary whitespace that the block parser would otherwise trim.
const parseInlineFragment = (source: string): PhrasingContent[] => {
  const tree = publishingTree(`x${source}y`)
  // Text positions can span blockquote continuation prefixes (\n> ...).
  // Keep every paragraph when reparsing such a fragment, not just the first.
  const collect = (nodes: RootContent[]): PhrasingContent[] => nodes.flatMap((node, index) => {
    const children = node.type === 'paragraph'
      ? node.children
      : node.type === 'blockquote' ? collect(node.children) : []
    return index > 0 ? [{ type: 'text', value: '\n' }, ...children] : children
  })
  const content = collect(tree.children)
  const first = content[0]
  if (first?.type === 'text') first.value = first.value.slice(1)
  const last = content.at(-1)
  if (last?.type === 'text') last.value = last.value.slice(0, -1)
  // Fragment offsets belong to the temporary source, not the original document.
  visit(tree, (node) => { delete node.position })
  return content
}

const publishingTree = (input: string): Root => {
  const tree = parser.parse(input) as Root

  // CommonMark can pair the closing ** of one Chinese phrase with the opening
  // ** of the next. Repair the whole inline container before visiting its text.
  visit(tree, ['paragraph', 'heading', 'tableCell', 'link'], (node) => {
    if (node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'tableCell' && node.type !== 'link') return
    let hasLiteralMarkers = false
    const protectedRanges: [number, number][] = []
    const protect = (start?: number, end?: number) => {
      if (start !== undefined && end !== undefined) protectedRanges.push([start, end])
    }
    visit(node, (child) => {
      if (child.type === 'inlineCode' || child.type === 'html' || child.type === 'image') {
        protect(child.position?.start.offset, child.position?.end.offset)
        return SKIP
      }
      if (child.type === 'link') {
        const first = child.children[0]
        // A label is its own inline container. Pairing its markers with the
        // surrounding paragraph would cut the [label](destination) in half.
        if (child !== node || (child.children.length === 1 && first.type === 'text' && first.value === child.url)) {
          protect(child.position?.start.offset, child.position?.end.offset)
          return SKIP
        }
      }
      if (child.type === 'text' && child.value.includes('**')) hasLiteralMarkers = true
    })
    if (!hasLiteralMarkers) return

    const start = node.children[0]?.position?.start.offset
    const end = node.children.at(-1)?.position?.end.offset
    if (start === undefined || end === undefined) return
    const source = input.slice(start, end)
    const markers = [...source.matchAll(/\\[\s\S]|\*+/gu)]
      .filter((match) => match[0] === '**' && !protectedRanges.some(
        ([from, to]) => start + match.index >= from && start + match.index < to,
      ))
      .map((match) => match.index)
    // Leave unmatched markers and triple-star emphasis to the standard parser.
    if (markers.length < 2 || markers.length % 2 !== 0) return

    const parts: PhrasingContent[] = []
    let cursor = 0
    for (let index = 0; index < markers.length; index += 2) {
      const opening = markers[index]
      const closing = markers[index + 1]
      const value = source.slice(opening + 2, closing)
      if (!value.trim()) continue
      parts.push(...parseInlineFragment(source.slice(cursor, opening)))
      const leading = value.match(/^\s*/u)![0]
      const trailing = value.match(/\s*$/u)![0]
      if (leading) parts.push({ type: 'text', value: leading })
      parts.push({ type: 'strong', children: parseInlineFragment(value.trim()) })
      if (trailing) parts.push({ type: 'text', value: trailing })
      cursor = closing + 2
    }
    if (!cursor) return
    parts.push(...parseInlineFragment(source.slice(cursor)))
    node.children = parts
  })

  visit(tree, 'text', (node, index, parent) => {
    if (index === undefined || !parent || !node.position) return
    if (parent.type === 'link' && parent.url === node.value) return
    const source = input.slice(node.position.start.offset, node.position.end.offset)
    const parts: PhrasingContent[] = []
    let cursor = 0
    // Keep escaped characters literal and discard unresolved footnote references.
    const pattern = /\\[\s\S]|\[\^[^\]\s]+\]/gu
    for (const match of source.matchAll(pattern)) {
      if (match[0].startsWith('\\')) continue
      parts.push(...parseInlineFragment(source.slice(cursor, match.index)))
      cursor = match.index + match[0].length
    }
    if (!cursor) return
    parts.push(...parseInlineFragment(source.slice(cursor)))
    parent.children.splice(index, 1, ...parts)
    return index + parts.length
  })
  return tree
}

export const extractImageReferences = (input: string) => {
  const tree = parser.parse(input) as Root
  const references: string[] = []

  visit(tree, 'image', (node: Image) => {
    references.push(node.url)
  })

  return references
}

const normalizeText = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const joinInline = (nodes: PhrasingContent[] = []): string =>
  nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value
        case 'emphasis':
        case 'strong':
        case 'delete':
          return joinInline(node.children)
        case 'inlineCode':
          return `“${(node as InlineCode).value}”`
        case 'break':
          return '\n'
        case 'link':
          return joinInline(node.children)
        case 'image':
          return imageToText(node as Image)
        default:
          return ''
      }
    })
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()

const imageToText = (node: Image) => {
  const label = node.alt?.trim() || '图片'
  return `图片：${label}（${node.url}）`
}

const inlineContent = (
  nodes: PhrasingContent[] = [],
  bold = false,
  linksAsText = false,
): InlineContent[] => {
  const content: InlineContent[] = []

  const appendText = (value: string, isBold = bold) => {
    if (!value) {
      return
    }

    const previous = content.at(-1)
    if (previous?.type === 'text' && Boolean(previous.bold) === isBold) {
      previous.value += value
      return
    }

    content.push({ type: 'text', value, ...(isBold ? { bold: true } : {}) })
  }

  const appendContent = (parts: InlineContent[]) => {
    for (const part of parts) {
      if (part.type === 'text') {
        appendText(part.value, Boolean(part.bold))
      } else {
        content.push(part)
      }
    }
  }

  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        appendText(node.value)
        break
      case 'emphasis':
      case 'strong':
      case 'delete':
        appendContent(inlineContent(node.children, bold || node.type === 'strong', linksAsText))
        break
      case 'inlineCode':
        appendText(`“${node.value}”`)
        break
      case 'break':
        appendText('\n')
        break
      case 'link':
        if (linksAsText) {
          appendContent(inlineContent(node.children, bold, true))
        } else {
          content.push({ type: 'link', text: joinInline(node.children), url: node.url, content: inlineContent(node.children, bold, true) })
        }
        break
      case 'image':
        appendText(imageToText(node))
        break
      default:
        break
    }
  }

  return content
}

const paragraphToBlocks = (nodes: PhrasingContent[]): Block[] => {
  const blocks: Block[] = []
  let textNodes: PhrasingContent[] = []

  const flushText = () => {
    const text = joinInline(textNodes)
    if (text) {
      blocks.push({ type: 'paragraph', text, content: inlineContent(textNodes, false, true) })
    }
    textNodes = []
  }

  for (const node of nodes) {
    if (node.type !== 'image') {
      textNodes.push(node)
      continue
    }

    flushText()
    blocks.push({ type: 'image', alt: node.alt ?? '', url: node.url })
  }

  flushText()
  return blocks
}

const normalizeHeadingText = (depth: number, text: string) => {
  const normalized = text
    .replace(/^[\s\-*•]+/, '')
    .trim()

  if (depth === 2) {
    return normalized
  }

  return text.trim()
}

const tableCellToText = (cell: TableCell) => joinInline(cell.children)

const tableRowToText = (row: TableRow) => row.children.map(tableCellToText)

const listItemToBlock = (item: ListItem): ListItemBlock => ({
  // Keep block boundaries and source order: a quote is a sibling of the
  // item's paragraph, not inline text or a nested list.
  blocks: item.children.flatMap<ListItemContent>((child) => {
    switch (child.type) {
      case 'paragraph': {
        const content = inlineContent(child.children)
        return content.some((part) => part.type === 'link' || part.value.trim())
          ? [{ type: 'paragraph', content }]
          : []
      }
      case 'blockquote': {
        const content = quoteToContent(child)
        return content.length ? [{ type: 'quote', content }] : []
      }
      case 'list': {
        const nested = listToBlock(child)
        return nested.items.length ? [{ type: 'list', ...nested }] : []
      }
      default:
        return []
    }
  }),
})

const listToBlock = (list: List): ListBlock => {
  const items = list.children.map(listItemToBlock)
  const firstVisible = items.findIndex((item) => item.blocks.length > 0)
  return {
    ordered: Boolean(list.ordered),
    start: (list.start ?? 1) + Math.max(0, firstVisible),
    items: items.filter((item) => item.blocks.length > 0),
  }
}

const inlineContentToText = (content: InlineContent[]) =>
  content
    .map((part) => (part.type === 'link' ? part.text : part.value))
    .join('')
    .trim()

const listItemToText = (item: ListItemBlock): string => {
  return item.blocks.map((child) => {
    if (child.type === 'paragraph') return inlineContentToText(child.content)
    if (child.type === 'quote') return child.content.map(inlineContentToText).join('\n')
    const nestedItems = child.items
      .map((nestedItem, index) => {
        const nestedText = listItemToText(nestedItem)
        if (!nestedText) {
          return ''
        }

        return child.ordered ? `${child.start + index}. ${nestedText}` : `- ${nestedText}`
      })
      .filter(Boolean)

    return nestedItems.join('\n')
  }).filter(Boolean).join('\n').trim()
}

const quoteToContent = (quote: Blockquote): InlineContent[][] =>
  quote.children.flatMap((child): InlineContent[][] => {
    if (child.type === 'paragraph') {
      return [inlineContent(child.children, false, true)]
    }
    if (child.type === 'blockquote') return quoteToContent(child)
    if (child.type === 'list') {
      const list = listToBlock(child)
      const text = list.items
        .map((item, itemIndex) => {
          const text = listItemToText(item)
          if (!text) return ''
          return list.ordered ? `${list.start + itemIndex}. ${text}` : `- ${text}`
        })
        .filter(Boolean)
        .join('\n')
      return [[{ type: 'text', value: text }]]
    }
    return []
  }).filter((parts) => parts.length > 0)

export const parseMarkdown = (input: string): Block[] => {
  const tree = publishingTree(input)

  // ChatGPT citation placeholders are article metadata, not publishable text.
  // Process prose nodes only; inline and fenced code retain literal examples.
  visit(tree, 'text', (node) => {
    node.value = node.value.replace(/:chatgpt-content-reference\{[^{}\r\n]*\}/gu, '')
  })

  // Remove hyperlinks after inline repairs so reparsing cannot restore them.
  // Images inside linked images remain as images rather than disappearing.
  visit(tree, 'link', (node, index, parent) => {
    if (index === undefined || !parent) return
    const images: Image[] = []
    visit(node, 'image', (image) => { images.push(image) })
    parent.children.splice(index, 1, ...images)
    return [SKIP, index]
  })

  const blocks: Block[] = []

  for (const current of tree.children as RootContent[]) {
    if (current.type === 'heading') {
      const text = normalizeHeadingText(current.depth, joinInline(current.children))
      if (text) {
        blocks.push({ type: 'heading', depth: current.depth, text })
      }
      continue
    }

    if (current.type === 'paragraph') {
      blocks.push(...paragraphToBlocks(current.children))
      continue
    }

    if (current.type === 'list') {
      const list = listToBlock(current)
      if (list.items.length > 0) {
        blocks.push({ type: 'list', ...list })
      }
      continue
    }

    if (current.type === 'blockquote') {
      const content = quoteToContent(current)
      const lines = content.map(inlineContentToText)

      if (lines.length > 0) {
        blocks.push({ type: 'quote', text: lines, content })
      }
      continue
    }

    if (current.type === 'code') {
      blocks.push({
        type: 'code',
        lang: current.lang ?? '',
        code: normalizeText(current.value),
      })
      continue
    }

    if (current.type === 'thematicBreak') {
      blocks.push({ type: 'thematicBreak' })
      continue
    }

    if (current.type === 'table') {
      const [headerRow, ...bodyRows] = (current as Table).children

      if (!headerRow) {
        continue
      }

      blocks.push({
        type: 'table',
        header: tableRowToText(headerRow),
        rows: bodyRows.map(tableRowToText),
        headerContent: headerRow.children.map((cell) => inlineContent(cell.children, false, true)),
        rowsContent: bodyRows.map((row) => row.children.map((cell) => inlineContent(cell.children, false, true))),
      })
    }
  }

  return blocks
}
