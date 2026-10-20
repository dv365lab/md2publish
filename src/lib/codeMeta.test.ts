import { describe, expect, it } from 'vitest'
import { displayWidth, expandRanges, MAX_HIGHLIGHT_LINES, parseFenceInfo, parseLineMarkers } from './codeMeta'

describe('expandRanges', () => {
  it('expands single lines and ranges in order without duplicates', () => {
    expect(expandRanges('12, 15-17,3,16')).toEqual([3, 12, 15, 16, 17])
  })

  it('ignores zero, reversed and malformed parts', () => {
    expect(expandRanges('0,5-3,a,2-,-4,7')).toEqual([7])
  })

  it('caps very large ranges', () => {
    expect(expandRanges('1-99999999')).toHaveLength(MAX_HIGHLIGHT_LINES)
  })
})

describe('parseFenceInfo', () => {
  it('reads a colon start line from the language', () => {
    expect(parseFenceInfo('sv:42')).toEqual({ lang: 'sv', startLine: 42, highlightLines: [] })
  })

  it('reads start= and highlighted lines from meta', () => {
    expect(parseFenceInfo('sv', '{start=10} {12,15-17}')).toEqual({ lang: 'sv', startLine: 10, highlightLines: [12, 15, 16, 17] })
    expect(parseFenceInfo('py', 'startLine=3')).toMatchObject({ lang: 'py', startLine: 3 })
    expect(parseFenceInfo('py', '{3} start = 8')).toEqual({ lang: 'py', startLine: 8, highlightLines: [3] })
  })

  it('prefers start= over the colon form and accepts options glued to the language', () => {
    expect(parseFenceInfo('sv:42', '{start=7}')).toMatchObject({ lang: 'sv', startLine: 7 })
    expect(parseFenceInfo('sv{start=3}')).toMatchObject({ lang: 'sv', startLine: 3 })
  })

  it('ignores invalid start lines and keeps plain fences unchanged', () => {
    expect(parseFenceInfo('sv', '{start=0}')).toEqual({ lang: 'sv', highlightLines: [] })
    expect(parseFenceInfo('')).toEqual({ lang: '', highlightLines: [] })
    expect(parseFenceInfo('c++')).toEqual({ lang: 'c++', highlightLines: [] })
  })
})

describe('parseLineMarkers', () => {
  const source = [
    'always_ff @(posedge clk) begin',
    '  if (!rst_n)        // [!code focus]',
    "    cnt <= '0;       // [!code highlight]",
    '    cnt <= cnt + 1;  // [!code ++]',
    '    cnt <= cnt - 1;  // [!code --]',
    '  overflow <= &cnt;  // [!code warning] 注意位宽',
    'end',
  ].join('\n')

  it('strips every marker and keys decorations by displayed line number', () => {
    const parsed = parseLineMarkers(source, 10)
    expect(parsed.code).toBe([
      'always_ff @(posedge clk) begin',
      '  if (!rst_n)',
      "    cnt <= '0;",
      '    cnt <= cnt + 1;',
      '    cnt <= cnt - 1;',
      '  overflow <= &cnt;',
      'end',
    ].join('\n'))
    expect(parsed.decorations).toEqual({
      11: { kind: 'focus' },
      12: { kind: 'highlight' },
      13: { kind: 'add' },
      14: { kind: 'remove' },
      15: { kind: 'warning', note: '注意位宽' },
    })
    expect(parsed.focus).toBe(true)
    expect(parsed.code).not.toContain('[!code')
  })

  it.each([
    ['x = 1  # [!code error] 越界', 'x = 1', 'error'],
    ['signal a : bit; -- [!code highlight]', 'signal a : bit;', 'highlight'],
    ['mov r0, #1 ; [!code ++]', 'mov r0, #1', 'add'],
    ['// [!code focus]', '', 'focus'],
  ] as const)('supports the %s comment style', (line, code, kind) => {
    const parsed = parseLineMarkers(line)
    expect(parsed.code).toBe(code)
    expect(parsed.decorations[1]?.kind).toBe(kind)
  })

  it('merges brace highlights within the block and lets inline markers win', () => {
    const parsed = parseLineMarkers('a\nb // [!code error] 错\nc', 10, [9, 10, 11, 13])
    expect(parsed.decorations).toEqual({ 10: { kind: 'highlight' }, 11: { kind: 'error', note: '错' } })
    expect(parsed.focus).toBe(false)
  })

  it('keeps code without markers untouched', () => {
    const code = 'int a = 1; // 普通注释\n[!code] is text'
    expect(parseLineMarkers(code)).toEqual({ code, decorations: {}, focus: false })
  })
})

describe('displayWidth', () => {
  it('counts CJK and full-width characters as two columns and tabs as four', () => {
    expect(displayWidth('ab')).toBe(2)
    expect(displayWidth('计数器，ok')).toBe(10)
    expect(displayWidth('\tx')).toBe(5)
  })
})
