import type { InlineContent, ListItemBlock } from './markdown'
import { normalizeQuote, type RenderNode } from './renderers'
import { renderXhsCode, type CodeTheme } from './xhsCode'
import { XHS_CARD_HEIGHT, XHS_CARD_WIDTH, XHS_SHADOW_SPACE, type XhsCard, type XhsCover } from './xhsLayout'
import { CALLOUT_LABELS, XHS_THEMES, type CalloutLabel, type XhsThemeId, type XhsThemeTokens } from './xhsThemes'

export type XhsCodeGutterColors = { fg?: string; bg?: string }

export type XhsMeta = {
  series: string
  author: string
  theme: XhsThemeId
  /** Defaults to true. Changes the code width, so cards must be re-paginated. */
  codeLineNumbers?: boolean
  /** Line number color overrides for the current theme; colors only, pagination is unaffected. */
  codeGutter?: XhsCodeGutterColors
}

/** Natural image sizes from preloading; `null` marks an image that failed to load. */
export type ImageSizeMap = Readonly<Record<string, { width: number; height: number } | null>>

export const XHS_IMAGE_MAX_HEIGHT = 360
/** The card body's clip box extends past the content by this much so side and top shadows stay visible. */
export const XHS_BODY_BLEED = { top: 10, x: 16 }

export const contentWidthFor = (tokens: XhsThemeTokens) => XHS_CARD_WIDTH - tokens.padding.x * 2

export const codeThemeFor = (meta: Pick<XhsMeta, 'theme' | 'codeGutter'>): CodeTheme => {
  const base = XHS_THEMES[meta.theme].code
  const override = Object.fromEntries(Object.entries(meta.codeGutter ?? {}).filter(([, value]) => value))
  return Object.keys(override).length ? { ...base, gutter: { ...base.gutter, ...override } } : base
}

