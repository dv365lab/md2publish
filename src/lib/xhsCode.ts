import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import perl from 'highlight.js/lib/languages/perl'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import tcl from 'highlight.js/lib/languages/tcl'
import typescript from 'highlight.js/lib/languages/typescript'
import verilog from 'highlight.js/lib/languages/verilog'
import vhdl from 'highlight.js/lib/languages/vhdl'
import yaml from 'highlight.js/lib/languages/yaml'
import { CODE_TAB_SIZE, displayWidth, type LineDecoration, type LineDecorationKind } from './codeMeta'
import type { RenderNode } from './renderers'

type CodeNode = Extract<RenderNode, { type: 'code' }>

// ---------- themes ----------

export type CodeTokenPalette = {
  keyword: string
  string: string
  comment: string
  number: string
  /** Function and class names. */
  title: string
  type: string
  builtIn: string
  /** Attributes, variables and parameters. */
  attr: string
  /** Preprocessor directives and decorators. */
  meta: string
  operator: string
  punctuation: string
}

export type CodeGutterTheme = {
  fg: string
  bg: string
  activeFg?: string
  activeBg?: string
  /** Divider between the line numbers and the code; omit for none. */
  border?: string
}

export type LineDecorationStyle = {
  bg: string
  bar: string
  gutterBg?: string
  gutterFg?: string
  badgeBg?: string
  badgeFg?: string
  /** Replaces the line number, e.g. + / − for diff lines. */
  symbol?: string
}

export type CodeTheme = {
  scheme: 'dark' | 'light'
  bg: string
  titleBg: string
  border: string
  fg: string
  title: string
  shadow: string
  gutter: CodeGutterTheme
  tokens: CodeTokenPalette
  /** Opacity of lines outside focus when a block uses `[!code focus]`. */
  focusDim: number
  decorations: Record<LineDecorationKind, LineDecorationStyle>
}

/** Catppuccin Mocha: strongest contrast on light cards. */
export const CODE_THEME_MOCHA: CodeTheme = {
  scheme: 'dark',
  bg: '#1e1e2e',
  titleBg: '#181825',
  border: '#313244',
  fg: '#cdd6f4',
  title: '#a6adc8',
  shadow: 'rgba(15,23,42,0.35)',
  gutter: { fg: '#585b70', bg: '#181825', activeFg: '#cdd6f4', activeBg: '#313244', border: '#313244' },
  tokens: {
    keyword: '#cba6f7', string: '#a6e3a1', comment: '#6c7086', number: '#fab387',
    title: '#89b4fa', type: '#f9e2af', builtIn: '#f38ba8', attr: '#f5c2e7',
    meta: '#94e2d5', operator: '#89dceb', punctuation: '#9399b2',
  },
  focusDim: 0.32,
  decorations: {
    highlight: { bg: 'rgba(249,226,175,0.16)', bar: '#f9e2af', gutterBg: 'rgba(249,226,175,0.28)', gutterFg: '#f9e2af', badgeBg: '#f9e2af', badgeFg: '#1e1e2e' },
    focus: { bg: 'rgba(137,180,250,0.14)', bar: '#89b4fa', gutterBg: 'rgba(137,180,250,0.26)', gutterFg: '#89b4fa', badgeBg: '#89b4fa', badgeFg: '#1e1e2e' },
    add: { bg: 'rgba(166,227,161,0.18)', bar: '#a6e3a1', gutterBg: 'rgba(166,227,161,0.30)', gutterFg: '#a6e3a1', badgeBg: '#a6e3a1', badgeFg: '#1e1e2e', symbol: '+' },
    remove: { bg: 'rgba(243,139,168,0.18)', bar: '#f38ba8', gutterBg: 'rgba(243,139,168,0.30)', gutterFg: '#f38ba8', badgeBg: '#f38ba8', badgeFg: '#1e1e2e', symbol: '−' },
    warning: { bg: 'rgba(250,179,135,0.18)', bar: '#fab387', gutterBg: 'rgba(250,179,135,0.30)', gutterFg: '#fab387', badgeBg: '#fab387', badgeFg: '#1e1e2e' },
    error: { bg: 'rgba(243,139,168,0.22)', bar: '#f38ba8', gutterBg: 'rgba(243,139,168,0.36)', gutterFg: '#f38ba8', badgeBg: '#f38ba8', badgeFg: '#1e1e2e' },
  },
}

