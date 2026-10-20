import { extractImageReferences } from './markdown'
import type { ImageSourceMap } from './renderers'

export type MarkdownBundle = {
  markdown: string
  markdownFileName: string
  imageSources: ImageSourceMap
  resolvedImageCount: number
  unresolvedImageReferences: string[]
  sourceKind?: 'markdown' | 'pptx'
  slideCount?: number
  importNotes?: string[]
}

const markdownExtensionPattern = /\.(?:md|markdown)$/i
const pptxExtensionPattern = /\.pptx$/i
const legacyPptExtensionPattern = /\.(?:ppt|pps|pot)$/i
const imageExtensionPattern = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i

const normalizePath = (value: string) => {
  const withoutQuery = value.split(/[?#]/, 1)[0].replace(/\\/g, '/').replace(/^\.\//, '')

  try {
    return decodeURIComponent(withoutQuery)
  } catch {
    return withoutQuery
  }
}

const basename = (value: string) => normalizePath(value).split('/').pop() ?? ''

const dirname = (value: string) => {
  const normalized = normalizePath(value)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash < 0 ? '' : normalized.slice(0, lastSlash)
}

const isExternalImage = (value: string) => /^(?:https?:|data:image\/|blob:)/i.test(value)

const readFile = (file: File, method: 'text' | 'dataUrl') =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
    reader.addEventListener('error', () => reject(new Error(`无法读取文件：${file.name}`)))
    reader.addEventListener('abort', () => reject(new Error(`读取已取消：${file.name}`)))

    if (method === 'text') {
      reader.readAsText(file)
    } else {
      reader.readAsDataURL(file)
    }
  })

const selectedPath = (file: File) => normalizePath(file.webkitRelativePath || file.name)

export const loadMarkdownBundle = async (selectedFiles: Iterable<File>): Promise<MarkdownBundle> => {
  const files = Array.from(selectedFiles)
  const markdownFiles = files.filter((file) => markdownExtensionPattern.test(file.name))

  if (markdownFiles.length === 0) {
    throw new Error('请选择一个 .md 或 .markdown 文件。')
  }

  if (markdownFiles.length > 1) {
    throw new Error('一次只能选择一个 Markdown 文件。')
  }

  const markdownFile = markdownFiles[0]
  const markdown = await readFile(markdownFile, 'text')
  const markdownDirectory = dirname(selectedPath(markdownFile))
  const imageFiles = files.filter(
    (file) => file.type.startsWith('image/') || imageExtensionPattern.test(file.name),
  )
  const imageRecords = await Promise.all(
    imageFiles.map(async (file) => {
      const fullPath = selectedPath(file)
      const relativePath =
        markdownDirectory && fullPath.startsWith(`${markdownDirectory}/`)
          ? fullPath.slice(markdownDirectory.length + 1)
          : fullPath

      return {
        fileName: file.name,
        fullPath,
        relativePath,
        dataUrl: await readFile(file, 'dataUrl'),
      }
    }),
  )

  const imageSources: Record<string, string> = {}
  for (const image of imageRecords) {
    imageSources[image.fullPath] = image.dataUrl
    imageSources[image.relativePath] = image.dataUrl
  }

  const localReferences = extractImageReferences(markdown)
    .filter((reference) => !isExternalImage(reference))
    .map(normalizePath)

  for (const reference of localReferences) {
    if (imageSources[reference]) {
      continue
    }

    const matches = imageRecords.filter((image) => image.fileName === basename(reference))
    if (matches.length === 1) {
      imageSources[reference] = matches[0].dataUrl
    }
  }

  const unresolvedImageReferences = localReferences.filter((reference) => !imageSources[reference])
  const resolvedImageCount = new Set(
    localReferences.filter((reference) => imageSources[reference]).map((reference) => imageSources[reference]),
  ).size

  return {
    markdown,
    markdownFileName: markdownFile.name,
    imageSources,
    resolvedImageCount,
    unresolvedImageReferences,
  }
}

/** Entry point for the import button: one Markdown file (plus images) or one .pptx deck. */
export const loadSourceBundle = async (selectedFiles: Iterable<File>): Promise<MarkdownBundle> => {
  const files = Array.from(selectedFiles)
  if (files.some((file) => legacyPptExtensionPattern.test(file.name))) {
    throw new Error('暂不支持旧版 .ppt 文件，请在 PowerPoint 中另存为 .pptx 后再导入。')
  }

  const decks = files.filter((file) => pptxExtensionPattern.test(file.name))
  if (decks.length === 0) {
    if (!files.some((file) => markdownExtensionPattern.test(file.name))) {
      throw new Error('请选择一个 .md、.markdown 或 .pptx 文件。')
    }
    return loadMarkdownBundle(files)
  }
  if (decks.length > 1 || files.some((file) => markdownExtensionPattern.test(file.name))) {
    throw new Error('一次只能导入一个 Markdown 或 PPTX 文件。')
  }

  const { loadPptxFile } = await import('./pptxImport')
  const deck = decks[0]
  const conversion = await loadPptxFile(deck)
  return {
    markdown: conversion.markdown,
    markdownFileName: deck.name,
    imageSources: conversion.imageSources,
    resolvedImageCount: Object.keys(conversion.imageSources).length,
    unresolvedImageReferences: [],
    sourceKind: 'pptx',
    slideCount: conversion.slideCount,
    importNotes: conversion.notes,
  }
}