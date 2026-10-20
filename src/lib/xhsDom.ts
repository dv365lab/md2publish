import html2canvas from 'html2canvas-pro'
import JSZip from 'jszip'
import type { RenderNode } from './renderers'
import type { XhsCaption } from './xhsCaption'
import {
  estimateFits,
  XHS_CARD_HEIGHT,
  XHS_CARD_WIDTH,
  XHS_EXPORT_SCALE,
  XHS_FIT_SAFETY,
  XHS_MAX_CARDS,
  type FitsFn,
  type XhsCard,
  type XhsCover,
} from './xhsLayout'
import { renderXhsCardHtml, XHS_BODY_BLEED, type ImageSizeMap, type XhsMeta } from './xhsRender'
import { XHS_THEMES } from './xhsThemes'

export const collectImageSources = (nodes: RenderNode[]) => [
  ...new Set(nodes.flatMap((node) => (node.type === 'image' && node.src ? [node.src] : []))),
]

const isInlineSource = (src: string) => /^(?:data:|blob:)/i.test(src)

const loadImageSize = (src: string, timeoutMs: number) =>
  new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image()
    // html2canvas can only draw remote images that allow CORS; probe them the same way.
    if (!isInlineSource(src)) image.crossOrigin = 'anonymous'
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    image.onload = () => {
      window.clearTimeout(timer)
      // Some SVGs report no intrinsic size; fall back to a 4:3 box instead of a placeholder.
      resolve(image.naturalWidth && image.naturalHeight
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : { width: 400, height: 300 })
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    image.src = src
  })

/** Loads every image before measuring so card heights never depend on load timing. */
export const preloadImages = async (sources: string[], timeoutMs = 15000) => {
  const entries = await Promise.all(sources.map(async (src) => [src, await loadImageSize(src, timeoutMs)] as const))
  const sizes: ImageSizeMap = Object.fromEntries(entries)
  const failed = entries.filter(([, size]) => size === null).map(([src]) => src)
  return { sizes, failed }
}

const mountHidden = (html = '') => {
  const holder = document.createElement('div')
  holder.innerHTML = html
  holder.style.position = 'fixed'
  holder.style.left = '-99999px'
  holder.style.top = '0'
  holder.style.width = `${XHS_CARD_WIDTH}px`
  holder.style.pointerEvents = 'none'
  holder.style.opacity = '0'
  holder.setAttribute('aria-hidden', 'true')
  document.body.appendChild(holder)
  return holder
}

/**
 * DOM-backed fits functions. One hidden card is reused; an estimate pre-filters obviously
 * oversized candidates so only borderline ones trigger a real layout. Call dispose() when done.
 */
export const createDomFits = async (meta: XhsMeta, imageSizes: ImageSizeMap) => {
  await document.fonts?.ready
  const holder = mountHidden()
  const coarse = estimateFits(1600, { codeLineNumbers: meta.codeLineNumbers })
  const measure = (card: XhsCard) => {
    holder.innerHTML = renderXhsCardHtml(card, 0, 1, meta, imageSizes)
    const body = holder.querySelector<HTMLElement>('.xhs-body')
    const flow = holder.querySelector<HTMLElement>('.xhs-flow')
    if (!body || !flow) return false
    // clientHeight includes the shadow bleed padding, which is not usable content height.
    return flow.getBoundingClientRect().height <= body.clientHeight - XHS_BODY_BLEED.top - XHS_FIT_SAFETY
  }
  const fits: FitsFn = (candidate) => {
    if (!candidate.length) return true
    if (!coarse(candidate)) return false
    return measure({ nodes: candidate, sectionTitle: '' })
  }
  const fitsCover = (cover: XhsCover) => measure({ nodes: [], sectionTitle: '', cover })
  return { fits, fitsCover, dispose: () => holder.remove() }
}

export const renderXhsCardBlob = async (
  card: XhsCard,
  index: number,
  total: number,
  meta: XhsMeta,
  imageSizes: ImageSizeMap,
) => {
  const holder = mountHidden(renderXhsCardHtml(card, index, total, meta, imageSizes))
  try {
    await document.fonts?.ready
    const target = holder.firstElementChild as HTMLElement | null
    if (!target) throw new Error('无法创建小红书卡片截图节点')
    const canvas = await html2canvas(target, {
      backgroundColor: XHS_THEMES[meta.theme].bg,
      scale: XHS_EXPORT_SCALE,
      useCORS: true,
      logging: false,
      width: XHS_CARD_WIDTH,
      height: XHS_CARD_HEIGHT,
    })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('小红书卡片图片生成失败')
    return blob
  } finally {
    holder.remove()
  }
}

/** Renders cards one at a time to keep memory bounded on long notes. */
export const renderXhsCardBlobs = async (
  cards: XhsCard[],
  meta: XhsMeta,
  imageSizes: ImageSizeMap,
  onProgress?: (done: number, total: number) => void,
) => {
  const blobs: Blob[] = []
  for (const [index, card] of cards.entries()) {
    blobs.push(await renderXhsCardBlob(card, index, cards.length, meta, imageSizes))
    onProgress?.(index + 1, cards.length)
  }
  return blobs
}

export const copyImageBlob = async (blob: Blob) => {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export const xhsPartCount = (cardCount: number, groupSize = XHS_MAX_CARDS) =>
  Math.max(1, Math.ceil(cardCount / groupSize))

/** Zip paths: flat `01.png…` when within one note, otherwise `partN/01.png…` per group of 18. */
export const xhsZipPaths = (cardCount: number, groupSize = XHS_MAX_CARDS) => {
  const parts = xhsPartCount(cardCount, groupSize)
  return Array.from({ length: cardCount }, (_, index) => {
    const inPart = (index % groupSize) + 1
    const name = `${String(inPart).padStart(2, '0')}.png`
    return parts > 1 ? `part${Math.floor(index / groupSize) + 1}/${name}` : name
  })
}

const captionText = (caption: XhsCaption) => `${caption.title}\n\n${caption.body}\n`

export const buildXhsZip = async (blobs: Blob[], captions: XhsCaption[], groupSize = XHS_MAX_CARDS) => {
  const zip = new JSZip()
  const paths = xhsZipPaths(blobs.length, groupSize)
  blobs.forEach((blob, index) => zip.file(paths[index], blob))
  if (captions.length > 1) {
    captions.forEach((caption, index) => zip.file(`part${index + 1}/caption.txt`, captionText(caption)))
  } else if (captions[0]) {
    zip.file('caption.txt', captionText(captions[0]))
  }
  return zip.generateAsync({ type: 'blob' })
}

export const safeFileName = (value: string, fallback = 'xhs') =>
  value.replace(/[\\/:*?"<>|\p{Cc}]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
