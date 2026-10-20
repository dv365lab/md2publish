import type JSZip from 'jszip'
import type { ImageSourceMap } from './renderers'

const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
} as const

export type PptxConversion = {
  markdown: string
  imageSources: ImageSourceMap
  slideCount: number
  notes: string[]
}

type Relationship = { target: string; external: boolean }

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
}

/** Placeholders whose text is chrome (date, footer, slide number), not content. */
const IGNORED_PLACEHOLDERS = new Set(['dt', 'ftr', 'sldNum', 'hdr'])
const TITLE_PLACEHOLDERS = new Set(['title', 'ctrTitle'])
const BODY_PLACEHOLDERS = new Set(['body', 'obj', ''])

const children = (element: Element | null | undefined, ns: string, name: string) =>
  element ? Array.from(element.children).filter((child) => child.namespaceURI === ns && child.localName === name) : []
const child = (element: Element | null | undefined, ns: string, name: string) => children(element, ns, name)[0]
const path = (element: Element | null | undefined, ...steps: [string, string][]) =>
  steps.reduce<Element | undefined>((current, [ns, name]) => child(current, ns, name), element ?? undefined)

const parseXml = (text: string, name: string) => {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`PPTX 内容损坏：${name}`)
  return doc
}

const dirnameOf = (value: string) => value.slice(0, value.lastIndexOf('/') + 1)
const basenameOf = (value: string) => value.slice(value.lastIndexOf('/') + 1)

const resolvePartPath = (baseDir: string, target: string) => {
  const segments = (target.startsWith('/') ? target.slice(1) : `${baseDir}${target}`).split('/')
  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === '..') resolved.pop()
    else if (segment && segment !== '.') resolved.push(segment)
  }
  return resolved.join('/')
}

const readText = async (zip: JSZip, name: string) => {
  const file = zip.file(name)
  return file ? file.async('string') : null
}

const readRelationships = async (zip: JSZip, partPath: string) => {
  const relsPath = `${dirnameOf(partPath)}_rels/${basenameOf(partPath)}.rels`
  const text = await readText(zip, relsPath)
  const relationships = new Map<string, Relationship>()
  if (!text) return relationships
  for (const element of Array.from(parseXml(text, relsPath).getElementsByTagNameNS(NS.rel, 'Relationship'))) {
    const id = element.getAttribute('Id')
    const target = element.getAttribute('Target')
    if (!id || !target) continue
    const external = element.getAttribute('TargetMode') === 'External'
    relationships.set(id, { target: external ? target : resolvePartPath(dirnameOf(partPath), target), external })
  }
  return relationships
}

const slideNumber = (name: string) => Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? 0)

const slideOrder = async (zip: JSZip) => {
  const presentationPath = 'ppt/presentation.xml'
  const text = await readText(zip, presentationPath)
  if (text) {
    const relationships = await readRelationships(zip, presentationPath)
    const ordered = Array.from(parseXml(text, presentationPath).getElementsByTagNameNS(NS.p, 'sldId'))
      .map((element) => relationships.get(element.getAttributeNS(NS.r, 'id') ?? '')?.target)
      .filter((target): target is string => Boolean(target && zip.file(target)))
    if (ordered.length) return ordered
  }
  // Fallback for packages without a usable slide list: numeric, not lexical, order.
  return Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => slideNumber(left) - slideNumber(right))
}

// ---------- markdown text helpers ----------

