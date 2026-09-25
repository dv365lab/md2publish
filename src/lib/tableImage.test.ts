import { describe, expect, it } from 'vitest'
import { buildTableHtml, extractTablesFromMarkdown } from './tableImage'

describe('buildTableHtml', () => {
  it.each(['zsxq', 'wechat'] as const)(
    'retains bold table cells and filters footnotes in %s table images',
    (platform) => {
      const [table] = extractTablesFromMarkdown(
        '| **字段**[^header] | 内容 |\n| --- | --- |\n| **RC，根复合体。 **[^1] | **1 < 2 & 3 > 2**[^source] |',
        platform,
      )
      const html = buildTableHtml(table)
      const container = document.createElement('div')
      container.innerHTML = html
      const boldTexts = Array.from(container.querySelectorAll('strong'), (node) => node.textContent?.trim())

      expect(boldTexts).toEqual(['字段', 'RC，根复合体。', '1 < 2 & 3 > 2'])
      expect(container.textContent).not.toMatch(/\[\^[^\]]+\]/u)
      expect(container.textContent).not.toContain('**')
      expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 2')
    },
  )

  it('keeps horizontal padding without adding vertical whitespace to table images', () => {
    const result = buildTableHtml({
      header: ['字段', '内容'],
      rows: [['平台', '知识星球']],
    })

    expect(result).toContain('style="padding:0 24px;')
    expect(result).not.toContain('style="padding:24px;')
  })

  it('uses the same one-line ID width and manual overrides in exported images', () => {
    const table = {
      header: ['ID', 'Test Point'],
      rows: [['EX-L01', 'exclusive burst']],
    }

    const defaultHtml = buildTableHtml(table)
    const adjustedHtml = buildTableHtml(table, { 0: 180, 1: 420 })

    expect(defaultHtml).toContain('min-width:136px;white-space:nowrap;')
    expect(defaultHtml).toContain('>EX-L01</td>')
    expect(adjustedHtml).toContain('min-width:180px;white-space:nowrap;')
    expect(adjustedHtml).toContain('min-width:420px;')
  })
})
