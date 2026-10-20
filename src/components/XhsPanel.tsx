import { useMemo, useRef, useState, type HTMLAttributes } from 'react'
import { buildRenderNodes, type ImageSourceMap, type RenderNode } from '../lib/renderers'
import { buildXhsCaption, parseTags, replaceXhsCaptionAuthor, splitCaptionForParts, type XhsCaption } from '../lib/xhsCaption'
import {
  buildXhsZip,
  collectImageSources,
  copyImageBlob,
  createDomFits,
  downloadBlob,
  preloadImages,
  renderXhsCardBlob,
  renderXhsCardBlobs,
  safeFileName,
  xhsPartCount,
} from '../lib/xhsDom'
import {
  countChars,
  splitIntoCards,
  XHS_CAPTION_LIMIT,
  XHS_CARD_HEIGHT,
  XHS_CARD_WIDTH,
  XHS_MAX_CARDS,
  XHS_TITLE_LIMIT,
  type XhsCard,
} from '../lib/xhsLayout'
import { renderXhsCardHtml, type ImageSizeMap, type XhsCodeGutterColors, type XhsMeta } from '../lib/xhsRender'
import { isXhsThemeId, XHS_THEME_IDS, XHS_THEME_LABELS, XHS_THEMES, type XhsThemeId } from '../lib/xhsThemes'

type Props = {
  markdown: string
  imageSources: ImageSourceMap
  /** Imported file name, used as the title fallback when the document has no H1. */
  sourceName?: string
  /** Extra attributes for the panel element (e.g. tabpanel role); className replaces the default. */
  panelProps?: HTMLAttributes<HTMLElement>
}

type CodeGutterOverrides = Partial<Record<XhsThemeId, XhsCodeGutterColors>>

type Settings = {
  series: string
  author: string
  theme: XhsThemeId
  tags: string
  withCover: boolean
  codeLineNumbers: boolean
  /** Line number colors per theme, so a color picked for a dark code window does not leak into a light one. */
  codeGutter: CodeGutterOverrides
}

type Layout = {
  markdown: string
  imageSources: ImageSourceMap
  theme: XhsThemeId
  withCover: boolean
  codeLineNumbers: boolean
  nodes: RenderNode[]
  cards: XhsCard[]
  warnings: string[]
  imageSizes: ImageSizeMap
}

type Busy = 'layout' | 'export' | `card-${number}` | null

export const XHS_SETTINGS_KEY = 'md2publish.xhs.settings'
const DEFAULT_SETTINGS: Settings = {
  series: '',
  author: '',
  theme: 'paper',
  tags: '',
  withCover: true,
  codeLineNumbers: true,
  codeGutter: {},
}
const THUMB_SCALE = 0.5
/** Settings that change card heights; changing them re-paginates existing cards automatically. */
const LAYOUT_SETTINGS = ['theme', 'withCover', 'codeLineNumbers'] as const

const HEX_COLOR = /^#[0-9a-f]{6}$/i

const loadGutterOverrides = (value: unknown): CodeGutterOverrides => {
  if (!value || typeof value !== 'object') return {}
  const overrides: CodeGutterOverrides = {}
  for (const [theme, colors] of Object.entries(value as Record<string, unknown>)) {
    if (!isXhsThemeId(theme) || !colors || typeof colors !== 'object') continue
    const { fg, bg } = colors as Record<string, unknown>
    const valid: XhsCodeGutterColors = {
      ...(typeof fg === 'string' && HEX_COLOR.test(fg) ? { fg } : {}),
      ...(typeof bg === 'string' && HEX_COLOR.test(bg) ? { bg } : {}),
    }
    if (Object.keys(valid).length) overrides[theme] = valid
  }
  return overrides
}