/** GitHub Light: for light, low-saturation card themes. */
export const CODE_THEME_GITHUB_LIGHT: CodeTheme = {
  scheme: 'light',
  bg: '#f6f8fa',
  titleBg: '#eaeef2',
  border: '#d0d7de',
  fg: '#1f2328',
  title: '#57606a',
  shadow: 'rgba(15,23,42,0.10)',
  gutter: { fg: '#8c959f', bg: '#eaeef2', activeFg: '#1f2328', activeBg: '#ddf4ff', border: '#d0d7de' },
  tokens: {
    keyword: '#cf222e', string: '#0a3069', comment: '#6e7781', number: '#0550ae',
    title: '#8250df', type: '#953800', builtIn: '#0550ae', attr: '#116329',
    meta: '#116329', operator: '#0550ae', punctuation: '#57606a',
  },
  focusDim: 0.38,
  decorations: {
    highlight: { bg: 'rgba(217,119,6,0.12)', bar: '#d97706', gutterBg: 'rgba(217,119,6,0.18)', gutterFg: '#b45309', badgeBg: '#d97706', badgeFg: '#ffffff' },
    focus: { bg: 'rgba(37,99,235,0.10)', bar: '#2563eb', gutterBg: 'rgba(37,99,235,0.16)', gutterFg: '#1d4ed8', badgeBg: '#2563eb', badgeFg: '#ffffff' },
    add: { bg: 'rgba(22,163,74,0.12)', bar: '#16a34a', gutterBg: 'rgba(22,163,74,0.18)', gutterFg: '#15803d', badgeBg: '#16a34a', badgeFg: '#ffffff', symbol: '+' },
    remove: { bg: 'rgba(220,38,38,0.10)', bar: '#dc2626', gutterBg: 'rgba(220,38,38,0.16)', gutterFg: '#b91c1c', badgeBg: '#dc2626', badgeFg: '#ffffff', symbol: '−' },
    warning: { bg: 'rgba(234,88,12,0.12)', bar: '#ea580c', gutterBg: 'rgba(234,88,12,0.18)', gutterFg: '#c2410c', badgeBg: '#ea580c', badgeFg: '#ffffff' },
    error: { bg: 'rgba(220,38,38,0.14)', bar: '#dc2626', gutterBg: 'rgba(220,38,38,0.20)', gutterFg: '#b91c1c', badgeBg: '#dc2626', badgeFg: '#ffffff' },
  },
}

