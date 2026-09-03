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
})
