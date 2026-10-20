import { describe, expect, it } from 'vitest'
import { buildRenderNodes } from './renderers'
import { buildXhsCaption, parseTags, replaceXhsCaptionAuthor, splitCaptionForParts } from './xhsCaption'

const nodesOf = (markdown: string) => buildRenderNodes(markdown, 'wechat')

describe('buildXhsCaption', () => {
  it('builds the title from H1 and the body from the intro and section summaries', () => {
    const caption = buildXhsCaption(
      nodesOf('# 验证入门\n\n导语内容。\n\n## 背景\n\n背景内容。\n\n## 方法\n\n方法内容。\n\n## 总结'),
      { tags: ['芯片验证', '#SoC'] },
    )
    expect(caption.title).toBe('验证入门')
    expect(caption.body).toBe('导语内容。\n\n一、背景：背景内容。\n二、方法：方法内容。\n三、总结\n\n#芯片验证 #SoC')
  })

  it('clamps the title to 20 characters', () => {
    const caption = buildXhsCaption(nodesOf(`# ${'长'.repeat(30)}`))
    expect([...caption.title]).toHaveLength(20)
    expect(caption.title.endsWith('…')).toBe(true)
  })

  it('falls back to the provided title, then the first heading', () => {
    expect(buildXhsCaption(nodesOf('## 第一页\n\n内容'), { fallbackTitle: 'deck' }).title).toBe('deck')
    expect(buildXhsCaption(nodesOf('## 第一页\n\n内容')).title).toBe('一、第一页')
    expect(buildXhsCaption([]).title).toBe('未命名笔记')
  })

  it('keeps the body within 1000 characters while preserving tags at the end', () => {
    const sections = Array.from({ length: 40 }, (_, index) => `## 小节${index}\n\n${'内容'.repeat(40)}`).join('\n\n')
    const caption = buildXhsCaption(nodesOf(sections), { tags: ['标签'] })
    expect([...caption.body].length).toBeLessThanOrEqual(1000)
    expect(caption.body.endsWith('#标签')).toBe(true)
  })

  it('adds the author before tags and leaves unsigned captions unchanged', () => {
    const nodes = nodesOf('# 验证笔记\n\n正文。')
    expect(buildXhsCaption(nodes, { author: '  @芯片验证日记  ', tags: ['CPU'] }).body)
      .toBe('正文。\n\n@芯片验证日记\n\n#CPU')
    expect(buildXhsCaption(nodes, { author: '@芯片验证日记' }).body).toBe('正文。\n\n@芯片验证日记')
    expect(buildXhsCaption(nodes, { author: '   ' }).body).toBe('正文。')
  })

  it('reserves space for the author and tags within the 1000-character limit', () => {
    const sections = Array.from({ length: 40 }, (_, index) => `## 小节${index}\n\n${'内容'.repeat(40)}`).join('\n\n')
    const caption = buildXhsCaption(nodesOf(sections), { author: '@芯片验证日记', tags: ['CPU', 'SoC'] })
    expect([...caption.body]).toHaveLength(1000)
    expect(caption.body.endsWith('\n\n@芯片验证日记\n\n#CPU #SoC')).toBe(true)
    expect(splitCaptionForParts(caption, 2).every((part) => part.body === caption.body)).toBe(true)
  })
})

describe('replaceXhsCaptionAuthor', () => {
  it('updates and clears the signature without changing edited copy or tags', () => {
    const body = '我手写的正文提到了 @旧署名。\n\n@旧署名\n\n#CPU #SoC'
    const updated = replaceXhsCaptionAuthor(body, '@旧署名', '@芯片验证日记')
    expect(updated).toBe('我手写的正文提到了 @旧署名。\n\n@芯片验证日记\n\n#CPU #SoC')
    expect(replaceXhsCaptionAuthor(updated, '@芯片验证日记', '')).toBe('我手写的正文提到了 @旧署名。\n\n#CPU #SoC')
  })

  it('adds a missing signature and does not duplicate an existing one', () => {
    expect(replaceXhsCaptionAuthor('手写正文', '', '@署名')).toBe('手写正文\n\n@署名')
    expect(replaceXhsCaptionAuthor('手写正文\n\n@署名\n\n#CPU', '', '@署名'))
      .toBe('手写正文\n\n@署名\n\n#CPU')
  })
})

describe('parseTags', () => {
  it('splits on whitespace, commas and hashes and removes duplicates', () => {
    expect(parseTags('芯片验证, SoC #SoC，数字IC')).toEqual(['芯片验证', 'SoC', '数字IC'])
  })
})

describe('splitCaptionForParts', () => {
  it('adds a part suffix within the title limit', () => {
    const parts = splitCaptionForParts({ title: '一'.repeat(20), body: '正文' }, 2)
    expect(parts.map((part) => part.title.slice(-5))).toEqual(['（1/2）', '（2/2）'])
    expect(parts.every((part) => [...part.title].length <= 20)).toBe(true)
    expect(splitCaptionForParts({ title: '短', body: '' }, 1)).toEqual([{ title: '短', body: '' }])
  })
})