type RenderContext = {
  tokens: XhsThemeTokens
  imageSizes: ImageSizeMap
  codeTheme: CodeTheme
  codeLineNumbers: boolean
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Inline renderer for cards: links become accent-colored text because images cannot be clicked. */
export const renderXhsInline = (content: InlineContent[], tokens: XhsThemeTokens): string =>
  content
    .map((part) => {
      const html = part.type === 'link'
        ? `<span style="color:${tokens.accent};">${part.content ? renderXhsInline(part.content, tokens) : escapeHtml(part.text)}</span>`
        : escapeHtml(part.value)
      return part.bold ? `<strong style="font-weight:700;">${html}</strong>` : html
    })
    .join('')

const inline = (content: InlineContent[] | undefined, fallback: string, tokens: XhsThemeTokens) =>
  content ? renderXhsInline(content, tokens) : escapeHtml(fallback)

const withBreaks = (html: string) => html.replace(/\n/g, '<br>')

const renderList = (
  ordered: boolean,
  start: number,
  items: ListItemBlock[],
  tokens: XhsThemeTokens,
  depth = 0,
): string => {
  const fontSize = depth ? tokens.size.body - 1 : tokens.size.body
  // Markers are drawn as text so html2canvas renders them exactly like the preview.
  const rows = items
    .map((item, index) => {
      const marker = ordered ? `${start + index}.` : depth ? '◦' : '•'
      const blocks = item.blocks
        .map((block, blockIndex) => {
          if (block.type === 'list') return renderList(block.ordered, block.start, block.items, tokens, depth + 1)
          if (block.type === 'quote') {
            return renderQuote({ type: 'quote', ...normalizeQuote(block.content) }, tokens, true)
          }
          const margin = blockIndex === 0 ? '0' : '6px 0 0'
          return `<p style="margin:${margin};">${withBreaks(renderXhsInline(block.content, tokens))}</p>`
        })
        .join('')
      return `<div style="display:flex;align-items:flex-start;gap:8px;margin:${index ? '6px' : '0'} 0 0;"><span style="flex:none;min-width:${ordered ? '1.4em' : '0.9em'};color:${tokens.accent};font-weight:700;">${marker}</span><div style="flex:1 1 auto;min-width:0;">${blocks}</div></div>`
    })
    .join('')
  return `<div style="margin:${depth ? '6px 0 0' : `0 0 ${tokens.blockGap}px`};font-size:${fontSize}px;line-height:${tokens.lineHeight.body};color:${tokens.fg};">${rows}</div>`
}

const CALLOUT_ICONS: Record<CalloutLabel, string> = {
  // U+FE0E asks for the text glyph so Windows and macOS do not swap in different emoji.
  说明: 'ℹ\uFE0E',
  提示: '✓',
  重要提示: '!',
  注意: '⚠\uFE0E',
  警告: '✕',
}

const isCalloutLabel = (value: string | undefined): value is CalloutLabel =>
  (CALLOUT_LABELS as readonly string[]).includes(value ?? '')

const renderQuote = (
  node: Extract<RenderNode, { type: 'quote' }>,
  tokens: XhsThemeTokens,
  nested = false,
) => {
  const label = isCalloutLabel(node.calloutLabel) ? node.calloutLabel : undefined
  const palette = label ? tokens.quote.callouts[label] : tokens.quote.base
  const pill = label
    ? `<div style="margin:0 0 10px;"><span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${palette.accent};color:${tokens.onAccent};font-size:${tokens.size.small}px;line-height:20px;font-weight:700;">${CALLOUT_ICONS[label]} ${escapeHtml(label)}${node.continued ? ' · 续' : ''}</span></div>`
    : node.calloutLabel
      ? `<p style="margin:0 0 8px;font-weight:700;color:${palette.accent};">${escapeHtml(node.calloutLabel)}</p>`
      : ''
  const lines = node.lines
    .map((line, index) => `<p style="margin:${index < node.lines.length - 1 ? '0 0 8px' : '0'};">${inline(node.content?.[index], line, tokens)}</p>`)
    .join('')
  const aside = `<aside style="position:relative;display:block;padding:16px 20px 14px 22px;border-radius:${tokens.radius + 2}px;background:linear-gradient(135deg,${palette.bgFrom},${palette.bgTo});border:1px solid ${palette.border};${nested ? '' : `box-shadow:0 6px 16px ${tokens.quote.shadow};`}color:${tokens.fg};font-size:${tokens.size.body - 1}px;line-height:${tokens.lineHeight.body};"><span style="position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:0 4px 4px 0;background:${palette.accent};"></span><span style="position:absolute;right:14px;top:4px;font-family:Georgia,'Times New Roman',serif;font-size:56px;line-height:1;color:${palette.accent};opacity:0.18;">“</span>${pill}${lines}</aside>`
  return `<div class="xhs-quote" style="${nested ? 'margin:6px 0 0;' : `padding:0 0 ${XHS_SHADOW_SPACE}px;`}">${aside}</div>`
}

const renderTable = (node: Extract<RenderNode, { type: 'table' }>, tokens: XhsThemeTokens) => {
  const cell = (html: string, header: boolean) => {
    const tag = header ? 'th' : 'td'
    const headerStyle = header ? `background:${tokens.quoteBg};font-weight:700;` : ''
    return `<${tag} style="padding:8px 10px;border:1px solid ${tokens.border};text-align:left;vertical-align:top;font-size:14px;line-height:1.6;${headerStyle}word-break:break-word;">${html}</${tag}>`
  }
  const head = node.header.map((text, index) => cell(inline(node.headerContent?.[index], text, tokens), true)).join('')
  const body = node.rows
    .map((row, rowIndex) => `<tr>${row.map((text, index) => cell(inline(node.rowsContent?.[rowIndex]?.[index], text, tokens), false)).join('')}</tr>`)
    .join('')
  return `<table style="border-collapse:collapse;width:100%;margin:0 0 ${tokens.blockGap}px;color:${tokens.fg};"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

export const fitImageSize = (
  natural: { width: number; height: number },
  maxWidth: number,
  maxHeight = XHS_IMAGE_MAX_HEIGHT,
) => {
  let width = Math.min(natural.width, maxWidth)
  let height = (width * natural.height) / natural.width
  if (height > maxHeight) {
    height = maxHeight
    width = (height * natural.width) / natural.height
  }
  return { width: Math.round(width), height: Math.round(height) }
}

const renderImage = (node: Extract<RenderNode, { type: 'image' }>, tokens: XhsThemeTokens, imageSizes: ImageSizeMap) => {
  const caption = node.alt && node.alt !== '未命名图片'
    ? `<figcaption style="margin:6px 0 0;font-size:${tokens.size.small}px;line-height:1.5;color:${tokens.muted};">${escapeHtml(node.alt)}</figcaption>`
    : ''
  const size = imageSizes[node.src]
  if (size === null) {
    return `<figure style="margin:0 0 ${tokens.blockGap}px;"><div style="padding:24px 16px;border:1px dashed ${tokens.border};border-radius:${tokens.radius}px;color:${tokens.muted};font-size:${tokens.size.small}px;text-align:center;">图片无法加载：${escapeHtml(node.alt)}</div></figure>`
  }
  const dimensions = size
    ? (() => {
        const fitted = fitImageSize(size, contentWidthFor(tokens))
        return ` width="${fitted.width}" height="${fitted.height}" style="display:block;margin:0 auto;width:${fitted.width}px;height:${fitted.height}px;border-radius:${tokens.radius}px;"`
      })()
    : ` style="display:block;margin:0 auto;max-width:100%;max-height:${XHS_IMAGE_MAX_HEIGHT}px;border-radius:${tokens.radius}px;"`
  return `<figure style="margin:0 0 ${tokens.blockGap}px;text-align:center;"><img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}"${dimensions}>${caption}</figure>`
}

