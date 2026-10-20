import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import './App.css'
import sampleImage from './assets/hero.png?inline'
import { ArticlePreview } from './components/ArticlePreview'
import { XhsPanel } from './components/XhsPanel'
import {
  buildRenderNodes,
  type ImageSourceMap,
  type Platform,
  renderArticle,
  renderClipboardNodesText,
  renderClipboardNodesHtml,
} from './lib/renderers'
import {
  copyTableAsImage,
  extractTables,
  extractTablesFromMarkdown,
  renderTablesAsDataUrls,
} from './lib/tableImage'
import { loadSourceBundle } from './lib/markdownFiles'
import type { TableColumnWidths } from './lib/tableColumns'
import { buildZsxqCopyPlan, ZSXQ_ARTICLE_LIMIT, ZSXQ_COPY_SAFE_LIMIT } from './lib/zsxqCopy'
import { buildWechatCopyPlan, WECHAT_ARTICLE_LIMIT, WECHAT_COPY_SAFE_LIMIT } from './lib/articleCopy'

const defaultMarkdown = `# 用 Markdown 一次生成两版文章

这是第一段，用来说明这个工具会把 Markdown 转成更适合发布的普通文章格式。

## 为什么做这个工具

- 同一篇内容经常需要发到不同平台
- Markdown 里的标记符号不适合直接复制发布
- 希望保留语义，但输出更像自然文章

> 这里是一段引用内容，用来测试引用转换效果。

### 一个小示例

1. 先写 Markdown
2. 再选择平台
3. 复制生成结果

\`\`\`ts
function hello(name: string) {
  return \`hello, \${name}\`
}
\`\`\`

---

![配图说明](https://example.com/cover.png)

最后一段作为结尾，总结全文内容。`

type PreviewTab = Platform | 'xhs'

const PREVIEW_TABS: { id: PreviewTab; label: string }[] = [
  { id: 'zsxq', label: '知识星球' },
  { id: 'wechat', label: '公众号' },
  { id: 'xhs', label: '小红书' },
]

