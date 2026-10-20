import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { pptxToMarkdown } from './pptxImport'
import { buildRenderNodes, type RenderNode } from './renderers'

const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const RELS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"'

const run = (text: string, bold = false) => `<a:r>${bold ? '<a:rPr b="1"/>' : '<a:rPr/>'}<a:t>${text}</a:t></a:r>`
const para = (runs: string, pPr = '') => `<a:p>${pPr}${runs}</a:p>`
const shape = (body: string, ph?: string, off?: [number, number]) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="1" name="s"/><p:cNvSpPr/><p:nvPr>${ph ?? ''}</p:nvPr></p:nvSpPr><p:spPr>${off ? `<a:xfrm><a:off x="${off[0]}" y="${off[1]}"/></a:xfrm>` : ''}</p:spPr><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp>`
const slide = (content: string, attrs = '') =>
  `<?xml version="1.0" encoding="UTF-8"?><p:sld ${P}${attrs}><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`
const picture = (rel: string, descr: string) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="5" name="pic" descr="${descr}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rel}"/></p:blipFill><p:spPr/></p:pic>`
const cell = (text: string) => `<a:tc><a:txBody><a:bodyPr/>${para(run(text))}</a:txBody></a:tc>`
const table = (rows: string[][]) =>
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>${rows.map((row) => `<a:tr>${row.map(cell).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
const chart = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="8" name="c"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame>'

const buildPptx = async () => {
  const zip = new JSZip()
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation ${P}><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/><p:sldId id="259" r:id="rId4"/></p:sldIdLst></p:presentation>`,
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0"?><Relationships ${RELS}><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide10.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/><Relationship Id="rId4" Target="slides/slide3.xml"/></Relationships>`,
  )
  zip.file(
    'ppt/slides/slide1.xml',
    slide(shape(para(run('芯片验证 *入门*')), '<p:ph type="ctrTitle"/>') + shape(para(run('副标题')), '<p:ph type="subTitle" idx="1"/>')),
  )
  zip.file(
    'ppt/slides/slide10.xml',
    slide(
      shape(para(run('方法 &amp; 流程')), '<p:ph type="title"/>') +
        shape(
          para(run('重点', true) + run('第一点')) + para(run('子点'), '<a:pPr lvl="1"/>') + para(run('第二点')),
          '<p:ph idx="1"/>',
        ) +
        shape(para(run('1. 不是列表')) ) +
        shape(para(run('10')), '<p:ph type="sldNum" idx="12"/>') +
        `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="9" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shape(para(run('组合内文本')))}</p:grpSp>` +
        picture('rId5', '架构图') +
        picture('rId6', '矢量图') +
        table([['名称', '值'], ['a|b', '1']]) +
        chart,
    ),
  )
  zip.file(
    'ppt/slides/_rels/slide10.xml.rels',
    `<?xml version="1.0"?><Relationships ${RELS}><Relationship Id="rId5" Target="../media/image1.png"/><Relationship Id="rId6" Target="../media/image2.emf"/></Relationships>`,
  )
  zip.file('ppt/media/image1.png', new Uint8Array([137, 80, 78, 71]))
  zip.file('ppt/media/image2.emf', new Uint8Array([1, 2, 3]))
  zip.file('ppt/slides/slide2.xml', slide(shape(para(run('隐藏内容')), '<p:ph type="title"/>'), ' show="0"'))
  zip.file(
    'ppt/slides/slide3.xml',
    slide(shape(para(run('下方')), undefined, [0, 2000]) + shape(para(run('上方')), undefined, [0, 1000])),
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

const summarize = (nodes: RenderNode[]) =>
  nodes.map((node) => {
    switch (node.type) {
      case 'heading': return `h${node.level}:${node.text}`
      case 'paragraph': return `p:${node.text}`
      case 'list': return `list:${node.items.length}`
      case 'table': return `table:${node.header.join(',')}`
      case 'image': return `img:${node.alt}`
      default: return node.type
    }
  })

describe('pptxToMarkdown', () => {
  it('converts slides in presentation order into markdown that parses back into the expected structure', async () => {
    const result = await pptxToMarkdown(await buildPptx(), 'deck')
    const nodes = buildRenderNodes(result.markdown, 'wechat', result.imageSources, { keepThematicBreaks: true })

    expect(summarize(nodes)).toEqual([
      'h1:芯片验证 *入门*',
      'p:副标题',
      'thematicBreak',
      'h2:一、方法 & 流程',
      'list:2',
      'p:1. 不是列表',
      'p:组合内文本',
      'img:架构图',
      'table:名称,值',
      'thematicBreak',
      'p:上方',
      'p:下方',
    ])
    expect(result.slideCount).toBe(3)
    expect(result.notes).toEqual(['已跳过 1 张隐藏页', '已跳过浏览器无法显示的图片（emf）', '1 个图表未转换'])
  })

  it('keeps bold runs, nested list levels, table cells and image data', async () => {
    const result = await pptxToMarkdown(await buildPptx(), 'deck')
    const nodes = buildRenderNodes(result.markdown, 'wechat', result.imageSources)
    const list = nodes.find((node) => node.type === 'list')
    expect(list?.type === 'list' && list.items[0].blocks[0]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', value: '重点', bold: true }, { type: 'text', value: '第一点' }],
    })
    expect(list?.type === 'list' && list.items[0].blocks[1]).toMatchObject({ type: 'list' })
    const tableNode = nodes.find((node) => node.type === 'table')
    expect(tableNode?.type === 'table' && tableNode.rows).toEqual([['a|b', '1']])
    expect(result.imageSources['pptx-media/image1.png']).toBe('data:image/png;base64,iVBORw==')
    const image = nodes.find((node) => node.type === 'image')
    expect(image?.type === 'image' && image.src).toBe('data:image/png;base64,iVBORw==')
    expect(result.markdown).not.toContain('隐藏内容')
    expect(result.markdown).not.toContain('\n10\n')
  })

  it('uses the file name as the H1 when the first slide is not a title slide', async () => {
    const zip = new JSZip()
    zip.file('ppt/slides/slide1.xml', slide(shape(para(run('第一页')), '<p:ph type="title"/>') + shape(para(run('内容')))))
    const result = await pptxToMarkdown(await zip.generateAsync({ type: 'arraybuffer' }), 'deck')
    expect(result.markdown).toBe('# deck\n\n## 第一页\n\n内容\n')
  })

  it('rejects files that are not pptx packages', async () => {
    await expect(pptxToMarkdown(new TextEncoder().encode('not a zip').buffer as ArrayBuffer)).rejects.toThrow('无法读取 PPTX 文件')
    const empty = await new JSZip().generateAsync({ type: 'arraybuffer' })
    await expect(pptxToMarkdown(empty)).rejects.toThrow('未在 PPTX 中找到幻灯片')
  })
})