const headingDecor = (tokens: XhsThemeTokens) => ({
  bar: `padding-left:12px;border-left:6px solid ${tokens.accent};`,
  underline: `display:inline-block;padding-bottom:6px;border-bottom:3px solid ${tokens.accent};`,
  pill: `display:inline-block;padding:4px 14px;border-radius:999px;background:${tokens.accent};color:${tokens.onAccent};`,
  plain: '',
}[tokens.headingStyle])

const renderXhsNode = (node: RenderNode, ctx: RenderContext): string => {
  const { tokens, imageSizes } = ctx
  switch (node.type) {
    case 'heading': {
      const text = escapeHtml(node.text)
      if (node.level === 1) {
        return `<h1 style="margin:0 0 ${tokens.blockGap + 6}px;font-size:${tokens.size.h1}px;line-height:${tokens.lineHeight.heading};font-weight:800;color:${tokens.fg};">${text}</h1>`
      }
      if (node.level === 2) {
        // Wrapped in a block so inline-block decorations still start a new line.
        return `<div style="margin:0 0 ${tokens.blockGap + 2}px;"><h2 style="margin:0;font-size:${tokens.size.h2}px;line-height:${tokens.lineHeight.heading};font-weight:700;color:${tokens.fg};${headingDecor(tokens)}">${text}</h2></div>`
      }
      return `<h3 style="margin:0 0 ${tokens.blockGap - 2}px;font-size:${tokens.size.h3}px;line-height:${tokens.lineHeight.heading};font-weight:700;color:${tokens.accent};">${text}</h3>`
    }
    case 'paragraph':
      return `<p style="margin:0 0 ${tokens.blockGap}px;font-size:${tokens.size.body}px;line-height:${tokens.lineHeight.body};color:${tokens.fg};">${withBreaks(inline(node.content, node.text, tokens))}</p>`
    case 'list':
      return renderList(node.ordered, node.start, node.items, tokens)
    case 'quote':
      return renderQuote(node, tokens)
    case 'code':
      return renderXhsCode(node, {
        theme: ctx.codeTheme,
        fontSize: tokens.size.code,
        lineHeight: tokens.lineHeight.code,
        monoFamily: tokens.monoFamily,
        radius: tokens.radius,
        bottomSpace: XHS_SHADOW_SPACE,
        smallFontSize: tokens.size.small,
        showLineNumbers: ctx.codeLineNumbers,
      })
    case 'image':
      return renderImage(node, tokens, imageSizes)
    case 'table':
      return renderTable(node, tokens)
    default:
      return ''
  }
}