/** For dark cards: one step lighter than the card background so the window stays distinct. */
export const CODE_THEME_SLATE: CodeTheme = {
  scheme: 'dark',
  bg: '#1f2937',
  titleBg: '#1a2332',
  border: '#374151',
  fg: '#e5e7eb',
  title: '#9ca3af',
  shadow: 'rgba(0,0,0,0.45)',
  gutter: { fg: '#6b7280', bg: '#1a2332', activeFg: '#e5e7eb', activeBg: '#374151', border: '#374151' },
  tokens: {
    keyword: '#c084fc', string: '#86efac', comment: '#6b7280', number: '#fdba74',
    title: '#93c5fd', type: '#fde68a', builtIn: '#fca5a5', attr: '#f9a8d4',
    meta: '#5eead4', operator: '#67e8f9', punctuation: '#9ca3af',
  },
  focusDim: 0.32,
  decorations: {
    highlight: { bg: 'rgba(253,230,138,0.14)', bar: '#fde68a', gutterBg: 'rgba(253,230,138,0.24)', gutterFg: '#fde68a', badgeBg: '#fde68a', badgeFg: '#111827' },
    focus: { bg: 'rgba(147,197,253,0.14)', bar: '#93c5fd', gutterBg: 'rgba(147,197,253,0.24)', gutterFg: '#93c5fd', badgeBg: '#93c5fd', badgeFg: '#111827' },
    add: { bg: 'rgba(134,239,172,0.16)', bar: '#86efac', gutterBg: 'rgba(134,239,172,0.26)', gutterFg: '#86efac', badgeBg: '#86efac', badgeFg: '#111827', symbol: '+' },
    remove: { bg: 'rgba(252,165,165,0.16)', bar: '#fca5a5', gutterBg: 'rgba(252,165,165,0.26)', gutterFg: '#fca5a5', badgeBg: '#fca5a5', badgeFg: '#111827', symbol: '−' },
    warning: { bg: 'rgba(253,186,116,0.16)', bar: '#fdba74', gutterBg: 'rgba(253,186,116,0.26)', gutterFg: '#fdba74', badgeBg: '#fdba74', badgeFg: '#111827' },
    error: { bg: 'rgba(252,165,165,0.20)', bar: '#fca5a5', gutterBg: 'rgba(252,165,165,0.32)', gutterFg: '#fca5a5', badgeBg: '#fca5a5', badgeFg: '#111827' },
  },
}

// ---------- highlighting ----------

const LANGUAGES = {
  bash, c, cpp, javascript, json, makefile, markdown, perl, plaintext, python, tcl, typescript, verilog, vhdl, yaml,
}
for (const [name, definition] of Object.entries(LANGUAGES)) {
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, definition)
}

const LANGUAGE_ALIASES: Record<string, string> = {
  sv: 'verilog', systemverilog: 'verilog', v: 'verilog', vh: 'verilog', svh: 'verilog', vhd: 'vhdl',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  js: 'javascript', ts: 'typescript', py: 'python', 'c++': 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  yml: 'yaml', mk: 'makefile', make: 'makefile', md: 'markdown', txt: 'plaintext', text: 'plaintext', pl: 'perl',
}

/** Maps a fence language (including aliases such as `sv`) to a registered highlight.js language. */
export const resolveLanguage = (lang?: string) => {
  const key = (lang ?? '').trim().toLowerCase()
  if (!key) return undefined
  const resolved = LANGUAGE_ALIASES[key] ?? key
  return hljs.getLanguage(resolved) ? resolved : undefined
}

const HLJS_CLASS_TO_TOKEN: Record<string, keyof CodeTokenPalette> = {
  keyword: 'keyword', literal: 'keyword', selector_tag: 'keyword', 'selector-tag': 'keyword', tag: 'keyword',
  string: 'string', regexp: 'string', symbol: 'string', char_escape: 'string', 'char escape_': 'string', subst: 'string',
  comment: 'comment', quote: 'comment', doctag: 'comment',
  number: 'number',
  title: 'title', 'title function_': 'title', function_: 'title', name: 'title', section: 'title',
  'title class_': 'type', 'title class_ inherited__': 'type', class_: 'type',
  type: 'type', built_in: 'builtIn', 'variable language_': 'builtIn',
  attr: 'attr', attribute: 'attr', property: 'attr', variable: 'attr', params: 'attr', 'template-variable': 'attr',
  meta: 'meta', 'meta keyword': 'meta', 'meta string': 'string',
  operator: 'operator', punctuation: 'punctuation', bullet: 'punctuation',
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Turns highlight.js classes into inline colors; no class attribute survives, so app CSS cannot leak in. */
const inlineHljsClasses = (html: string, palette: CodeTokenPalette) =>
  html.replace(/<span class="([^"]*)">/g, (_, classes: string) => {
    const names = classes.split(/\s+/).filter(Boolean).map((name) => name.replace(/^hljs-/, ''))
    const token = HLJS_CLASS_TO_TOKEN[names.join(' ')] ?? HLJS_CLASS_TO_TOKEN[names[0] ?? '']
    return token ? `<span style="color:${palette[token]};">` : '<span>'
  })

