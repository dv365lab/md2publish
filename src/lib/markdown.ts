import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type {
  Root,
  RootContent,
  List,
  ListItem,
  PhrasingContent,
  InlineCode,
  Image,
  Table,
  TableRow,
  TableCell,
} from 'mdast'

export type InlineContent =
  | { type: 'text'; value: string }
  | { type: 'link'; text: string; url: string }

export type ListItemBlock = {
  content: InlineContent[]
  children: ListBlock[]
}

export type ListBlock = {
  ordered: boolean
  start: number
  items: ListItemBlock[]
}

type Block =
  | { type: 'heading'; depth: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: ListItemBlock[] }
  | { type: 'quote'; text: string[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'thematicBreak' }
  | { type: 'image'; alt: string; url: string }
  | { type: 'table'; header: string[]; rows: string[][] }

const parser = unified().use(remarkParse).use(remarkGfm)

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
          return `${joinInline(node.children)}（${node.url}）`
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

const inlineContent = (nodes: PhrasingContent[] = []): InlineContent[] => {
  const content: InlineContent[] = []

  const appendText = (value: string) => {
    if (!value) {
      return
    }

    const previous = content.at(-1)
    if (previous?.type === 'text') {
      previous.value += value
      return
    }

    content.push({ type: 'text', value })
  }

  const appendContent = (parts: InlineContent[]) => {
    for (const part of parts) {
      if (part.type === 'text') {
        appendText(part.value)
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
        appendContent(inlineContent(node.children))
        break
      case 'inlineCode':
        appendText(`“${node.value}”`)
        break
      case 'break':
        appendText('\n')
        break
      case 'link':
        content.push({ type: 'link', text: joinInline(node.children), url: node.url })
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
      blocks.push({ type: 'paragraph', text })
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
  content: item.children.flatMap((child) =>
    child.type === 'paragraph' ? inlineContent(child.children) : [],
  ),
  children: item.children
    .filter((child): child is List => child.type === 'list')
    .map(listToBlock),
})

const listToBlock = (list: List): ListBlock => ({
  ordered: Boolean(list.ordered),
  start: list.start ?? 1,
  items: list.children.map(listItemToBlock),
})

const inlineContentToText = (content: InlineContent[]) =>
  content
    .map((part) => (part.type === 'link' ? `${part.text}（${part.url}）` : part.value))
    .join('')
    .trim()

const listItemToText = (item: ListItemBlock): string => {
  const parts = [inlineContentToText(item.content)]

  for (const child of item.children) {
    const nestedItems = child.items
      .map((nestedItem, index) => {
        const nestedText = listItemToText(nestedItem)
        if (!nestedText) {
          return ''
        }

        return child.ordered ? `${child.start + index}. ${nestedText}` : `- ${nestedText}`
      })
      .filter(Boolean)

    if (nestedItems.length > 0) {
      parts.push(nestedItems.join('\n'))
    }
  }

  return parts.filter(Boolean).join('\n').trim()
}

export const parseMarkdown = (input: string): Block[] => {
  const tree = parser.parse(input) as Root
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
      const lines = current.children
        .map((child) => {
          if (child.type === 'paragraph') {
            return joinInline(child.children)
          }

          if (child.type === 'list') {
            const list = listToBlock(child)
            return list.items
              .map((item, itemIndex) => {
                const text = listItemToText(item)
                if (!text) {
                  return ''
                }
                return list.ordered ? `${list.start + itemIndex}. ${text}` : `- ${text}`
              })
              .filter(Boolean)
              .join('\n')
          }

          return ''
        })
        .filter(Boolean)

      if (lines.length > 0) {
        blocks.push({ type: 'quote', text: lines })
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
      })
    }
  }

  return blocks
}
