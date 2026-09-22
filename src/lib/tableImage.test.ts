import { describe, expect, it } from 'vitest'
import { buildTableHtml } from './tableImage'

describe('buildTableHtml', () => {
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