/** Splits highlighted HTML into lines, closing open spans at each newline and reopening them on the next line. */
export const splitHighlightedLines = (html: string): string[] => {
  const lines: string[] = []
  const open: string[] = []
  let current = ''
  for (const [token] of html.matchAll(/<span[^>]*>|<\/span>|\n|[^<\n]+|</g)) {
    if (token === '\n') {
      lines.push(current + '</span>'.repeat(open.length))
      current = open.join('')
      continue
    }
    if (token.startsWith('<span')) open.push(token)
    else if (token === '</span>') open.pop()
    current += token
  }
  lines.push(current + '</span>'.repeat(open.length))
  return lines
}

const HIGHLIGHT_CACHE_LIMIT = 200
// Pagination renders the same block many times while measuring; highlight each source once.
const highlightCache = new Map<string, string>()

const highlightRaw = (code: string, language: string) => {
  const key = `${language}\u0000${code}`
  const cached = highlightCache.get(key)
  if (cached !== undefined) return cached
  const { value } = hljs.highlight(code, { language, ignoreIllegals: true })
  if (highlightCache.size >= HIGHLIGHT_CACHE_LIMIT) highlightCache.delete(highlightCache.keys().next().value!)
  highlightCache.set(key, value)
  return value
}

export type HighlightedCode = {
  language?: string
  /** One safe HTML string per line, colors inlined. */
  lines: string[]
}

export const highlightCode = (code: string, lang: string | undefined, palette: CodeTokenPalette): HighlightedCode => {
  const plain = () => code.split('\n').map(escapeHtml)
  const language = resolveLanguage(lang)
  if (!language) return { lines: plain() }
  try {
    return { language, lines: splitHighlightedLines(inlineHljsClasses(highlightRaw(code, language), palette)) }
  } catch {
    return { language, lines: plain() }
  }
}

// ---------- rendering ----------

export type CodeRenderOptions = {
  theme: CodeTheme
  /** CSS px, 12–14 recommended. */
  fontSize: number
  lineHeight: number
  monoFamily: string
  radius: number
  /** Space reserved below the window; must cover the shadow so the card body never clips it. */
  bottomSpace: number
  smallFontSize: number
  showLineNumbers?: boolean
  /** Draws the macOS traffic lights in the title bar. */
  windowChrome?: boolean
}

export const CODE_SHADOW = { offsetY: 6, blur: 16 }
const TRAFFIC_LIGHTS = ['#ff5f57', '#febc2e', '#28c840']
const TITLE_BAR_HEIGHT = 36
const CODE_PADDING = { top: 12, bottom: 14, x: 16 }
const DECORATION_BAR = 3
const HANGING_INDENT_CH = 2
/** Average monospace advance relative to font size. */
const CHAR_WIDTH_EM = 0.6

/** Long lines get a smaller font: −1px beyond 48 columns, −2px beyond 60. */
export const codeFontSize = (base: number, maxLineWidth: number) =>
  maxLineWidth > 60 ? Math.max(10, base - 2) : maxLineWidth > 48 ? Math.max(11, base - 1) : base

export const codeGutterWidth = (lastLine: number, fontSize: number) =>
  Math.round((String(lastLine).length + 1) * fontSize * CHAR_WIDTH_EM) + 26

const blockMetrics = (node: CodeNode, baseFontSize: number) => {
  const lines = node.code.split('\n')
  const start = node.startLine ?? 1
  const maxLineWidth = node.maxLineWidth ?? Math.max(0, ...lines.map(displayWidth))
  return {
    lines,
    start,
    end: node.blockEndLine ?? start + lines.length - 1,
    fontSize: codeFontSize(baseFontSize, maxLineWidth),
  }
}

