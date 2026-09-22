import { useMemo, useState } from 'react'
import './App.css'
import sampleImage from './assets/hero.png?inline'
import { ArticlePreview } from './components/ArticlePreview'
import {
  buildRenderNodes,
  type ImageSourceMap,
  type Platform,
  renderArticle,
  renderClipboardArticle,
  renderClipboardHtml,
} from './lib/renderers'
import {
  copyTableAsImage,
  extractTablesFromMarkdown,
  renderTablesAsDataUrls,
} from './lib/tableImage'
import { loadMarkdownBundle } from './lib/markdownFiles'
import type { TableColumnWidths } from './lib/tableColumns'

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

function App() {
  const [markdown, setMarkdown] = useState(defaultMarkdown)
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

  const result = useMemo(() => {
    const zsxq = renderArticle(markdown, 'zsxq', imageSources)
    const wechat = renderArticle(markdown, 'wechat', imageSources)
    const zsxqNodes = buildRenderNodes(markdown, 'zsxq', imageSources)
    const wechatNodes = buildRenderNodes(markdown, 'wechat', imageSources)

    return { zsxq, wechat, zsxqNodes, wechatNodes }
  }, [imageSources, markdown])

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
    const text = renderClipboardArticle(markdown, target, imageSources)
    const tables = extractTablesFromMarkdown(markdown, target)
    const isZsxqRichCopy = target === 'zsxq'

    setCopyingTarget(target)
    if (isZsxqRichCopy) {
      setCopyNotice('正在生成高清表格图片，请稍候…')
    } else {
      setWechatCopyNotice(
        tables.length > 0 ? '正在把表格生成高清图片，请稍候…' : '正在复制公众号富文本…',
      )
    }

    try {
      const tableImageSources = tables.length > 0
        ? await renderTablesAsDataUrls(tables, tableColumnWidths)
        : []
      const html = renderClipboardHtml(markdown, target, imageSources, tableImageSources)
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

      if (target === 'zsxq') {
        clearCopiedStateLater('zsxq-rich')
        setCopyNotice(
          tableImageSources.length > 0
            ? `已复制知识星球文章，${tableImageSources.length} 个表格已自动转为高清图片。`
            : '已复制知识星球富文本，请直接粘贴。',
        )
        return
      }

      clearCopiedStateLater('wechat-rich')
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
      const bundle = await loadMarkdownBundle(files)
      setMarkdown(bundle.markdown)
      setImageSources(bundle.imageSources)
      resetTableCopyIndex()

      if (bundle.unresolvedImageReferences.length > 0) {
        setImportNotice(
          `已导入 ${bundle.markdownFileName}；${bundle.resolvedImageCount} 张本地图片已载入，仍缺少：${bundle.unresolvedImageReferences.join('、')}。请重新选择 Markdown 和这些图片。`,
        )
      } else {
        setImportNotice(
          `已导入 ${bundle.markdownFileName}${bundle.resolvedImageCount > 0 ? `，并载入 ${bundle.resolvedImageCount} 张本地图片` : ''}。`,
        )
      }
    } catch (error) {
      setImportNotice(error instanceof Error ? error.message : 'Markdown 文件导入失败，请重试。')
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <span className="eyebrow">md2publish</span>
          <h1>把 Markdown 直接转换成知识星球和公众号文章</h1>
          <p className="hero-copy">
            粘贴 Markdown 后，自动生成两份更适合直接发布的普通文章内容。
          </p>
        </div>
      </header>

      <section className="workspace">
        <article className="panel editor-panel">
          <div className="panel-header">
            <div>
              <h2>Markdown 输入</h2>
              <p>可直接粘贴，也可选择一个 Markdown 文件；本地图片请与文件一起选择。</p>
            </div>
            <label className="import-button">
              导入 Markdown/图片
              <input
                className="file-input"
                type="file"
                accept=".md,.markdown,text/markdown,image/*"
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
            value={markdown}
            onChange={(event) => {
              setMarkdown(event.target.value)
              resetTableCopyIndex()
            }}
            spellCheck={false}
          />
        </article>

        <section className="preview-grid">
          <article className="panel">
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
                  disabled={copyingTarget !== null}
                  onClick={() => handleCopy('zsxq')}
                >
                  {copyingTarget === 'zsxq'
                    ? '正在生成…'
                    : copiedKey === 'zsxq-rich'
                      ? '已复制文章'
                      : '复制文章'}
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
            {copyNotice ? <p className="copy-notice">{copyNotice}</p> : null}
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

          <article className="panel">
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
                  disabled={copyingTarget !== null}
                  onClick={() => handleCopy('wechat')}
                >
                  {copyingTarget === 'wechat'
                    ? '正在复制…'
                    : copiedKey === 'wechat-rich'
                      ? '已复制'
                      : '复制'}
                </button>
              </div>
            </div>
            {wechatCopyNotice ? <p className="copy-notice">{wechatCopyNotice}</p> : null}
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
                      disabled={copyingTarget !== null}
                      onClick={() => handleCopy('zsxq')}
                    >
                      {copyingTarget === 'zsxq'
                        ? '正在生成…'
                        : copiedKey === 'zsxq-rich'
                          ? '已复制文章'
                          : '复制文章'}
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
                    disabled={copyingTarget !== null}
                    onClick={() => handleCopy('wechat')}
                  >
                    {copyingTarget === 'wechat'
                      ? '正在复制…'
                      : copiedKey === 'wechat-rich'
                        ? '已复制'
                        : '复制'}
                  </button>
                )}
                <button type="button" className="preview-button" onClick={closeImmersivePreview}>
                  关闭
                </button>
              </div>
            </div>
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
