import { parseMarkdown } from './markdown'

export type Platform = 'zsxq' | 'wechat'
export type ImageSourceMap = Readonly<Record<string, string>>

export type RenderNode =
  | { type: 'heading'; text: string; level: 1 | 2 | 3 }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'code'; label: string; code: string; trailingColon: boolean }
  | { type: 'thematicBreak'; marker: string }
  | { type: 'image'; title: string; metaLabel: string; urlLabel: string; alt: string; url: string; src: string }
  | { type: 'table'; header: string[]; rows: string[][] }

type HeadingLevel = 1 | 2 | 3

export const HEADING_APPEARANCE = {
  1: { color: '#1d4ed8', fontWeight: 800 },
  2: { color: '#7c3aed', fontWeight: 700 },
  3: { color: '#0f766e', fontWeight: 700 },
} as const satisfies Record<HeadingLevel, { color: string; fontWeight: number }>

const WECHAT_HEADING_TYPOGRAPHY = {
  1: { fontSize: '32px', lineHeight: 1.35 },
  2: { fontSize: '24px', lineHeight: 1.5 },
  3: { fontSize: '20px', lineHeight: 1.6 },
} as const satisfies Record<HeadingLevel, { fontSize: string; lineHeight: number }>

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
  platform: Platform,
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

  if (platform === 'wechat' && depth === 3) {
    return `（小节）${text}`
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
  const blocks = parseMarkdown(markdown)
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
          text: headingTextForPlatform(block.depth, block.text, platform, sectionNumber),
        }
      }
      case 'paragraph':
        return { type: 'paragraph', text: block.text }
      case 'list':
        return { type: 'list', ordered: block.ordered, items: block.items }
      case 'quote':
        return { type: 'quote', lines: block.text }
      case 'code':
        return codeNode(block.lang, block.code, platform)
      case 'thematicBreak':
        return { type: 'thematicBreak', marker: platform === 'zsxq' ? '——' : '————' }
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
        return { type: 'table', header: block.header, rows: block.rows }
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
        return node.items
          .map((item, index) => {
            if (platform === 'zsxq') {
              return node.ordered ? `${index + 1}. ${item}` : `- ${item}`
            }

            return node.ordered ? `${index + 1}. ${item}` : `• ${item}`
          })
          .join('\n')
      case 'quote':
        return node.lines
          .map((line) => (platform === 'zsxq' ? `> ${line}` : `引用：${line}`))
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
        return node.items
          .map((item, index) => {
            if (platform === 'zsxq') {
              return node.ordered ? `${index + 1}. ${item}` : `- ${item}`
            }

            return node.ordered ? `${index + 1}. ${item}` : `• ${item}`
          })
          .join('\n')
      case 'quote':
        return node.lines
          .map((line) => (platform === 'zsxq' ? line : `引用：${line}`))
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

const wechatCodeFontFamily =
  "'SFMono-Regular','Cascadia Code',Consolas,'Liberation Mono',monospace"

const renderWechatClipboardCode = (label: string, code: string) => {
  const preStyle = `margin:0;padding:18px 20px;box-sizing:border-box;max-width:100%;overflow-x:auto;border-radius:10px;background-color:#eff3f8;color:#1f2937;font-family:${wechatCodeFontFamily};font-size:14px;line-height:1.8;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;text-align:left;letter-spacing:normal;word-spacing:normal;tab-size:2;`
  const codeStyle = `display:block;margin:0;padding:0;background:transparent;color:inherit;font-family:${wechatCodeFontFamily};font-size:inherit;line-height:inherit;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;text-align:left;letter-spacing:normal;word-spacing:normal;`

  return `<section style="margin:24px 0;"><p style="margin:0 0 10px;line-height:1.8;font-weight:700;text-align:left;">${escapeHtml(label)}</p><pre style="${preStyle}"><code style="${codeStyle}">${escapeHtml(code)}</code></pre></section>`
}