const renderCoverBody = (cover: XhsCover, tokens: XhsThemeTokens) => {
  const subtitle = cover.subtitle
    ? `<p style="margin:0 0 28px;font-size:${tokens.size.body}px;line-height:${tokens.lineHeight.body};color:${tokens.muted};">${escapeHtml(cover.subtitle)}</p>`
    : ''
  const bullets = cover.bullets.length
    ? `<div style="display:flex;flex-direction:column;gap:12px;">${cover.bullets
        .map(
          (bullet) =>
            `<div style="display:flex;align-items:flex-start;gap:10px;font-size:${tokens.size.body + 1}px;line-height:1.5;color:${tokens.fg};"><span style="flex:none;width:8px;height:8px;margin-top:0.55em;border-radius:999px;background:${tokens.accent};"></span><span style="flex:1 1 auto;min-width:0;font-weight:600;">${escapeHtml(bullet)}</span></div>`,
        )
        .join('')}</div>`
    : ''
  return `<h1 style="margin:0 0 18px;font-size:${tokens.size.coverTitle}px;line-height:1.25;font-weight:800;color:${tokens.fg};">${escapeHtml(cover.title)}</h1><div style="width:56px;height:6px;margin:0 0 24px;border-radius:999px;background:${tokens.accent};"></div>${subtitle}${bullets}`
}

const ellipsis = 'overflow:hidden;white-space:nowrap;text-overflow:ellipsis;'

export const renderXhsCardHtml = (
  card: XhsCard,
  index: number,
  total: number,
  meta: XhsMeta,
  imageSizes: ImageSizeMap = {},
) => {
  const tokens = XHS_THEMES[meta.theme]
  const { padding } = tokens
  const ctx: RenderContext = {
    tokens,
    imageSizes,
    codeTheme: codeThemeFor(meta),
    codeLineNumbers: meta.codeLineNumbers ?? true,
  }
  const first = card.nodes[0]
  const showSection = !card.cover && card.sectionTitle && !(first?.type === 'heading' && first.text === card.sectionTitle)
  const body = card.cover
    ? renderCoverBody(card.cover, tokens)
    : card.nodes.map((node) => renderXhsNode(node, ctx)).join('')
  const decor = tokens.bgDecor
    ? `<div style="position:absolute;top:0;left:0;right:0;height:6px;background:${tokens.bgDecor};"></div>`
    : ''
  const bodyLayout = card.cover ? 'display:flex;flex-direction:column;justify-content:center;' : ''
  // Keep 16px of footer text space in addition to its padding, even under the app's border-box reset.
  return `<div class="xhs-card" style="position:relative;width:${XHS_CARD_WIDTH}px;height:${XHS_CARD_HEIGHT}px;box-sizing:border-box;display:flex;flex-direction:column;padding:${padding.top}px ${padding.x}px ${padding.bottom}px;background:${tokens.bg};color:${tokens.fg};font-family:${tokens.fontFamily};overflow:hidden;">${decor}<div class="xhs-header" style="flex:none;display:flex;justify-content:space-between;gap:16px;height:18px;line-height:18px;margin:0 0 18px;font-size:${tokens.size.small}px;color:${tokens.muted};"><span style="flex:1 1 auto;min-width:0;${ellipsis}">${escapeHtml(meta.series)}</span><span style="flex:0 1 auto;max-width:60%;text-align:right;${ellipsis}">${showSection ? escapeHtml(card.sectionTitle) : ''}</span></div><div class="xhs-body" style="flex:1 1 auto;min-height:0;margin:-${XHS_BODY_BLEED.top}px -${XHS_BODY_BLEED.x}px 0;padding:${XHS_BODY_BLEED.top}px ${XHS_BODY_BLEED.x}px 0;overflow:hidden;${bodyLayout}"><div class="xhs-flow">${body}</div></div><div class="xhs-footer" style="box-sizing:content-box;flex:none;display:flex;justify-content:space-between;gap:16px;height:16px;line-height:16px;margin:14px 0 0;padding:12px 0 0;border-top:1px solid ${tokens.border};font-size:12px;color:${tokens.muted};"><span style="flex:1 1 auto;min-width:0;${ellipsis}">${escapeHtml(meta.author)}</span><span style="flex:none;">${index + 1} / ${total}</span></div></div>`
}