function App() {
  const [markdown, setMarkdown] = useState(defaultMarkdown)
  const [activeTab, setActiveTab] = useState<PreviewTab>('zsxq')
  const tabRefs = useRef<Partial<Record<PreviewTab, HTMLButtonElement | null>>>({})
  const [sourceName, setSourceName] = useState<string | undefined>(undefined)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [immersiveTarget, setImmersiveTarget] = useState<'zsxq' | 'wechat' | null>(null)
  const [immersiveWidths, setImmersiveWidths] = useState({ zsxq: 1100, wechat: 1100 })
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const [wechatCopyNotice, setWechatCopyNotice] = useState<string | null>(null)
  const [tableCopyState, setTableCopyState] = useState<string | null>(null)
  const [tableCopyIndex, setTableCopyIndex] = useState(0)
  const [tableColumnWidths, setTableColumnWidths] = useState<TableColumnWidths>({})
  const [imageSources, setImageSources] = useState<ImageSourceMap>({
    'https://example.com/cover.png': sampleImage,
  })
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [copyingTarget, setCopyingTarget] = useState<Platform | null>(null)
  const [zsxqCopyPartIndex, setZsxqCopyPartIndex] = useState(0)
  const [wechatCopyPartIndex, setWechatCopyPartIndex] = useState(0)

  const result = useMemo(() => {
    const zsxq = renderArticle(markdown, 'zsxq', imageSources)
    const wechat = renderArticle(markdown, 'wechat', imageSources)
    const zsxqNodes = buildRenderNodes(markdown, 'zsxq', imageSources)
    const wechatNodes = buildRenderNodes(markdown, 'wechat', imageSources)

    return { zsxq, wechat, zsxqNodes, wechatNodes }
  }, [imageSources, markdown])

  const zsxqCopyPlan = useMemo(() => buildZsxqCopyPlan(result.zsxqNodes), [result.zsxqNodes])
  const wechatCopyPlan = useMemo(() => buildWechatCopyPlan(result.wechatNodes), [result.wechatNodes])
  const copyPlans = { zsxq: zsxqCopyPlan, wechat: wechatCopyPlan }
  const copyPartIndexes = { zsxq: zsxqCopyPartIndex, wechat: wechatCopyPartIndex }

  const copyLabel = (target: Platform) => {
    if (copyingTarget === target) return target === 'zsxq' ? '正在生成…' : '正在复制…'
    const copied = copiedKey === `${target}-rich-${copyPartIndexes[target]}`
    if (copyPlans[target].parts.length > 1) {
      return `${copied ? '已复制' : '复制'}第 ${copyPartIndexes[target] + 1}/${copyPlans[target].parts.length} 篇`
    }
    return target === 'zsxq' ? copied ? '已复制文章' : '复制文章' : copied ? '已复制' : '复制'
  }

  const renderCopyOptions = (target: Platform) => {
    const plan = copyPlans[target]
    const name = target === 'zsxq' ? '知识星球' : '微信公众号'
    const limit = target === 'zsxq' ? ZSXQ_ARTICLE_LIMIT : WECHAT_ARTICLE_LIMIT
    const safeLimit = target === 'zsxq' ? ZSXQ_COPY_SAFE_LIMIT : WECHAT_COPY_SAFE_LIMIT
    return plan.error ? (
      <p className="copy-limit-notice" role="alert">{plan.error}</p>
    ) : plan.parts.length > 1 ? (
      <div className="copy-limit-notice">
        <p>
          {name}每篇正文上限为 {limit.toLocaleString('en-US')} 字符。
          当前复制内容估算 {plan.estimatedLength.toLocaleString('en-US')} 字符，
          已分为 {plan.parts.length} 篇，每篇控制在 {safeLimit.toLocaleString('en-US')} 字符以内，预留粘贴余量。
        </p>
        <p>请依次选择并复制各篇，分别粘贴到不同的新文章；追加到同一篇仍会超限。下方预览展示全文。</p>
        <label>
          选择篇章
          <select
            aria-label={`${name}复制篇章`}
            value={copyPartIndexes[target]}
            disabled={copyingTarget !== null}
            onChange={(event) => {
              if (target === 'zsxq') {
                setZsxqCopyPartIndex(Number(event.target.value))
                setCopyNotice(null)
              } else {
                setWechatCopyPartIndex(Number(event.target.value))
                setWechatCopyNotice(null)
              }
            }}
          >
            {plan.parts.map((part, index) => (
              <option key={index} value={index}>
                第 {index + 1}/{plan.parts.length} 篇（约 {part.estimatedLength.toLocaleString('en-US')} 字符）
              </option>
            ))}
          </select>
        </label>
      </div>
    ) : null
  }

  const clearCopiedStateLater = (key: string) => {
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current))
    }, 1600)
  }

  const copyPlainText = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const canUseRichClipboard = typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard.write)

  const handleCopy = async (target: Platform) => {
    const plan = copyPlans[target]
    const partIndex = copyPartIndexes[target]
    const part = plan.parts[partIndex]
    const setNotice = target === 'zsxq' ? setCopyNotice : setWechatCopyNotice
    if (plan.error || !part) {
      setNotice(plan.error ?? '无法生成分篇，请检查文章内容。')
      return
    }
    const isMultipart = plan.parts.length > 1
    const partName = `第 ${partIndex + 1}/${plan.parts.length} 篇`
    const copyKey = `${target}-rich-${partIndex}`
    const text = target === 'wechat' ? renderClipboardNodesText(part.nodes, target) : ''
    const tables = extractTables(part.nodes)
    const copyColumnWidths = Object.fromEntries(tables.flatMap((_, index) => {
      const widths = tableColumnWidths[part.startTableIndex + index]
      return widths ? [[index, widths]] : []
    }))
    const isZsxqRichCopy = target === 'zsxq'

    setCopyingTarget(target)
    if (isZsxqRichCopy) {
      setCopyNotice(tables.length > 0 ? '正在生成高清表格图片，请稍候…' : '正在复制知识星球富文本…')
    } else {
      setWechatCopyNotice(
        tables.length > 0 ? '正在把表格生成高清图片，请稍候…' : '正在复制公众号富文本…',
      )
    }

    try {
      const tableImageSources = tables.length > 0
        ? await renderTablesAsDataUrls(tables, copyColumnWidths)
        : []
      const html = renderClipboardNodesHtml(part.nodes, target, tableImageSources)
      let copiedAsPlainText = false

      if (canUseRichClipboard) {
        try {
          const clipboardPayload: Record<string, Blob> = {
            'text/html': new Blob([html], { type: 'text/html' }),
          }

          if (target === 'wechat') {
            clipboardPayload['text/plain'] = new Blob([text], { type: 'text/plain' })
          }

          await navigator.clipboard.write([new ClipboardItem(clipboardPayload)])
        } catch {
          if (target === 'zsxq') {
            setCopyNotice('富文本复制失败，请使用最新版 Chrome 或 Edge，并允许剪贴板权限。')
            return
          }

          await copyPlainText(text)
          copiedAsPlainText = true
        }
      } else {
        if (target === 'zsxq') {
          setCopyNotice('当前浏览器不支持富文本复制，请使用最新版 Chrome 或 Edge。')
          return
        }

        await copyPlainText(text)
        copiedAsPlainText = true
      }

      clearCopiedStateLater(copyKey)
      if (isMultipart) {
        const formatNotice = copiedAsPlainText
          ? '当前浏览器未能写入富文本，已复制本篇纯文本；建议使用最新版 Chrome。'
          : tableImageSources.length > 0 ? `本篇 ${tableImageSources.length} 个表格已转为高清图片。${target === 'zsxq' ? '粘贴后请等待图片上传完成再发布。' : ''}` : ''
        setNotice(`已复制${partName}，请粘贴到一篇新的${target === 'zsxq' ? '知识星球' : '微信公众号'}文章。${formatNotice}${partIndex < plan.parts.length - 1 ? '粘贴后请选择下一篇继续复制。' : '这是最后一篇，请确认前面的篇章均已复制。'}`)
        return
      }
      if (target === 'zsxq') {
        setCopyNotice(
          tableImageSources.length > 0
            ? `已复制知识星球文章，${tableImageSources.length} 个表格已自动转为高清图片。粘贴后请等待图片上传完成再发布。`
            : '已复制知识星球富文本，请直接粘贴。',
        )
        return
      }

      setWechatCopyNotice(
        copiedAsPlainText
          ? '当前浏览器未能写入富文本，已复制纯文本；建议使用最新版 Chrome。'
          : tableImageSources.length > 0
            ? `已复制公众号文章，${tableImageSources.length} 个表格已自动转为高清图片。`
            : '已复制公众号富文本，请直接粘贴。',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '请重试。'
      if (isZsxqRichCopy) {
        setCopyNotice(`表格图片生成失败：${message}`)
      } else {
        setWechatCopyNotice(`公众号内容复制失败：${message}`)
      }
    } finally {
      setCopyingTarget(null)
    }
  }

  const handleCopyTableImage = async () => {
    const tables = extractTablesFromMarkdown(markdown, 'zsxq')

    if (tables.length === 0) {
      setCopyNotice('当前内容没有表格，无需复制表格图片。')
      return
    }

    const currentIndex = tableCopyIndex % tables.length
    const table = tables[currentIndex]

    try {
      await copyTableAsImage(table, tableColumnWidths[currentIndex])
      setTableCopyState('success')
      setCopyNotice(
        tables.length > 1
          ? `已复制第 ${currentIndex + 1} 个表格（共 ${tables.length} 个），再次点击可复制下一个。`
          : '表格图片已复制，直接粘贴到知识星球即可。',
      )
      setTableCopyIndex((currentIndex + 1) % tables.length)
      window.setTimeout(() => setTableCopyState(null), 1600)
    } catch (error) {
      setTableCopyState('error')
      setCopyNotice(
        error instanceof Error ? `表格图片复制失败：${error.message}` : '表格图片复制失败，请重试。',
      )
      window.setTimeout(() => setTableCopyState(null), 1600)
    }
  }

  const tableCount = useMemo(() => extractTablesFromMarkdown(markdown, 'zsxq').length, [markdown])

  const resetTableCopyIndex = () => {
    setTableCopyIndex(0)
    setTableColumnWidths({})
    setZsxqCopyPartIndex(0)
    setWechatCopyPartIndex(0)
    setCopyNotice(null)
    setWechatCopyNotice(null)
    setCopiedKey(null)
  }

  const handleTableColumnWidthChange = (
    tableIndex: number,
    columnIndex: number,
    width?: number,
  ) => {
    setTableColumnWidths((current) => {
      const widths = { ...current[tableIndex] }
      if (width === undefined) {
        delete widths[columnIndex]
      } else {
        widths[columnIndex] = width
      }
      return { ...current, [tableIndex]: widths }
    })
  }

  const closeImmersivePreview = () => {
    setImmersiveTarget(null)
  }

  const handleImmersiveWidthChange = (target: 'zsxq' | 'wechat', width: number) => {
    setImmersiveWidths((current) => ({ ...current, [target]: width }))
  }

  const handleMarkdownFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    try {
      const bundle = await loadSourceBundle(files)
      setMarkdown(bundle.markdown)
      setImageSources(bundle.imageSources)
      setSourceName(bundle.markdownFileName)
      resetTableCopyIndex()

      if (bundle.sourceKind === 'pptx') {
        const notes = bundle.importNotes?.length ? `；${bundle.importNotes.join('，')}` : ''
        setImportNotice(
          `已从 ${bundle.markdownFileName} 转换 ${bundle.slideCount ?? 0} 页为 Markdown${bundle.resolvedImageCount > 0 ? `，并载入 ${bundle.resolvedImageCount} 张图片` : ''}${notes}。可在左侧继续编辑后再发布。`,
        )
      } else if (bundle.unresolvedImageReferences.length > 0) {
        setImportNotice(
          `已导入 ${bundle.markdownFileName}；${bundle.resolvedImageCount} 张本地图片已载入，仍缺少：${bundle.unresolvedImageReferences.join('、')}。请重新选择 Markdown 和这些图片。`,
        )
      } else {
        setImportNotice(
          `已导入 ${bundle.markdownFileName}${bundle.resolvedImageCount > 0 ? `，并载入 ${bundle.resolvedImageCount} 张本地图片` : ''}。`,
        )
      }
    } catch (error) {
      setImportNotice(error instanceof Error ? error.message : '文件导入失败，请重试。')
    }
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = PREVIEW_TABS.findIndex((tab) => tab.id === activeTab)
    const nextIndex = {
      ArrowRight: (index + 1) % PREVIEW_TABS.length,
      ArrowLeft: (index - 1 + PREVIEW_TABS.length) % PREVIEW_TABS.length,
      Home: 0,
      End: PREVIEW_TABS.length - 1,
    }[event.key]
    if (nextIndex === undefined) return
    event.preventDefault()
    const next = PREVIEW_TABS[nextIndex].id
    setActiveTab(next)
    tabRefs.current[next]?.focus()
  }

  // All panels stay mounted so tab switches keep generated cards and copy state;
  // inactive panels are hidden with CSS only.
  const tabPanelProps = (tab: PreviewTab) => ({
    role: 'tabpanel' as const,
    id: `preview-panel-${tab}`,
    'aria-labelledby': `preview-tab-${tab}`,
    className: `panel preview-tabpanel${activeTab === tab ? '' : ' is-inactive'}`,
  })

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <span className="eyebrow">md2publish</span>
          <h1>把 Markdown / PPT 转换成知识星球、公众号文章和小红书图文</h1>
          <p className="hero-copy">
            粘贴 Markdown 或导入 PPTX 后，自动生成适合直接发布的文章内容和小红书卡片。
          </p>
        </div>
      </header>

      <section className="workspace">
        <article className="panel editor-panel">
          <div className="panel-header">
            <div>
              <h2>Markdown 输入</h2>
              <p>可直接粘贴，也可选择一个 Markdown 文件（本地图片请一起选择）或一个 PPTX 演示文稿。</p>
            </div>
            <label className="import-button">
              导入 Markdown/PPTX/图片
              <input
                className="file-input"
                type="file"
                accept=".md,.markdown,.pptx,text/markdown,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*"
                multiple
                onChange={(event) => {
                  void handleMarkdownFiles(event.currentTarget.files)
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </div>
          {importNotice ? <p className="import-notice">{importNotice}</p> : null}
          <textarea
            className="editor"
            aria-label="Markdown 输入"
            value={markdown}
            onChange={(event) => {
              setMarkdown(event.target.value)
              resetTableCopyIndex()
            }}
            spellCheck={false}
          />
        </article>

        <section className="preview-area">
          <div className="preview-tabs" role="tablist" aria-label="输出平台" onKeyDown={handleTabKeyDown}>
            {PREVIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[tab.id] = element
                }}
                type="button"
                role="tab"
                id={`preview-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`preview-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={`preview-tab${activeTab === tab.id ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <article {...tabPanelProps('zsxq')}>
            <div className="panel-header">
              <div>
                <h2>知识星球版</h2>
                <p>复制全文时会自动把表格转为高清图片，避免知识星球过滤表格结构。</p>
              </div>
              <div className="panel-actions">
                <label className="immersive-width-control">
                  <span>阅读宽度 {immersiveWidths.zsxq}px</span>
                </label>
                <button
                  type="button"
                  className="preview-button"
                  onClick={() => setImmersiveTarget('zsxq')}
                >
                  整屏查看
                </button>
                <button
                  type="button"
                  className="copy-button"
                  disabled={copyingTarget !== null || Boolean(zsxqCopyPlan.error)}
                  onClick={() => handleCopy('zsxq')}
                >
                  {copyLabel('zsxq')}
                </button>
                <button
                  type="button"
                  className="copy-button copy-button-secondary"
                  onClick={handleCopyTableImage}
                >
                  {tableCopyState === 'success'
                    ? '已复制图片'
                    : tableCount > 1
                      ? `复制表格图片 (${tableCopyIndex % tableCount + 1}/${tableCount})`
                      : '复制表格图片'}
                </button>
              </div>
            </div>
            {renderCopyOptions('zsxq')}
            {copyNotice ? <p className="copy-notice" role="status">{copyNotice}</p> : null}
            <div className="output-frame">
              <ArticlePreview
                nodes={result.zsxqNodes}
                platform="zsxq"
                className="article-output"
                testId="zsxq-output"
                tableColumnWidths={tableColumnWidths}
                onTableColumnWidthChange={handleTableColumnWidthChange}
              />
            </div>
          </article>

          <article {...tabPanelProps('wechat')}>
            <div className="panel-header">
              <div>
                <h2>微信公众号版</h2>
                <p>使用公众号排版，复制时自动把表格转为高清图片。</p>
              </div>
              <div className="panel-actions">
                <label className="immersive-width-control">
                  <span>阅读宽度 {immersiveWidths.wechat}px</span>
                </label>
                <button
                  type="button"
                  className="preview-button"
                  onClick={() => setImmersiveTarget('wechat')}
                >
                  整屏查看
                </button>
                <button
                  type="button"
                  className="copy-button"
                  disabled={copyingTarget !== null || Boolean(wechatCopyPlan.error)}
                  onClick={() => handleCopy('wechat')}
                >
                  {copyLabel('wechat')}
                </button>
              </div>
            </div>
            {renderCopyOptions('wechat')}
            {wechatCopyNotice ? <p className="copy-notice" role="status">{wechatCopyNotice}</p> : null}
            <div className="output-frame">
              <ArticlePreview
                nodes={result.wechatNodes}
                platform="wechat"
                className="article-output"
                testId="wechat-output"
                tableColumnWidths={tableColumnWidths}
                onTableColumnWidthChange={handleTableColumnWidthChange}
              />
            </div>
          </article>

          <XhsPanel
            markdown={markdown}
            imageSources={imageSources}
            sourceName={sourceName}
            panelProps={tabPanelProps('xhs')}
          />
        </section>
      </section>

      {immersiveTarget ? (
        <div className="immersive-overlay" role="dialog" aria-modal="true">
          <div className="immersive-shell">
            <div className="immersive-header">
              <div>
                <h2>{immersiveTarget === 'zsxq' ? '知识星球版整屏预览' : '微信公众号版整屏预览'}</h2>
                <p>以接近整屏的阅读尺寸查看当前转换结果。</p>
              </div>
              <div className="panel-actions">
                <label className="immersive-width-control immersive-width-control-active">
                  <span>
                    阅读宽度 {immersiveTarget === 'zsxq' ? immersiveWidths.zsxq : immersiveWidths.wechat}px
                  </span>
                  <input
                    type="range"
                    min="640"
                    max="1600"
                    step="20"
                    value={immersiveWidths[immersiveTarget]}
                    onChange={(event) =>
                      handleImmersiveWidthChange(immersiveTarget, Number(event.target.value))
                    }
                  />
                </label>
                {immersiveTarget === 'zsxq' ? (
                  <>
                    <button
                      type="button"
                      className="copy-button"
                      disabled={copyingTarget !== null || Boolean(zsxqCopyPlan.error)}
                      onClick={() => handleCopy('zsxq')}
                    >
                      {copyLabel('zsxq')}
                    </button>
                    <button
                      type="button"
                      className="copy-button copy-button-secondary"
                      onClick={handleCopyTableImage}
                    >
                      {tableCopyState === 'success'
                        ? '已复制图片'
                        : tableCount > 1
                          ? `复制表格图片 (${tableCopyIndex % tableCount + 1}/${tableCount})`
                          : '复制表格图片'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="copy-button"
                    disabled={copyingTarget !== null || Boolean(wechatCopyPlan.error)}
                    onClick={() => handleCopy('wechat')}
                  >
                    {copyLabel('wechat')}
                  </button>
                )}
                <button type="button" className="preview-button" onClick={closeImmersivePreview}>
                  关闭
                </button>
              </div>
            </div>
            {renderCopyOptions(immersiveTarget)}
            {(immersiveTarget === 'zsxq' ? copyNotice : wechatCopyNotice) ? (
              <p className="copy-notice" role="status">{immersiveTarget === 'zsxq' ? copyNotice : wechatCopyNotice}</p>
            ) : null}
            <div className="immersive-body">
              <ArticlePreview
                nodes={immersiveTarget === 'zsxq' ? result.zsxqNodes : result.wechatNodes}
                platform={immersiveTarget}
                className="article-output article-output-immersive"
                testId="immersive-output"
                style={{ maxWidth: `${immersiveWidths[immersiveTarget]}px` }}
                tableColumnWidths={tableColumnWidths}
                onTableColumnWidthChange={handleTableColumnWidthChange}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