/** Highlights a split chunk with the whole block as context so multi-line comments keep their color. */
const highlightNode = (node: CodeNode, lineCount: number, palette: CodeTokenPalette) => {
  if (node.blockCode === undefined) return highlightCode(node.code, node.lang, palette)
  const whole = highlightCode(node.blockCode, node.lang, palette)
  const from = (node.startLine ?? 1) - (node.blockStartLine ?? 1)
  return { language: whole.language, lines: whole.lines.slice(from, from + lineCount) }
}

const strikeThrough = (html: string) =>
  // html2canvas draws decorations per element and ignores text-decoration-color, so every span gets its own plain line-through.
  html.replace(/<span(?: style="([^"]*)")?>/g, (_, style = '') => `<span style="${style}text-decoration:line-through;">`)

const renderBadge = (decoration: LineDecoration, style: LineDecorationStyle, theme: CodeTheme, fontSize: number) => {
  if (!decoration.note) return ''
  const bg = style.badgeBg ?? style.bar
  const fg = style.badgeFg ?? (theme.scheme === 'dark' ? theme.bg : '#ffffff')
  return `<span style="display:inline-block;margin-left:10px;padding:0 8px;border-radius:999px;background:${bg};color:${fg};font-size:${Math.max(10, fontSize - 2)}px;font-weight:700;line-height:1.6;text-indent:0;text-decoration:none;vertical-align:1px;white-space:nowrap;">${escapeHtml(decoration.note)}</span>`
}

export const renderXhsCode = (node: CodeNode, options: CodeRenderOptions): string => {
  const { theme: t, lineHeight, monoFamily, radius, bottomSpace, smallFontSize } = options
  const showLineNumbers = options.showLineNumbers ?? true
  const windowChrome = options.windowChrome ?? true
  const { lines, start, end, fontSize } = blockMetrics(node, options.fontSize)
  const highlighted = highlightNode(node, lines.length, t.tokens)
  const rowHeight = Math.round(fontSize * lineHeight)
  const gutterWidth = showLineNumbers ? codeGutterWidth(end, fontSize) : 0
  const continued = node.label.endsWith('（续）')
  const title = `${escapeHtml((node.lang || 'code').toUpperCase())}${continued ? ' · 续' : ''}`

  const rows = lines.map((_, index) => {
    const lineNumber = start + index
    const decoration = node.decorations?.[lineNumber]
    const style = decoration ? t.decorations[decoration.kind] : undefined
    const dimmed = Boolean(node.focus) && decoration?.kind !== 'focus'
    const html = highlighted.lines[index] || escapeHtml(lines[index])
    const lineHtml = decoration?.kind === 'remove' ? strikeThrough(`<span>${html}</span>`) : html
    const gutterFg = style ? style.gutterFg ?? t.gutter.activeFg ?? t.gutter.fg : t.gutter.fg
    const gutterBg = style ? style.gutterBg ?? t.gutter.activeBg : undefined
    const gutter = showLineNumbers
      ? `<span style="flex:none;width:${gutterWidth}px;box-sizing:border-box;padding:0 10px 0 12px;text-align:right;color:${gutterFg};${style ? 'font-weight:700;' : ''}${gutterBg ? `background:${gutterBg};` : ''}${t.gutter.border ? `border-right:1px solid ${t.gutter.border};` : ''}">${style?.symbol ?? lineNumber}</span>`
      : ''
    const padLeft = CODE_PADDING.x - (style ? DECORATION_BAR : 0)
    const decorationStyle = style ? `background:${style.bg};border-left:${DECORATION_BAR}px solid ${style.bar};` : ''
    const badge = decoration && style ? renderBadge(decoration, style, t, fontSize) : ''
    // Wrapped continuation lines hang 2ch to the right so they do not read as new statements.
    const code = `<span style="flex:1 1 auto;display:block;min-width:0;padding:0 ${CODE_PADDING.x}px 0 calc(${padLeft}px + ${HANGING_INDENT_CH}ch);text-indent:-${HANGING_INDENT_CH}ch;white-space:pre-wrap;word-break:break-all;overflow-wrap:anywhere;color:${t.fg};${decorationStyle}">${lineHtml || ' '}${badge}</span>`
    return `<div style="display:flex;align-items:stretch;min-height:${rowHeight}px;${dimmed ? `opacity:${t.focusDim};` : ''}">${gutter}${code}</div>`
  }).join('')

  const bodyBackground = showLineNumbers
    ? `linear-gradient(90deg,${t.gutter.bg} 0px,${t.gutter.bg} ${gutterWidth}px,${t.bg} ${gutterWidth}px,${t.bg} 100%)`
    : t.bg
  const titleText = `<span style="flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:${windowChrome ? 'center' : 'left'};font-family:${monoFamily};font-size:${smallFontSize}px;font-weight:600;letter-spacing:0.08em;color:${t.title};">${title}</span>`
  const titleBar = windowChrome
    ? `<div style="display:flex;align-items:center;gap:8px;height:${TITLE_BAR_HEIGHT}px;padding:0 14px;background:${t.titleBg};border-bottom:1px solid ${t.border};">${TRAFFIC_LIGHTS.map((color) => `<span style="flex:none;width:11px;height:11px;border-radius:50%;background:${color};"></span>`).join('')}${titleText}<span style="flex:none;width:49px;"></span></div>`
    : `<div style="display:flex;align-items:center;height:${TITLE_BAR_HEIGHT - 6}px;padding:0 14px;background:${t.titleBg};border-bottom:1px solid ${t.border};">${titleText}</div>`

  // html2canvas-pro drops the shadow of an element that has overflow:hidden, so the outer frame carries
  // border and shadow while an inner layer clips the content to the rounded corners.
  return `<div class="xhs-code" style="padding:0 0 ${bottomSpace}px;"><section style="border-radius:${radius + 4}px;border:1px solid ${t.border};background:${t.bg};box-shadow:0 ${CODE_SHADOW.offsetY}px ${CODE_SHADOW.blur}px ${t.shadow};"><div style="border-radius:${radius + 3}px;overflow:hidden;">${titleBar}<div style="padding:${CODE_PADDING.top}px 0 ${CODE_PADDING.bottom}px;background:${bodyBackground};font-family:${monoFamily};font-size:${fontSize}px;line-height:${lineHeight};tab-size:${CODE_TAB_SIZE};">${rows}</div></div></section></div>`
}

