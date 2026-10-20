import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { loadMarkdownBundle, loadSourceBundle } from './markdownFiles'

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

describe('loadSourceBundle', () => {
  const pptxFile = async (name = 'deck.pptx') => {
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="t"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>演示标题</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    )
    return new File([await zip.generateAsync({ type: 'arraybuffer' })], name)
  }

  it('delegates markdown selections to the markdown loader', async () => {
    const result = await loadSourceBundle([new File(['# A'], 'a.md', { type: 'text/markdown' })])
    expect(result.markdown).toBe('# A')
    expect(result.sourceKind).toBeUndefined()
  })

  it('converts a single pptx deck into a markdown bundle', async () => {
    const result = await loadSourceBundle([await pptxFile()])
    expect(result).toMatchObject({
      markdown: '# 演示标题\n',
      markdownFileName: 'deck.pptx',
      sourceKind: 'pptx',
      slideCount: 1,
      unresolvedImageReferences: [],
      importNotes: [],
    })
  })

  it('rejects legacy ppt files, mixed selections and selections without a document', async () => {
    await expect(loadSourceBundle([new File(['x'], 'old.ppt')])).rejects.toThrow('另存为 .pptx')
    await expect(
      loadSourceBundle([await pptxFile(), new File(['# A'], 'a.md', { type: 'text/markdown' })]),
    ).rejects.toThrow('一次只能导入一个 Markdown 或 PPTX 文件')
    await expect(loadSourceBundle([await pptxFile('a.pptx'), await pptxFile('b.pptx')])).rejects.toThrow('一次只能导入一个')
    await expect(loadSourceBundle([new File(['x'], 'a.png', { type: 'image/png' })])).rejects.toThrow('.pptx 文件')
  })
})