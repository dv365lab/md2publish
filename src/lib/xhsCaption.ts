import type { RenderNode } from './renderers'
import { clampText, countChars, XHS_CAPTION_LIMIT, XHS_TITLE_LIMIT } from './xhsLayout'

export type XhsCaption = { title: string; body: string }

export const parseTags = (input: string) => [
  ...new Set(input.split(/[\s,，、#]+/u).map((tag) => tag.trim()).filter(Boolean)),
]

const flatten = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()

export const replaceXhsCaptionAuthor = (body: string, previousAuthor: string, author: string) => {
  let content = body.trimEnd()
  const tags = content.match(/(?:^|\n\n)(#[^\n]+)$/u)
  const tagLine = tags && /^#[^\s#]+(?:[ \t]+#[^\s#]+)*$/u.test(tags[1]) ? tags[1] : ''
  if (tagLine && tags) content = content.slice(0, tags.index).trimEnd()

  const previous = previousAuthor.trim()
  if (previous && (content === previous || content.endsWith(`\n\n${previous}`))) {
    content = content.slice(0, -previous.length).trimEnd()
  }
  const signature = author.trim()
  const alreadySigned = signature && (content === signature || content.endsWith(`\n\n${signature}`))
  return [content, alreadySigned ? '' : signature, tagLine].filter(Boolean).join('\n\n')
}

export const buildXhsCaption = (
  nodes: RenderNode[],
  { tags = [], fallbackTitle, author = '' }: { tags?: string[]; fallbackTitle?: string; author?: string } = {},
): XhsCaption => {
  const headings = nodes.filter((node): node is Extract<RenderNode, { type: 'heading' }> => node.type === 'heading')
  const h1 = headings.find((node) => node.level === 1)
  const firstParagraph = nodes.find(
    (node): node is Extract<RenderNode, { type: 'paragraph' }> => node.type === 'paragraph' && Boolean(node.text.trim()),
  )
  const rawTitle =
    h1?.text.trim() ||
    fallbackTitle?.trim() ||
    headings[0]?.text.trim() ||
    (firstParagraph ? flatten(firstParagraph.text) : '') ||
    '未命名笔记'

  const lines: string[] = []
  const firstH2Index = nodes.findIndex((node) => node.type === 'heading' && node.level === 2)
  const intro = nodes
    .slice(0, firstH2Index >= 0 ? firstH2Index : nodes.length)
    .find((node): node is Extract<RenderNode, { type: 'paragraph' }> => node.type === 'paragraph' && Boolean(node.text.trim()))
  if (intro) lines.push(clampText(flatten(intro.text), 120), '')

  let pendingHeading: string | null = null
  for (const node of nodes) {
    if (node.type === 'heading' && node.level === 2) {
      if (pendingHeading) lines.push(pendingHeading)
      pendingHeading = node.text
      continue
    }
    if (pendingHeading && node.type === 'paragraph' && node.text.trim()) {
      lines.push(`${pendingHeading}：${clampText(flatten(node.text), 60)}`)
      pendingHeading = null
    }
  }
  if (pendingHeading) lines.push(pendingHeading)

  const tagLine = tags.map((tag) => `#${tag.replace(/^#+/, '')}`).join(' ')
  const footer = [author.trim(), tagLine].filter(Boolean).join('\n\n')
  const reserved = footer ? countChars(footer) + 2 : 0
  let body = clampText(lines.join('\n').trim(), Math.max(0, XHS_CAPTION_LIMIT - reserved))
  if (footer) body = body ? `${body}\n\n${footer}` : footer
  body = clampText(body, XHS_CAPTION_LIMIT)

  return { title: clampText(rawTitle, XHS_TITLE_LIMIT), body }
}

/** One caption per exported part; titles get a `（n/N）` suffix while staying within the title limit. */
export const splitCaptionForParts = (caption: XhsCaption, partCount: number): XhsCaption[] => {
  if (partCount <= 1) return [caption]
  return Array.from({ length: partCount }, (_, index) => {
    const suffix = `（${index + 1}/${partCount}）`
    return {
      title: `${clampText(caption.title, XHS_TITLE_LIMIT - countChars(suffix))}${suffix}`,
      body: caption.body,
    }
  })
}