const escapeMarkdown = (value: string) => value.replace(/[\\`*_[\]<>~|]/g, '\\$&')

/** Prevents paragraph or list content lines from being re-parsed as headings, lists or setext underlines. */
const escapeLineStart = (value: string) =>
  value.replace(/^(\s*)([#+=-])/gm, '$1\\$2').replace(/^(\s*)(\d+)([.)])/gm, '$1$2\\$3')

type Run = { text: string; bold: boolean }

const paragraphRuns = (paragraph: Element): Run[] => {
  const runs: Run[] = []
  for (const node of Array.from(paragraph.children)) {
    if (node.namespaceURI !== NS.a) continue
    if (node.localName === 'br') {
      runs.push({ text: '\n', bold: false })
      continue
    }
    if (node.localName !== 'r' && node.localName !== 'fld') continue
    const text = child(node, NS.a, 't')?.textContent ?? ''
    const bold = ['1', 'true'].includes(child(node, NS.a, 'rPr')?.getAttribute('b') ?? '')
    if (text) runs.push({ text: text.replace(/\v/g, '\n'), bold })
  }
  return runs
}

const runsToMarkdown = (runs: Run[]) => {
  const merged: Run[] = []
  for (const run of runs) {
    const last = merged.at(-1)
    if (last && last.bold === run.bold && run.text !== '\n' && last.text !== '\n') last.text += run.text
    else merged.push({ ...run })
  }
  return merged
    .map(({ text, bold }) => {
      if (text === '\n') return '\n'
      const escaped = escapeMarkdown(text)
      if (!bold) return escaped
      const [, lead, core, trail] = escaped.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? ['', '', escaped, '']
      return core ? `${lead}**${core}**${trail}` : escaped
    })
    .join('')
}

const plainText = (runs: Run[]) => runs.map((run) => run.text).join('').replace(/\s*\n\s*/g, ' ').trim()

// ---------- slide content ----------

type SlideItem =
  | { kind: 'title'; text: string; type: string }
  | { kind: 'subtitle'; markdown: string }
  | { kind: 'block'; markdown: string }

type Positioned = { item: SlideItem; y?: number; x?: number }

type ConversionContext = {
  zip: JSZip
  relationships: Map<string, Relationship>
  imageSources: Record<string, string>
  notes: { charts: number; smartArt: number; unsupportedImages: Set<string> }
}

const offsetOf = (xfrm: Element | undefined) => {
  const off = child(xfrm, NS.a, 'off')
  if (!off) return {}
  return { x: Number(off.getAttribute('x') ?? 0), y: Number(off.getAttribute('y') ?? 0) }
}

const textShapeToMarkdown = (txBody: Element, placeholderType: string | null) => {
  const paragraphs = children(txBody, NS.a, 'p')
    .map((paragraph) => {
      const pPr = child(paragraph, NS.a, 'pPr')
      return {
        runs: paragraphRuns(paragraph),
        level: Number(pPr?.getAttribute('lvl') ?? 0),
        noBullet: Boolean(child(pPr, NS.a, 'buNone')),
        ordered: Boolean(child(pPr, NS.a, 'buAutoNum')),
        explicitBullet: Boolean(child(pPr, NS.a, 'buChar') || child(pPr, NS.a, 'buAutoNum')),
      }
    })
    .filter((paragraph) => plainText(paragraph.runs))
  if (!paragraphs.length) return ''

  // Body placeholders inherit bullets from the master; plain text boxes do not.
  const inheritsBullets = placeholderType !== null && BODY_PLACEHOLDERS.has(placeholderType) && paragraphs.length > 1
  const blocks: string[] = []
  let listLines: string[] = []
  let previousLevel = -1
  const flushList = () => {
    if (listLines.length) blocks.push(listLines.join('\n'))
    listLines = []
    previousLevel = -1
  }

  for (const paragraph of paragraphs) {
    const isBullet = !paragraph.noBullet && (paragraph.explicitBullet || inheritsBullets || paragraph.level > 0)
    if (!isBullet) {
      flushList()
      blocks.push(escapeLineStart(runsToMarkdown(paragraph.runs).trim()))
      continue
    }
    // Clamp level jumps so deeper indentation is never parsed as a code block.
    const level = Math.min(paragraph.level, previousLevel + 1)
    previousLevel = level
    const indent = '    '.repeat(level)
    const content = escapeLineStart(runsToMarkdown(paragraph.runs).trim()).replace(/\n/g, `\n${indent}    `)
    listLines.push(`${indent}${paragraph.ordered ? '1.' : '-'} ${content}`)
  }
  flushList()
  return blocks.join('\n\n')
}

const tableToMarkdown = (table: Element) => {
  const rows = children(table, NS.a, 'tr').map((row) =>
    children(row, NS.a, 'tc').map((cell) => {
      if (cell.getAttribute('hMerge') === '1' || cell.getAttribute('vMerge') === '1') return ''
      const txBody = child(cell, NS.a, 'txBody')
      return children(txBody, NS.a, 'p')
        .map((paragraph) => runsToMarkdown(paragraphRuns(paragraph)).replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
    }),
  )
  const width = Math.max(0, ...rows.map((row) => row.length))
  if (!width || rows.every((row) => row.every((cell) => !cell))) return ''
  const pad = (row: string[]) => Array.from({ length: width }, (_, index) => row[index] || ' ')
  const [header, ...body] = rows.map(pad)
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

const pictureToMarkdown = async (picture: Element, context: ConversionContext) => {
  const embed = path(picture, [NS.p, 'blipFill'], [NS.a, 'blip'])?.getAttributeNS(NS.r, 'embed')
  const relationship = embed ? context.relationships.get(embed) : undefined
  if (!relationship || relationship.external) return ''
  const extension = relationship.target.split('.').pop()?.toLowerCase() ?? ''
  const mime = IMAGE_MIME[extension]
  if (!mime) {
    context.notes.unsupportedImages.add(extension || '未知')
    return ''
  }
  const file = context.zip.file(relationship.target)
  if (!file) return ''
  const key = `pptx-media/${basenameOf(relationship.target)}`
  if (!context.imageSources[key]) {
    context.imageSources[key] = `data:${mime};base64,${await file.async('base64')}`
  }
  const properties = path(picture, [NS.p, 'nvPicPr'], [NS.p, 'cNvPr'])
  const alt = (properties?.getAttribute('descr') || properties?.getAttribute('title') || '').replace(/\s+/g, ' ').trim()
  const destination = /[\s()]/.test(key) ? `<${key}>` : key
  return `![${escapeMarkdown(alt)}](${destination})`
}

const collectItems = async (container: Element, context: ConversionContext): Promise<Positioned[]> => {
  const items: Positioned[] = []
  for (const element of Array.from(container.children)) {
    if (element.namespaceURI === NS.mc && element.localName === 'AlternateContent') {
      const fallback = child(element, NS.mc, 'Fallback') ?? child(element, NS.mc, 'Choice')
      if (fallback) items.push(...(await collectItems(fallback, context)))
      continue
    }
    if (element.namespaceURI !== NS.p) continue

    switch (element.localName) {
      case 'sp': {
        const placeholder = path(element, [NS.p, 'nvSpPr'], [NS.p, 'nvPr'], [NS.p, 'ph'])
        const placeholderType = placeholder ? placeholder.getAttribute('type') ?? '' : null
        if (placeholderType && IGNORED_PLACEHOLDERS.has(placeholderType)) break
        const txBody = child(element, NS.p, 'txBody')
        if (!txBody) break
        const position = offsetOf(path(element, [NS.p, 'spPr'], [NS.a, 'xfrm']))
        if (placeholderType && TITLE_PLACEHOLDERS.has(placeholderType)) {
          const text = children(txBody, NS.a, 'p').map((paragraph) => plainText(paragraphRuns(paragraph))).filter(Boolean).join(' ')
          if (text) items.push({ item: { kind: 'title', text, type: placeholderType }, ...position })
          break
        }
        const markdown = textShapeToMarkdown(txBody, placeholderType)
        if (markdown) {
          items.push({ item: placeholderType === 'subTitle' ? { kind: 'subtitle', markdown } : { kind: 'block', markdown }, ...position })
        }
        break
      }
      case 'pic': {
        const markdown = await pictureToMarkdown(element, context)
        if (markdown) items.push({ item: { kind: 'block', markdown }, ...offsetOf(path(element, [NS.p, 'spPr'], [NS.a, 'xfrm'])) })
        break
      }
      case 'graphicFrame': {
        const data = path(element, [NS.a, 'graphic'], [NS.a, 'graphicData'])
        const uri = data?.getAttribute('uri') ?? ''
        const position = offsetOf(child(element, NS.p, 'xfrm'))
        const table = child(data, NS.a, 'tbl')
        if (table) {
          const markdown = tableToMarkdown(table)
          if (markdown) items.push({ item: { kind: 'block', markdown }, ...position })
        } else if (uri.endsWith('/chart')) {
          context.notes.charts += 1
        } else if (uri.endsWith('/diagram')) {
          context.notes.smartArt += 1
        }
        break
      }
      case 'grpSp': {
        // Group members use the group's position for ordering and keep their internal order.
        const position = offsetOf(path(element, [NS.p, 'grpSpPr'], [NS.a, 'xfrm']))
        const inner = await collectItems(element, context)
        items.push(...inner.map(({ item }) => ({ item, ...position })))
        break
      }
      default:
        break
    }
  }
  return items
}

const orderItems = (items: Positioned[]) => {
  // Placeholders often inherit their position from the layout; without full
  // coordinates, document (z-)order is the most reliable reading order.
  if (!items.every((entry) => entry.y !== undefined && entry.x !== undefined)) return items.map((entry) => entry.item)
  return items
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => left.entry.y! - right.entry.y! || left.entry.x! - right.entry.x! || left.index - right.index)
    .map(({ entry }) => entry.item)
}

const loadZip = async (data: ArrayBuffer) => {
  const { default: JSZipClass } = await import('jszip')
  try {
    return await JSZipClass.loadAsync(data)
  } catch {
    throw new Error('无法读取 PPTX 文件，请确认文件未损坏且为 .pptx 格式。')
  }
}

export const pptxToMarkdown = async (data: ArrayBuffer, fallbackTitle = '未命名演示文稿'): Promise<PptxConversion> => {
  const zip = await loadZip(data)
  const slidePaths = await slideOrder(zip)
  if (!slidePaths.length) throw new Error('未在 PPTX 中找到幻灯片。')

  const imageSources: Record<string, string> = {}
  const notes = { charts: 0, smartArt: 0, unsupportedImages: new Set<string>() }
  const sections: string[] = []
  let hiddenSlides = 0
  let slideCount = 0
  let hasTitle = false

  for (const slidePath of slidePaths) {
    const text = await readText(zip, slidePath)
    if (!text) continue
    const slide = parseXml(text, slidePath).documentElement
    if (slide.getAttribute('show') === '0') {
      hiddenSlides += 1
      continue
    }
    const tree = path(slide, [NS.p, 'cSld'], [NS.p, 'spTree'])
    if (!tree) continue
    const context: ConversionContext = { zip, relationships: await readRelationships(zip, slidePath), imageSources, notes }
    const items = orderItems(await collectItems(tree, context))
    slideCount += 1

    const title = items.find((item): item is Extract<SlideItem, { kind: 'title' }> => item.kind === 'title')
    const blocks: string[] = []
    if (!hasTitle) {
      hasTitle = true
      const isTitleSlide = title?.type === 'ctrTitle'
      blocks.push(`# ${escapeMarkdown(isTitleSlide ? title.text : fallbackTitle)}`)
      if (!isTitleSlide && title) blocks.push(`## ${escapeMarkdown(title.text)}`)
    } else {
      blocks.push('---')
      if (title) blocks.push(`## ${escapeMarkdown(title.text)}`)
    }
    for (const item of items) {
      if (item.kind !== 'title') blocks.push(item.markdown)
    }
    sections.push(blocks.join('\n\n'))
  }

  if (!slideCount) throw new Error('PPTX 中没有可见的幻灯片。')

  const messages: string[] = []
  if (hiddenSlides) messages.push(`已跳过 ${hiddenSlides} 张隐藏页`)
  if (notes.unsupportedImages.size) messages.push(`已跳过浏览器无法显示的图片（${[...notes.unsupportedImages].join('、')}）`)
  if (notes.charts) messages.push(`${notes.charts} 个图表未转换`)
  if (notes.smartArt) messages.push(`${notes.smartArt} 个 SmartArt 未转换`)

  return { markdown: `${sections.join('\n\n')}\n`, imageSources, slideCount, notes: messages }
}

const readArrayBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer))
    reader.addEventListener('error', () => reject(new Error(`无法读取文件：${file.name}`)))
    reader.addEventListener('abort', () => reject(new Error(`读取已取消：${file.name}`)))
    reader.readAsArrayBuffer(file)
  })

export const loadPptxFile = async (file: File) =>
  pptxToMarkdown(await readArrayBuffer(file), file.name.replace(/\.pptx$/i, '') || undefined)
