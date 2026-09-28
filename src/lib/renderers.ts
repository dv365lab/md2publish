import { parseMarkdown, type InlineContent, type ListItemBlock, type TableContent } from './markdown'

export type Platform = 'zsxq' | 'wechat'
export type ImageSourceMap = Readonly<Record<string, string>>

export type RenderNode =
  | { type: 'heading'; text: string; level: 1 | 2 | 3 }
  | { type: 'paragraph'; text: string; content?: InlineContent[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItemBlock[] }
  | { type: 'quote'; lines: string[]; content?: InlineContent[][]; calloutLabel?: string }
  | { type: 'code'; label: string; code: string; trailingColon: boolean }
  | { type: 'thematicBreak'; marker: string }
  | { type: 'image'; title: string; metaLabel: string; urlLabel: string; alt: string; url: string; src: string }
  | ({ type: 'table'; header: string[]; rows: string[][] } & Partial<TableContent>)

type HeadingLevel = 1 | 2 | 3

export const HEADING_APPEARANCE = {
  1: { color: '#1d4ed8', fontWeight: 800 },
  2: { color: '#7c3aed', fontWeight: 700 },
  3: { color: '#0f766e', fontWeight: 700 },
} as const satisfies Record<HeadingLevel, { color: string; fontWeight: number }>

const WECHAT_HEADING_APPEARANCE = {
  1: { color: '#1f2937', fontWeight: 700 },
  2: { color: '#1f2937', fontWeight: 700 },
  3: { color: '#1f2937', fontWeight: 700 },
} as const satisfies Record<HeadingLevel, { color: string; fontWeight: number }>

const WECHAT_HEADING_TYPOGRAPHY = {
  1: { fontSize: '26px', lineHeight: 1.4 },
  2: { fontSize: '22px', lineHeight: 1.45 },
  3: { fontSize: '20px', lineHeight: 1.55 },
} as const satisfies Record<HeadingLevel, { fontSize: string; lineHeight: number }>

const ZSXQ_CLIPBOARD_HEADING_TYPOGRAPHY = {
  1: { fontSize: '18px', lineHeight: 2.5 },
  2: { fontSize: '17px', lineHeight: 2 },
  3: { fontSize: '15px', lineHeight: 1.75 },
} as const satisfies Record<HeadingLevel, { fontSize: string; lineHeight: number }>

const ZSXQ_CLIPBOARD_BODY_FONT_SIZE = '14px'

const WECHAT_HEADING_LAYOUT = {
  1: 'margin:0 0 18px;',
  2: 'margin:24px 0 12px;padding-left:10px;border-left:4px solid #2563eb;',
  3: 'margin:18px 0 10px;',
} as const satisfies Record<HeadingLevel, string>

export const headingAppearanceForPlatform = (platform: Platform, level: HeadingLevel) =>
  platform === 'wechat' ? WECHAT_HEADING_APPEARANCE[level] : HEADING_APPEARANCE[level]

const calloutLabels: Record<string, string> = {
  NOTE: '说明',
  TIP: '提示',
  IMPORTANT: '重要提示',
  WARNING: '注意',
  CAUTION: '警告',
}

const inlineValue = (part: InlineContent) => part.type === 'text' ? part.value : part.text

const sliceInline = (content: InlineContent[], start: number, end = Infinity) => {
  let offset = 0
  return content.flatMap((part) => {
    const value = inlineValue(part)
    const sliced = value.slice(Math.max(0, start - offset), Math.max(0, end - offset))
    offset += value.length
    if (!sliced) return []
    return [part.type === 'text' ? { ...part, value: sliced } : { ...part, text: sliced }]
  })
}

export const normalizeQuote = (source: InlineContent[][]) => {
  const content = source.flatMap((paragraph) => {
    const text = paragraph.map(inlineValue).join('')
    let offset = 0
    return text.split('\n').flatMap((line) => {
      const start = offset + line.length - line.trimStart().length
      const end = offset + line.trimEnd().length
      offset += line.length + 1
      return line.trim() ? [sliceInline(paragraph, start, end)] : []
    })
  })
  const normalizedLines = content.map((line) => line.map(inlineValue).join(''))
  const marker = normalizedLines[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/iu)

  if (!marker) {
    return { lines: normalizedLines, content }
  }

  const firstLine = normalizedLines[0].replace(marker[0], '').trim()
  content[0] = sliceInline(content[0], normalizedLines[0].length - firstLine.length)
  return {
    lines: [firstLine, ...normalizedLines.slice(1)].filter(Boolean),
    content: firstLine ? content : content.slice(1),
    calloutLabel: calloutLabels[marker[1].toUpperCase()],
  }
}

const normalizeImageReference = (value: string) => {
  const withoutQuery = value.split(/[?#]/, 1)[0].replace(/\\/g, '/').replace(/^\.\//, '')

  try {
    return decodeURIComponent(withoutQuery)
  } catch {
    return withoutQuery
  }
}

const resolveImageSource = (url: string, imageSources: ImageSourceMap) =>
  imageSources[normalizeImageReference(url)] ?? imageSources[url] ?? url

const renderZsxqHeading = (depth: number): HeadingLevel => {
  if (depth <= 1) {
    return 1
  }

  if (depth === 2) {
    return 2
  }

  return 3
}

const renderWechatHeading = (depth: number): HeadingLevel => {
  if (depth <= 1) {
    return 1
  }

  if (depth === 2) {
    return 2
  }

  return 3
}

const explicitSectionNumberPattern = /^[一二三四五六七八九十百千万0-9]+[、.．)\]]+\s*/u
const chineseDigits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']

const toChineseSectionNumber = (value: number) => {
  if (value < 10) {
    return chineseDigits[value]
  }

  if (value === 10) {
    return '十'
  }

  if (value < 100) {
    const tens = Math.floor(value / 10)
    const ones = value % 10
    return `${tens === 1 ? '' : chineseDigits[tens]}十${chineseDigits[ones]}`
  }

  return String(value)
}

const headingTextForPlatform = (
  depth: number,
  text: string,
  sectionNumber: number,
) => {
  if (depth <= 1) {
    return text
  }

  if (depth === 2) {
    return explicitSectionNumberPattern.test(text)
      ? text
      : `${toChineseSectionNumber(sectionNumber)}、${text}`
  }

  return text
}

const codeNode = (lang: string, code: string, platform: Platform): RenderNode => ({
  type: 'code',
  label: lang ? `代码示例（${lang}）` : '代码示例',
  code,
  trailingColon: platform === 'zsxq',
})

export const buildRenderNodes = (
  markdown: string,
  platform: Platform,
  imageSources: ImageSourceMap = {},
): RenderNode[] => {
  const blocks = parseMarkdown(markdown).filter((block) => block.type !== 'thematicBreak')
  let sectionNumber = 0

  return blocks.map((block) => {
    switch (block.type) {
      case 'heading': {
        if (block.depth === 2) {
          sectionNumber += 1
        }

        return {
          type: 'heading',
          level:
            platform === 'zsxq'
              ? renderZsxqHeading(block.depth)
              : renderWechatHeading(block.depth),
          text: headingTextForPlatform(block.depth, block.text, sectionNumber),
        }
      }
      case 'paragraph':
        return { type: 'paragraph', text: block.text, content: block.content }
      case 'list':
        return { type: 'list', ordered: block.ordered, start: block.start, items: block.items }
      case 'quote':
        return { type: 'quote', ...normalizeQuote(block.content) }
      case 'code':
        return codeNode(block.lang, block.code, platform)
      case 'image':
        return platform === 'zsxq'
          ? {
              type: 'image',
              title: '[图片]',
              metaLabel: '说明',
              urlLabel: '链接',
              alt: block.alt || '未命名图片',
              url: block.url,
              src: resolveImageSource(block.url, imageSources),
            }
          : {
              type: 'image',
              title: '图片',
              metaLabel: '图注',
              urlLabel: '来源',
              alt: block.alt || '未命名图片',
              url: block.url,
              src: resolveImageSource(block.url, imageSources),
            }
      case 'table':
        return { type: 'table', header: block.header, rows: block.rows, headerContent: block.headerContent, rowsContent: block.rowsContent }
      default:
        return { type: 'paragraph', text: '' }
    }
  })
}

const normalizeBlockSpacing = (blocks: string[]) =>
  blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const inlineContentToText = (content: InlineContent[]) =>
  content
    .map((part) => {
      if (part.type === 'text') {
        return part.value
      }

      return part.text
    })
    .join('')
    .trim()

const listItemToPlainText = (item: ListItemBlock, depth: number, platform: Platform, clipboard: boolean): string => {
  return item.blocks.map((child, blockIndex) => {
    const indent = '  '.repeat(depth + 1)
    if (child.type === 'paragraph') {
      return `${blockIndex === 0 ? '' : indent}${inlineContentToText(child.content)}`
    }
    if (child.type === 'quote') {
      const quote = normalizeQuote(child.content)
      const prefix = platform === 'wechat' ? '引用：' : clipboard ? '' : '> '
      return [quote.calloutLabel, ...quote.lines.map((line) => `${prefix}${line}`)]
        .filter(Boolean)
        .map((line, index) => `${blockIndex === 0 && index === 0 ? '' : indent}${line}`)
        .join('\n')
    }
    return child.items.map((nestedItem, index) => {
      const marker = child.ordered ? `${child.start + index}. ` : '- '
      const nestedText = listItemToPlainText(nestedItem, depth + 1, platform, clipboard)
      return `${indent}${marker}${nestedText}`
    }).join('\n')
  }).filter(Boolean).join('\n')
}

const renderPlainList = (node: Extract<RenderNode, { type: 'list' }>, platform: Platform, clipboard = false) =>
  node.items
    .map((item, index) => {
      const marker = node.ordered
        ? `${node.start + index}. `
        : platform === 'wechat'
          ? '• '
          : '- '
      return `${marker}${listItemToPlainText(item, 0, platform, clipboard)}`
    })
    .join('\n')

export const renderArticle = (
  markdown: string,
  platform: Platform,
  imageSources: ImageSourceMap = {},
) => {
  const nodes = buildRenderNodes(markdown, platform, imageSources)

  const rendered = nodes.map((node) => {
    switch (node.type) {
      case 'heading':
        return node.level === 1 ? `【${node.text}】` : node.text
      case 'paragraph':
        return node.text
      case 'list':
        return renderPlainList(node, platform)
      case 'quote':
        return [
          node.calloutLabel,
          ...node.lines.map((line) => (platform === 'zsxq' ? `> ${line}` : `引用：${line}`)),
        ]
          .filter(Boolean)
          .join('\n')
      case 'code': {
        const indented = node.code
          .split('\n')
          .map((line) => (line ? `    ${line}` : ''))
          .join('\n')
        return node.trailingColon ? `${node.label}：\n${indented}` : `${node.label}\n${indented}`
      }
      case 'thematicBreak':
        return node.marker
      case 'image':
        return `${node.title}\n${node.metaLabel}：${node.alt}\n${node.urlLabel}：${node.url}`
      case 'table':
        return [
          node.header.join(' | '),
          node.header.map(() => '---').join(' | '),
          ...node.rows.map((row) => row.join(' | ')),
        ].join('\n')
      default:
        return ''
    }
  })

  return normalizeBlockSpacing(rendered)
}

export const renderClipboardArticle = (
  markdown: string,
  platform: Platform,
  imageSources: ImageSourceMap = {},
) => {
  const nodes = buildRenderNodes(markdown, platform, imageSources)

  const rendered = nodes.map((node) => {
    switch (node.type) {
      case 'heading':
        return node.level === 1 ? node.text : node.text
      case 'paragraph':
        return node.text
      case 'list':
        return renderPlainList(node, platform, true)
      case 'quote':
        return [
          node.calloutLabel,
          ...node.lines.map((line) => (platform === 'zsxq' ? line : `引用：${line}`)),
        ]
          .filter(Boolean)
          .join('\n')
      case 'code': {
        const indented = node.code
          .split('\n')
          .map((line) => (line ? `    ${line}` : ''))
          .join('\n')
        return node.trailingColon ? `${node.label}：\n${indented}` : `${node.label}\n${indented}`
      }
      case 'thematicBreak':
        return node.marker
      case 'image':
        return `${node.title}\n${node.metaLabel}：${node.alt}\n${node.urlLabel}：${node.url}`
      case 'table':
        if (platform === 'zsxq') {
          return [
            '表格字段如下：',
            ...node.rows.map((row) =>
              row
                .map((cell, cellIndex) => `${node.header[cellIndex] ?? `第${cellIndex + 1}列`}：${cell}`)
                .join('\n'),
            ),
          ].join('\n\n')
        }

        return [
          node.header.join(' | '),
          node.header.map(() => '---').join(' | '),
          ...node.rows.map((row) => row.join(' | ')),
        ].join('\n')
      default:
        return ''
    }
  })

  return normalizeBlockSpacing(rendered)
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const renderInlineHtml = (content: InlineContent[]): string =>
  content
    .map((part) => {
      const html = part.type === 'link'
        ? `<a href="${escapeHtml(part.url)}">${part.content ? renderInlineHtml(part.content) : escapeHtml(part.text)}</a>`
        : escapeHtml(part.value)
      return part.bold ? `<strong style="font-weight:700;">${html}</strong>` : html
    })
    .join('')

const renderListHtml = (
  ordered: boolean,
  start: number,
  items: ListItemBlock[],
  platform: Platform,
  depth = 0,
  topLevelMargin = '0 0 18px',
): string => {
  const tag = ordered ? 'ol' : 'ul'
  const startAttribute = ordered && start !== 1 ? ` start="${start}"` : ''
  const listStyle = depth === 0
    ? platform === 'wechat'
      ? 'margin:0 0 14px;padding-left:1.5em;color:#374151;font-size:16px;line-height:1.75;text-align:left;'
      : `margin:${topLevelMargin};padding-left:1.5em;line-height:1.75;`
    : 'margin:8px 0 0;padding-left:1.5em;line-height:1.75;'
  const listStyleAttribute = ` style="${listStyle}"`
  const itemStyleAttribute = ' style="margin:0;padding:0;line-height:1.75;"'
  const listItems = items
    .map((item) => {
      const contentHtml = item.blocks.map((child, blockIndex) => {
        if (child.type === 'list') {
          return renderListHtml(child.ordered, child.start, child.items, platform, depth + 1)
        }
        if (child.type === 'quote') {
          const quote = { type: 'quote' as const, ...normalizeQuote(child.content) }
          return platform === 'wechat'
            ? renderWechatClipboardQuote(quote)
            : renderZsxqClipboardQuote(quote, '8px 0')
        }
        const inlineHtml = renderInlineHtml(child.content)
        if (platform === 'wechat') {
          // Give the paste importer one paragraph for the whole inline run,
          // so a bold label and its following punctuation stay together.
          const margin = blockIndex === 0 ? '0' : '8px 0 0'
          return `<p style="margin:${margin};padding:0;line-height:inherit;">${inlineHtml}</p>`
        }
        const paragraphHtml = `<span class="ql-size-${ZSXQ_CLIPBOARD_BODY_FONT_SIZE}" style="font-size:${ZSXQ_CLIPBOARD_BODY_FONT_SIZE};">${inlineHtml}</span>`
        return blockIndex === 0 ? paragraphHtml : `<p style="margin:8px 0 0;">${paragraphHtml}</p>`
      }).join('')
      return `<li${itemStyleAttribute}>${contentHtml}</li>`
    })
    .join('')

  return `<${tag}${startAttribute}${listStyleAttribute}>${listItems}</${tag}>`
}

const wechatCodeFontFamily =
  "'SFMono-Regular','Cascadia Code',Consolas,'Liberation Mono',monospace"

const renderWechatClipboardCode = (label: string, code: string) => {
  const boxStyle = `padding:18px 20px;box-sizing:border-box;max-width:100%;overflow-x:auto;border-radius:10px;background-color:#eff3f8;color:#1f2937;font-family:${wechatCodeFontFamily};font-size:14px;line-height:1.65;text-align:left;letter-spacing:normal;word-spacing:normal;tab-size:2;`
  const paragraphStyle = `margin:0;padding:0;color:inherit;font-family:inherit;font-size:inherit;line-height:inherit;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;text-align:left;letter-spacing:normal;word-spacing:normal;`
  const editableCode = escapeHtml(code).replace(/\n/g, '<br>')

  return `<section style="margin:24px 0;"><p style="margin:0 0 10px;line-height:1.8;font-weight:700;text-align:left;">${escapeHtml(label)}</p><section style="${boxStyle}"><p style="${paragraphStyle}">${editableCode}</p></section></section>`
}

const renderWechatClipboardQuote = (
  node: Extract<RenderNode, { type: 'quote' }>,
) => {
  const label = node.calloutLabel
    ? `<p style="margin:0 0 8px;color:#1f2937;font-size:16px;line-height:1.6;font-weight:700;">${escapeHtml(node.calloutLabel)}</p>`
    : ''
  const body = node.lines
    .map(
      (line, index) =>
        `<p style="margin:0${index < node.lines.length - 1 ? ' 0 8px' : ''};color:#5b6472;font-size:15px;line-height:1.7;">${node.content?.[index] ? renderInlineHtml(node.content[index]) : escapeHtml(line)}</p>`,
    )
    .join('')

  return `<blockquote style="margin:18px 0;padding:12px 16px;border-left:4px solid #94a3b8;background:#f7f8fa;color:#5b6472;">${label}${body}</blockquote>`
}

const renderZsxqClipboardHeading = (
  node: Extract<RenderNode, { type: 'heading' }>,
  blockMargin: string,
) => {
  const appearance = headingAppearanceForPlatform('zsxq', node.level)
  const typography = ZSXQ_CLIPBOARD_HEADING_TYPOGRAPHY[node.level]
  const lineHeightClass = String(typography.lineHeight).replace('.', '_')

  return `<p class="ql-line-height-${lineHeightClass}" style="margin:${blockMargin};line-height:${typography.lineHeight};"><strong class="ql-size-${typography.fontSize}" style="color:${appearance.color};font-size:${typography.fontSize};font-weight:${appearance.fontWeight};">${escapeHtml(node.text)}</strong></p>`
}

const renderZsxqClipboardQuote = (
  node: Extract<RenderNode, { type: 'quote' }>,
  blockMargin: string,
) => {
  return node.lines
    .map(
      (line, index) => {
        const prefix = index === 0
          ? `<strong style="color:#94a3b8;">▍</strong> ${node.calloutLabel ? `<strong style="color:#475569;">${escapeHtml(node.calloutLabel)}：</strong>` : ''}`
          : ''
        const margin = index < node.lines.length - 1 ? '0' : blockMargin

        return `<p class="ql-line-height-1_6" style="margin:${margin};line-height:1.6;"><span class="ql-size-${ZSXQ_CLIPBOARD_BODY_FONT_SIZE}" style="color:#475569;font-size:${ZSXQ_CLIPBOARD_BODY_FONT_SIZE};">${prefix}${node.content?.[index] ? renderInlineHtml(node.content[index]) : escapeHtml(line)}</span></p>`
      },
    )
    .join('')
}

const renderZsxqClipboardCode = (
  label: string,
  code: string,
  trailingColon: boolean,
  blockMargin: string,
) => {
  const labelText = `${label}${trailingColon ? '：' : ''}`
  const preStyle = 'padding:18px 20px;box-sizing:border-box;max-width:100%;overflow-x:auto;border-radius:14px;background-color:#eff3f8;font-size:14px;line-height:1.8;white-space:pre-wrap;word-break:break-word;'

  return `<p class="ql-line-height-1_6" style="margin:0 0 10px;line-height:1.6;"><strong class="ql-size-${ZSXQ_CLIPBOARD_BODY_FONT_SIZE}" style="font-size:${ZSXQ_CLIPBOARD_BODY_FONT_SIZE};">${escapeHtml(labelText)}</strong></p><pre style="margin:${blockMargin};${preStyle}">${escapeHtml(code)}</pre>`
}

export const renderClipboardHtml = (
  markdown: string,
  platform: Platform,
  imageSources: ImageSourceMap = {},
  tableImageSources: readonly string[] = [],
) => {
  const nodes = buildRenderNodes(markdown, platform, imageSources)
  let tableIndex = 0

  return nodes
    .map((node, nodeIndex) => {
      const zsxqBlockMargin = nodeIndex < nodes.length - 1 ? '0 0 18px' : '0'

      switch (node.type) {
        case 'heading': {
          if (platform === 'zsxq') {
            return renderZsxqClipboardHeading(node, zsxqBlockMargin)
          }

          const appearance = headingAppearanceForPlatform(platform, node.level)
          const typography = WECHAT_HEADING_TYPOGRAPHY[node.level]
          const tag = `h${node.level}`
          const typographyStyle = `font-size:${typography.fontSize};line-height:${typography.lineHeight};`
          const layoutStyle = WECHAT_HEADING_LAYOUT[node.level]
          return `<${tag} style="color:${appearance.color};font-weight:${appearance.fontWeight};${typographyStyle}${layoutStyle}"><strong>${escapeHtml(node.text)}</strong></${tag}>`
        }
        case 'paragraph': {
          const html = node.content ? renderInlineHtml(node.content) : escapeHtml(node.text)
          if (platform === 'zsxq') {
            return `<p class="ql-line-height-1_6" style="margin:${zsxqBlockMargin};line-height:1.6;"><span class="ql-size-${ZSXQ_CLIPBOARD_BODY_FONT_SIZE}" style="font-size:${ZSXQ_CLIPBOARD_BODY_FONT_SIZE};">${html}</span></p>`
          }

          return `<p style="margin:0 0 14px;color:#374151;font-size:16px;line-height:1.75;text-align:left;">${html}</p>`
        }
        case 'list': {
          return renderListHtml(
            node.ordered,
            node.start,
            node.items,
            platform,
            0,
            zsxqBlockMargin,
          )
        }
        case 'quote': {
          if (platform === 'wechat') {
            return renderWechatClipboardQuote(node)
          }

          return renderZsxqClipboardQuote(node, zsxqBlockMargin)
        }
        case 'code':
          return platform === 'wechat'
            ? renderWechatClipboardCode(node.label, node.code)
            : renderZsxqClipboardCode(
                node.label,
                node.code,
                node.trailingColon,
                zsxqBlockMargin,
              )
        case 'thematicBreak':
          return `<p>${escapeHtml(node.marker)}</p>`
        case 'image':
          return `<figure style="margin:24px 0;text-align:center;"><img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}" style="display:block;max-width:100%;width:auto;height:auto;margin:0 auto;object-fit:contain;" /><figcaption style="margin-top:8px;color:#6b7280;font-size:13px;line-height:1.6;">${escapeHtml(node.alt)}</figcaption></figure>`
        case 'table':
          if (tableImageSources[tableIndex]) {
            const currentTableIndex = tableIndex
            const tableImageSource = tableImageSources[tableIndex]
            tableIndex += 1
            const figureStyle = platform === 'wechat' ? 'margin:18px 0;text-align:center;' : 'margin:0;text-align:center;'
            const imageStyle = platform === 'wechat'
              ? 'display:block;width:100%;max-width:100%;height:auto;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;object-fit:contain;'
              : 'display:block;max-width:100%;width:auto;height:auto;margin:0 auto;object-fit:contain;'
            return `<figure style="${figureStyle}"><img src="${escapeHtml(tableImageSource)}" alt="表格 ${currentTableIndex + 1}" style="${imageStyle}" /></figure>`
          }

          tableIndex += 1
          return `<table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;width:100%;max-width:100%;table-layout:auto;border:1px solid #d1d5db;"><thead><tr>${node.header
            .map(
              (cell, cellIndex) =>
                `<th style="padding:10px 12px;border:1px solid #d1d5db;text-align:left;vertical-align:top;background:#f1f5ff;word-break:break-word;">${node.headerContent?.[cellIndex] ? renderInlineHtml(node.headerContent[cellIndex]) : escapeHtml(cell)}</th>`,
            )
            .join('')}</tr></thead><tbody>${node.rows
            .map(
              (row, rowIndex) =>
                `<tr>${row
                  .map((cell, cellIndex) => `<td style="padding:10px 12px;border:1px solid #d1d5db;text-align:left;vertical-align:top;word-break:break-word;">${node.rowsContent?.[rowIndex]?.[cellIndex] ? renderInlineHtml(node.rowsContent[rowIndex][cellIndex]) : escapeHtml(cell)}</td>`)
                  .join('')}</tr>`,
            )
            .join('')}</tbody></table>`
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('')
}
