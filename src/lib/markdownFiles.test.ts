import { describe, expect, it } from 'vitest'
import { loadMarkdownBundle } from './markdownFiles'

describe('loadMarkdownBundle', () => {
  it('loads one markdown file and resolves selected local images', async () => {
    const markdown = new File(['![图表](images/chart.png)'], 'article.md', {
      type: 'text/markdown',
    })
    const image = new File(['fake-png'], 'chart.png', { type: 'image/png' })

    const result = await loadMarkdownBundle([markdown, image])

    expect(result.markdown).toBe('![图表](images/chart.png)')
    expect(result.markdownFileName).toBe('article.md')
    expect(result.imageSources['images/chart.png']).toMatch(/^data:image\/png;base64,/)
  })

  it('rejects an ambiguous selection with more than one markdown file', async () => {
    const first = new File(['# A'], 'a.md', { type: 'text/markdown' })
    const second = new File(['# B'], 'b.markdown', { type: 'text/markdown' })

    await expect(loadMarkdownBundle([first, second])).rejects.toThrow('只能选择一个 Markdown 文件')
  })
})
