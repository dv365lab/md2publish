/**
 * Platform-neutral parsing of fenced code options and inline line markers.
 *
 * Fence syntax: ```sv:42, ```sv {start=10}, ```sv {12,15-17} (absolute, displayed line numbers).
 * Inline markers (Shiki/VitePress style) are stripped from the code on every platform:
 *   cnt <= cnt + 1;  // [!code ++]
 *   overflow <= &cnt; // [!code warning] 注意位宽
 */

export type LineDecorationKind = 'highlight' | 'focus' | 'add' | 'remove' | 'warning' | 'error'

export type LineDecoration = { kind: LineDecorationKind; note?: string }

/** Decorations keyed by displayed (absolute) line number. */
export type LineDecorations = Readonly<Record<number, LineDecoration>>

export const MAX_HIGHLIGHT_LINES = 1000
const MAX_START_LINE = 1_000_000

/** "1,3-5" → [1,3,4,5]; ignores zero, reversed and malformed parts and caps the total. */
export const expandRanges = (spec: string): number[] => {
  const lines = new Set<number>()
  for (const part of spec.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/u)
    if (!match) continue
    const from = Number(match[1])
    const to = match[2] === undefined ? from : Number(match[2])
    if (from < 1 || to < from) continue
    for (let line = from; line <= to && lines.size < MAX_HIGHLIGHT_LINES; line += 1) lines.add(line)
    if (lines.size >= MAX_HIGHLIGHT_LINES) break
  }
  return [...lines].sort((a, b) => a - b)
}

const validStart = (value: string | undefined) => {
  if (value === undefined) return undefined
  const line = Number(value)
  return Number.isSafeInteger(line) && line >= 1 && line <= MAX_START_LINE ? line : undefined
}

export type FenceInfo = { lang: string; startLine?: number; highlightLines: number[] }

export const parseFenceInfo = (rawLang = '', rawMeta = ''): FenceInfo => {
  // ```sv{start=3} has no space, so remark keeps the options inside `lang`.
  const braceIndex = rawLang.indexOf('{')
  const langPart = braceIndex >= 0 ? rawLang.slice(0, braceIndex) : rawLang
  const meta = `${braceIndex >= 0 ? rawLang.slice(braceIndex) : ''} ${rawMeta}`
  const colon = langPart.trim().match(/^(.*?):(\d+)$/u)
  const lang = (colon ? colon[1] : langPart).trim()
  const metaStart = meta.match(/(?:^|[\s{,])(?:start|startLine)\s*=\s*(\d+)/iu)?.[1]
  const startLine = validStart(metaStart) ?? validStart(colon?.[2])
  const highlightLines = expandRanges(
    [...meta.matchAll(/\{([\d,\-\s]+)\}/gu)].map((match) => match[1]).join(','),
  )
  return { lang, ...(startLine === undefined ? {} : { startLine }), highlightLines }
}

const MARKER_PATTERN = /\s*(?:\/\/|#|--|;)\s*\[!code\s+(highlight|focus|\+\+|--|warning|error)\]\s*(.*)$/u

const KIND_BY_MARKER: Record<string, LineDecorationKind> = {
  highlight: 'highlight',
  focus: 'focus',
  '++': 'add',
  '--': 'remove',
  warning: 'warning',
  error: 'error',
}

export type ParsedCodeLines = { code: string; decorations: LineDecorations; focus: boolean }

export const parseLineMarkers = (source: string, startLine = 1, highlightLines: number[] = []): ParsedCodeLines => {
  const decorations: Record<number, LineDecoration> = {}
  const lines = source.split('\n').map((line, index) => {
    const match = line.match(MARKER_PATTERN)
    if (!match || match.index === undefined) return line
    const note = match[2].trim()
    decorations[startLine + index] = { kind: KIND_BY_MARKER[match[1]], ...(note ? { note } : {}) }
    return line.slice(0, match.index).trimEnd()
  })
  const lastLine = startLine + lines.length - 1
  for (const line of highlightLines) {
    if (line >= startLine && line <= lastLine && !decorations[line]) decorations[line] = { kind: 'highlight' }
  }
  return {
    code: lines.join('\n'),
    decorations,
    focus: Object.values(decorations).some((decoration) => decoration.kind === 'focus'),
  }
}

const WIDE_CHAR = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u

export const CODE_TAB_SIZE = 4

/** Width in monospace columns: CJK and full-width characters take two, tabs take CODE_TAB_SIZE. */
export const displayWidth = (line: string) =>
  [...line].reduce((width, char) => width + (char === '\t' ? CODE_TAB_SIZE : WIDE_CHAR.test(char) ? 2 : 1), 0)