export const renderClipboardHtml = (
  markdown: string,
  platform: Platform,
  imageSources: ImageSourceMap = {},
  tableImageSources: readonly string[] = [],
) => {
  const nodes = buildRenderNodes(markdown, platform, imageSources)
  let tableIndex = 0

  const zsxqParagraphSpacer = '<p style="margin:0;line-height:1;">&nbsp;</p>'

  return nodes
    .map((node, nodeIndex) => {
      const appendZsxqSpacer = (html: string) =>
        platform === 'zsxq' && nodeIndex < nodes.length - 1
          ? `${html}${zsxqParagraphSpacer}`
          : html

      switch (node.type) {
        case 'heading': {
          const appearance = HEADING_APPEARANCE[node.level]
          const typography = WECHAT_HEADING_TYPOGRAPHY[node.level]
          const tag = `h${node.level}`
          const typographyStyle = platform === 'wechat'
            ? `font-size:${typography.fontSize};line-height:${typography.lineHeight};`
            : ''
          const headingHtml = `<${tag} style="color:${appearance.color};font-weight:${appearance.fontWeight};${typographyStyle}"><strong>${escapeHtml(node.text)}</strong></${tag}>`
          return nodes[nodeIndex + 1]?.type === 'heading'
            ? appendZsxqSpacer(headingHtml)
            : headingHtml
        }
        case 'paragraph': {
          const paragraphStyle = platform === 'zsxq' ? 'margin:0;line-height:1.9;' : 'margin:0 0 16px;line-height:1.9;'
          return appendZsxqSpacer(`<p style="${paragraphStyle}">${escapeHtml(node.text)}</p>`)
        }
        case 'list': {
          const tag = node.ordered ? 'ol' : 'ul'
          const items = node.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
          return `<${tag}>${items}</${tag}>`
        }
        case 'quote':
          return appendZsxqSpacer(
            `<blockquote>${node.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</blockquote>`,
          )
        case 'code':
          return platform === 'wechat'
            ? renderWechatClipboardCode(node.label, node.code)
            : `<div><p>${escapeHtml(node.label)}${node.trailingColon ? '：' : ''}</p><pre>${escapeHtml(node.code)}</pre></div>`
        case 'thematicBreak':
          return `<p>${escapeHtml(node.marker)}</p>`
        case 'image':
          return `<figure style="margin:24px 0;text-align:center;"><img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}" style="display:block;max-width:100%;width:auto;height:auto;margin:0 auto;object-fit:contain;" /><figcaption style="margin-top:8px;color:#6b7280;font-size:13px;line-height:1.6;">${escapeHtml(node.alt)}</figcaption></figure>`
        case 'table':
          if (platform === 'zsxq' && tableImageSources[tableIndex]) {
            const currentTableIndex = tableIndex
            const tableImageSource = tableImageSources[tableIndex]
            tableIndex += 1
            return `<figure style="margin:24px 0;text-align:center;"><img src="${escapeHtml(tableImageSource)}" alt="表格 ${currentTableIndex + 1}" style="display:block;max-width:100%;width:auto;height:auto;margin:0 auto;object-fit:contain;" /></figure>`
          }

          tableIndex += 1
          return `<table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;width:100%;max-width:100%;table-layout:auto;border:1px solid #d1d5db;"><thead><tr>${node.header
            .map(
              (cell) =>
                `<th style="padding:10px 12px;border:1px solid #d1d5db;text-align:left;vertical-align:top;background:#f1f5ff;word-break:break-word;">${escapeHtml(cell)}</th>`,
            )
            .join('')}</tr></thead><tbody>${node.rows
            .map(
              (row) =>
                `<tr>${row
                  .map((cell) => `<td style="padding:10px 12px;border:1px solid #d1d5db;text-align:left;vertical-align:top;word-break:break-word;">${escapeHtml(cell)}</td>`)
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