const loadSettings = (): Settings => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(XHS_SETTINGS_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS
    const value = parsed as Record<string, unknown>
    const text = (key: keyof Settings) => (typeof value[key] === 'string' ? (value[key] as string) : '')
    const flag = (key: 'withCover' | 'codeLineNumbers') => {
      const raw = value[key]
      return typeof raw === 'boolean' ? raw : DEFAULT_SETTINGS[key]
    }
    return {
      series: text('series'),
      author: text('author'),
      tags: text('tags'),
      theme: isXhsThemeId(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
      withCover: flag('withCover'),
      codeLineNumbers: flag('codeLineNumbers'),
      codeGutter: loadGutterOverrides(value.codeGutter),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const errorMessage = (prefix: string, error: unknown, fallback: string) =>
  error instanceof Error ? `${prefix}：${error.message}` : fallback

export function XhsPanel({ markdown, imageSources, sourceName, panelProps }: Props) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [captionDraft, setCaptionDraft] = useState<XhsCaption | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const generation = useRef(0)

  const fallbackTitle = sourceName?.replace(/\.(?:md|markdown|pptx)$/i, '')
  const tags = useMemo(() => parseTags(settings.tags), [settings.tags])
  const autoCaption = useMemo(
    () => (layout ? buildXhsCaption(layout.nodes, { tags, fallbackTitle, author: settings.author }) : null),
    [fallbackTitle, layout, settings.author, tags],
  )
  const caption = captionDraft ?? autoCaption
  const hasCode = useMemo(
    () => buildRenderNodes(markdown, 'wechat', imageSources).some((node) => node.type === 'code'),
    [imageSources, markdown],
  )

  // Series, author, tags and line number colors do not affect pagination (fixed header/footer, colors only).
  const stale = Boolean(
    layout &&
      (layout.markdown !== markdown ||
        layout.imageSources !== imageSources ||
        layout.theme !== settings.theme ||
        layout.withCover !== settings.withCover ||
        layout.codeLineNumbers !== settings.codeLineNumbers),
  )
  const previewTheme = layout?.theme ?? settings.theme
  const meta: XhsMeta = {
    series: settings.series,
    author: settings.author,
    theme: previewTheme,
    codeLineNumbers: layout?.codeLineNumbers ?? settings.codeLineNumbers,
    codeGutter: settings.codeGutter[previewTheme],
  }
  const cardCount = layout?.cards.length ?? 0
  const partCount = xhsPartCount(cardCount)

  /** Paginates with explicit settings, so callers can pass values that React has not committed yet. */
  const runLayout = async (current: Settings) => {
    const id = ++generation.current
    const snapshot = {
      markdown,
      imageSources,
      theme: current.theme,
      withCover: current.withCover,
      codeLineNumbers: current.codeLineNumbers,
    }
    setBusy('layout')
    setNotice(null)
    try {
      const nodes = buildRenderNodes(markdown, 'wechat', imageSources, { keepThematicBreaks: true })
      const { sizes, failed } = await preloadImages(collectImageSources(nodes))
      if (id !== generation.current) return
      const { fits, fitsCover, dispose } = await createDomFits(
        { series: current.series, author: current.author, theme: snapshot.theme, codeLineNumbers: snapshot.codeLineNumbers },
        sizes,
      )
      try {
        // A newer layout started while this one waited; its result must win.
        if (id !== generation.current) return
        const { cards, warnings } = splitIntoCards(nodes, fits, {
          withCover: snapshot.withCover,
          fallbackTitle,
          fitsCover,
        })
        const imageWarnings = failed.length
          ? [`${failed.length} 张图片无法加载（远程图片可能不允许跨域），卡片中以占位框显示；请随 Markdown 一起导入本地图片。`]
          : []
        setLayout({ ...snapshot, nodes, cards, warnings: [...imageWarnings, ...warnings], imageSizes: sizes })
        setNotice(cards.length ? `已生成 ${cards.length} 张卡片，点击「下载全部（zip）」导出 1080×1440 图片。` : null)
      } finally {
        dispose()
      }
    } catch (error) {
      if (id === generation.current) setNotice(errorMessage('卡片生成失败', error, '卡片生成失败，请重试。'))
    } finally {
      if (id === generation.current) setBusy(null)
    }
  }

  const handleGenerate = () => runLayout(settings)

  const updateSettings = (patch: Partial<Settings>) => {
    if (patch.author !== undefined && captionDraft) {
      setCaptionDraft({
        ...captionDraft,
        body: replaceXhsCaptionAuthor(captionDraft.body, settings.author, patch.author),
      })
    }
    const next = { ...settings, ...patch }
    setSettings(next)
    try {
      window.localStorage.setItem(XHS_SETTINGS_KEY, JSON.stringify(next))
    } catch {
      // Storage can be unavailable (private mode); settings then last for the session only.
    }
    if (layout && LAYOUT_SETTINGS.some((key) => next[key] !== settings[key])) void runLayout(next)
  }

  const gutterDefaults = XHS_THEMES[settings.theme].code.gutter
  const gutterOverride = settings.codeGutter[settings.theme] ?? {}
  const updateGutter = (colors: XhsCodeGutterColors | null) => {
    const codeGutter = { ...settings.codeGutter }
    if (colors) codeGutter[settings.theme] = { ...gutterOverride, ...colors }
    else delete codeGutter[settings.theme]
    updateSettings({ codeGutter })
  }

  const handleExportZip = async () => {
    if (!layout || !caption) return
    setBusy('export')
    setNotice(null)
    setProgress([0, layout.cards.length])
    try {
      const blobs = await renderXhsCardBlobs(layout.cards, meta, layout.imageSizes, (done, total) => setProgress([done, total]))
      if (blobs.length !== layout.cards.length) {
        throw new Error(`图片数量不完整：应生成 ${layout.cards.length} 张，实际生成 ${blobs.length} 张，未下载 ZIP，请重试。`)
      }
      const zip = await buildXhsZip(blobs, splitCaptionForParts(caption, partCount))
      downloadBlob(zip, `${safeFileName(caption.title)}-小红书.zip`)
      setNotice(
        `已导出 ${blobs.length} 张 1080×1440 图片和文案${partCount > 1 ? `，按每 ${XHS_MAX_CARDS} 张分为 ${partCount} 组（part1/…part${partCount}/）` : ''}。`,
      )
    } catch (error) {
      setNotice(errorMessage('导出失败，本次未生成新的 ZIP', error, '导出失败，本次未生成新的 ZIP，请重试。'))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const handleCopyCard = async (index: number) => {
    if (!layout) return
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setNotice('当前浏览器不支持复制图片，请使用「下载」或最新版 Chrome / Edge。')
      return
    }
    setBusy(`card-${index}`)
    try {
      await copyImageBlob(await renderXhsCardBlob(layout.cards[index], index, layout.cards.length, meta, layout.imageSizes))
      setCopiedIndex(index)
      window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1600)
    } catch (error) {
      setNotice(errorMessage('图片复制失败', error, '图片复制失败，请重试。'))
    } finally {
      setBusy(null)
    }
  }

  const handleDownloadCard = async (index: number) => {
    if (!layout) return
    setBusy(`card-${index}`)
    try {
      const blob = await renderXhsCardBlob(layout.cards[index], index, layout.cards.length, meta, layout.imageSizes)
      downloadBlob(blob, `${String(index + 1).padStart(2, '0')}.png`)
    } catch (error) {
      setNotice(errorMessage('图片下载失败', error, '图片下载失败，请重试。'))
    } finally {
      setBusy(null)
    }
  }

  const handleCopyCaption = async () => {
    if (!caption) return
    try {
      await navigator.clipboard.writeText(`${caption.title}\n\n${caption.body}`)
      setNotice('已复制标题和正文文案。')
    } catch (error) {
      setNotice(errorMessage('文案复制失败', error, '文案复制失败，请手动复制。'))
    }
  }

  const titleLength = countChars(caption?.title ?? '')
  const bodyLength = countChars(caption?.body ?? '')
  const disabled = busy !== null
  // Re-paginating while images are being exported would swap the cards mid-export.
  const layoutLocked = busy !== null && busy !== 'layout'

  return (
    <article {...panelProps} className={`${panelProps?.className ?? 'panel'} xhs-panel`}>
      <div className="panel-header">
        <div>
          <h2>小红书版</h2>
          <p>标题紧随前文，按实际高度连续排版为 3:4 卡片，导出 1080×1440 PNG；单篇最多 {XHS_MAX_CARDS} 张，正文中的 --- 可手动分页。修改主题、封面或行号设置会自动重新排版。</p>
        </div>
        <div className="panel-actions">
          <button type="button" className="copy-button" disabled={disabled} onClick={() => void handleGenerate()}>
            {busy === 'layout' ? '正在排版…' : layout ? '重新生成卡片' : '生成卡片'}
          </button>
          <button
            type="button"
            className="copy-button copy-button-secondary"
            disabled={disabled || !cardCount || stale}
            onClick={() => void handleExportZip()}
          >
            {busy === 'export' && progress ? `导出中 ${progress[0]}/${progress[1]}` : '下载全部（zip）'}
          </button>
          <button
            type="button"
            className="copy-button copy-button-secondary"
            disabled={!caption}
            onClick={() => void handleCopyCaption()}
          >
            复制文案
          </button>
        </div>
      </div>

      <div className="xhs-settings">
        <label>
          系列名
          <input
            value={settings.series}
            placeholder="显示在卡片左上角"
            onChange={(event) => updateSettings({ series: event.target.value })}
          />
        </label>
        <label>
          署名
          <input
            value={settings.author}
            placeholder="例如 @你的账号"
            onChange={(event) => updateSettings({ author: event.target.value })}
          />
        </label>
        <label>
          主题
          <select
            value={settings.theme}
            disabled={layoutLocked}
            onChange={(event) => {
              if (isXhsThemeId(event.target.value)) updateSettings({ theme: event.target.value })
            }}
          >
            {XHS_THEME_IDS.map((theme) => (
              <option key={theme} value={theme}>{XHS_THEME_LABELS[theme]}</option>
            ))}
          </select>
        </label>
        <label>
          话题标签
          <input
            value={settings.tags}
            placeholder="空格或逗号分隔"
            onChange={(event) => updateSettings({ tags: event.target.value })}
          />
        </label>
        <label className="xhs-checkbox">
          <input
            type="checkbox"
            checked={settings.withCover}
            disabled={layoutLocked}
            onChange={(event) => updateSettings({ withCover: event.target.checked })}
          />
          生成封面卡
        </label>
        <div className="xhs-checkbox-field">
          <label className="xhs-checkbox">
            <input
              type="checkbox"
              checked={settings.codeLineNumbers}
              disabled={!hasCode || layoutLocked}
              aria-describedby={hasCode ? undefined : 'xhs-no-code-hint'}
              onChange={(event) => updateSettings({ codeLineNumbers: event.target.checked })}
            />
            代码显示行号
          </label>
          {hasCode ? null : <span id="xhs-no-code-hint" className="xhs-hint">当前文章没有代码块</span>}
        </div>
        <details className="xhs-code-style">
          <summary>代码样式</summary>
          <div className="xhs-code-style-body">
            <label>
              行号文字色
              <input
                type="color"
                value={gutterOverride.fg ?? gutterDefaults.fg}
                onChange={(event) => updateGutter({ fg: event.target.value })}
              />
            </label>
            <label>
              行号背景色
              <input
                type="color"
                value={gutterOverride.bg ?? gutterDefaults.bg}
                onChange={(event) => updateGutter({ bg: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="preview-button"
              disabled={!settings.codeGutter[settings.theme]}
              onClick={() => updateGutter(null)}
            >
              恢复主题默认
            </button>
            <span className="xhs-hint">按主题分别保存（当前：{XHS_THEME_LABELS[settings.theme]}），修改后预览立即更新，无需重新排版。</span>
          </div>
        </details>
      </div>

      {layout?.warnings.map((warning) => (
        <p key={warning} className="copy-limit-notice" role="alert">{warning}</p>
      ))}
      {stale && busy !== 'layout' ? <p className="copy-limit-notice">原文、配图或排版设置已修改，当前卡片为旧版本，请重新生成。</p> : null}
      {notice ? <p className="copy-notice" role="status">{notice}</p> : null}

      <div className="output-frame xhs-output">
        {!layout ? (
          <p className="xhs-empty">点击「生成卡片」查看拆分效果。修改原文后需重新生成；主题、封面和行号设置会自动重新排版。</p>
        ) : (
          <>
            <div className="xhs-grid" data-testid="xhs-cards">
              {layout.cards.map((card, index) => (
                <div key={index} className="xhs-thumb">
                  <div
                    className="xhs-thumb-frame"
                    style={{ width: XHS_CARD_WIDTH * THUMB_SCALE, height: XHS_CARD_HEIGHT * THUMB_SCALE }}
                  >
                    <div
                      className="xhs-thumb-inner"
                      style={{ transform: `scale(${THUMB_SCALE})` }}
                      dangerouslySetInnerHTML={{
                        __html: renderXhsCardHtml(card, index, layout.cards.length, meta, layout.imageSizes),
                      }}
                    />
                  </div>
                  <div className="xhs-thumb-actions">
                    <span>
                      {index + 1} / {layout.cards.length}
                      {card.cover ? ' · 封面' : ''}
                      {partCount > 1 ? ` · 第 ${Math.floor(index / XHS_MAX_CARDS) + 1} 组` : ''}
                    </span>
                    <button
                      type="button"
                      className="preview-button"
                      disabled={disabled || stale}
                      onClick={() => void handleCopyCard(index)}
                    >
                      {copiedIndex === index ? '已复制' : busy === `card-${index}` ? '生成中…' : '复制此图'}
                    </button>
                    <button
                      type="button"
                      className="preview-button"
                      disabled={disabled || stale}
                      onClick={() => void handleDownloadCard(index)}
                    >
                      下载
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {caption ? (
              <div className="xhs-caption">
                <label>
                  <span className="xhs-caption-label">
                    标题
                    <span className={titleLength > XHS_TITLE_LIMIT ? 'xhs-count xhs-over' : 'xhs-count'}>
                      {titleLength}/{XHS_TITLE_LIMIT}
                    </span>
                  </span>
                  <input
                    value={caption.title}
                    onChange={(event) => setCaptionDraft({ ...caption, title: event.target.value })}
                  />
                </label>
                <label>
                  <span className="xhs-caption-label">
                    正文
                    <span className={bodyLength > XHS_CAPTION_LIMIT ? 'xhs-count xhs-over' : 'xhs-count'}>
                      {bodyLength}/{XHS_CAPTION_LIMIT}
                    </span>
                  </span>
                  <textarea
                    rows={8}
                    value={caption.body}
                    onChange={(event) => setCaptionDraft({ ...caption, body: event.target.value })}
                  />
                </label>
                {captionDraft ? (
                  <button type="button" className="preview-button xhs-reset" onClick={() => setCaptionDraft(null)}>
                    恢复自动文案
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}