export type CodeEstimateOptions = {
  fontSize: number
  lineHeight: number
  contentWidth: number
  bottomSpace: number
  showLineNumbers?: boolean
}

/** DOM-free height estimate, mirroring renderXhsCode's layout (wrapping, hanging indent, badges). */
export const estimateCodeHeight = (node: CodeNode, options: CodeEstimateOptions) => {
  const { lines, start, end, fontSize } = blockMetrics(node, options.fontSize)
  const charWidth = fontSize * CHAR_WIDTH_EM
  const gutterWidth = (options.showLineNumbers ?? true) ? codeGutterWidth(end, fontSize) : 0
  const firstColumns = Math.max(8, Math.floor((options.contentWidth - 2 - gutterWidth - CODE_PADDING.x * 2) / charWidth))
  const wrapColumns = Math.max(1, firstColumns - HANGING_INDENT_CH)
  const rows = lines.reduce((sum, line, index) => {
    const note = node.decorations?.[start + index]?.note
    const width = displayWidth(line) + (note ? Math.ceil((displayWidth(note) * 0.5 * (fontSize - 2) + 26) / charWidth) : 0)
    return sum + 1 + Math.ceil(Math.max(0, width - firstColumns) / wrapColumns)
  }, 0)
  return TITLE_BAR_HEIGHT + 1 + CODE_PADDING.top + CODE_PADDING.bottom + 2 + rows * Math.round(fontSize * options.lineHeight) + options.bottomSpace
}
