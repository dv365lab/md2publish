import type { CSSProperties, ReactNode } from 'react'
import type { InlineContent, ListBlock } from '../lib/markdown'
import { headingAppearanceForPlatform, type Platform, type RenderNode } from '../lib/renderers'
import { getColumnWidth, isIdColumn, type TableColumnWidths } from '../lib/tableColumns'

type ArticlePreviewProps = {
  nodes: RenderNode[]
  platform: Platform
  className?: string
  style?: CSSProperties
  testId?: string
  tableColumnWidths?: TableColumnWidths
  onTableColumnWidthChange?: (tableIndex: number, columnIndex: number, width?: number) => void
}

const renderInlineContent = (content: InlineContent[]): ReactNode[] =>
  content.map((part, index) => {
    const value = part.type === 'link' ? (
      <a href={part.url}>
        {part.content ? renderInlineContent(part.content) : part.text}
      </a>
    ) : part.value
    return part.bold
      ? <strong key={index} style={{ fontWeight: 700 }}>{value}</strong>
      : <span key={index}>{value}</span>
  })

const renderList = (list: ListBlock, key: string) => {
  const Tag = list.ordered ? 'ol' : 'ul'

  return (
    <Tag key={key} className="article-list" start={list.ordered ? list.start : undefined}>
      {list.items.map((item, itemIndex) => (
        <li key={`${key}-${itemIndex}`}>
          {renderInlineContent(item.content)}
          {item.children.map((child, childIndex) =>
            renderList(child, `${key}-${itemIndex}-child-${childIndex}`),
          )}
        </li>
      ))}
    </Tag>
  )
}

export function ArticlePreview({
  nodes,
  platform,
  className,
  style,
  testId,
  tableColumnWidths,
  onTableColumnWidthChange,
}: ArticlePreviewProps) {
  let tableIndex = 0

  return (
    <div
      className={[className, `article-output-${platform}`].filter(Boolean).join(' ')}
      style={style}
      data-testid={testId}
    >
      {nodes.map((node, index) => {
        const key = `${node.type}-${index}`

        switch (node.type) {
          case 'heading':
            return (
              <div
                key={key}
                className={`article-block article-heading article-heading-${node.level}`}
                style={headingAppearanceForPlatform(platform, node.level)}
              >
                {node.level === 1 && platform === 'zsxq' ? `【${node.text}】` : node.text}
              </div>
            )
          case 'paragraph':
            return (
              <p key={key} className="article-block article-paragraph">
                {node.content ? renderInlineContent(node.content) : node.text}
              </p>
            )
          case 'list':
            return (
              <div key={key} className="article-block">
                {renderList(node, key)}
              </div>
            )
          case 'quote':
            return (
              <blockquote key={key} className="article-block article-quote">
                {node.calloutLabel ? (
                  <strong className="article-callout-label">{node.calloutLabel}</strong>
                ) : null}
                {node.lines.map((line, lineIndex) => (
                  <p key={`${key}-${lineIndex}`}>
                    {platform === 'wechat' && !node.calloutLabel ? '引用：' : ''}
                    {node.content?.[lineIndex] ? renderInlineContent(node.content[lineIndex]) : line}
                  </p>
                ))}
              </blockquote>
            )
          case 'code':
            return (
              <div key={key} className="article-block article-code">
                <div className="article-code-label">
                  {node.label}
                  {node.trailingColon ? '：' : ''}
                </div>
                <pre>{node.code}</pre>
              </div>
            )
          case 'thematicBreak':
            return (
              <div key={key} className="article-block article-divider">
                {node.marker}
              </div>
            )
          case 'image':
            return (
              <figure key={key} className="article-block article-image">
                <img
                  src={node.src}
                  alt={node.alt}
                  style={{ display: 'block', maxWidth: '100%', width: 'auto', height: 'auto', margin: '0 auto' }}
                />
                <figcaption>{node.alt}</figcaption>
              </figure>
            )
          case 'table': {
            const currentTableIndex = tableIndex++
            const widths = tableColumnWidths?.[currentTableIndex]
            const columnStyle = (columnIndex: number): CSSProperties => {
              const header = node.header[columnIndex] ?? ''
              const width = getColumnWidth(header, columnIndex, widths)

              return {
                ...(width === undefined ? {} : { width, minWidth: width }),
                ...(isIdColumn(header) ? { whiteSpace: 'nowrap', wordBreak: 'normal' } : {}),
              }
            }

            return (
              <div key={key} className="article-block">
                {onTableColumnWidthChange ? (
                  <details className="article-table-width-controls">
                    <summary>调整列宽</summary>
                    <div className="article-table-width-fields">
                      {node.header.map((header, columnIndex) => (
                        <label key={`${key}-width-${columnIndex}`}>
                          <span>{header}</span>
                          <input
                            type="number"
                            min="80"
                            max="800"
                            step="10"
                            aria-label={`${header} 列宽 (px)`}
                            placeholder="自动"
                            value={widths?.[columnIndex] ?? (isIdColumn(header) ? 136 : '')}
                            onChange={(event) => {
                              const value = Number(event.currentTarget.value)
                              onTableColumnWidthChange(
                                currentTableIndex,
                                columnIndex,
                                value > 0 ? value : undefined,
                              )
                            }}
                          />
                          <span>px</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ) : null}
                <div className="article-table-wrap">
                  <table className="article-table">
                    <thead>
                      <tr>
                        {node.header.map((cell, cellIndex) => (
                          <th key={`${key}-head-${cellIndex}`} style={columnStyle(cellIndex)}>{node.headerContent?.[cellIndex] ? renderInlineContent(node.headerContent[cellIndex]) : cell}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {node.rows.map((row, rowIndex) => (
                        <tr key={`${key}-row-${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${key}-cell-${rowIndex}-${cellIndex}`} style={columnStyle(cellIndex)}>{node.rowsContent?.[rowIndex]?.[cellIndex] ? renderInlineContent(node.rowsContent[rowIndex][cellIndex]) : cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }
          default:
            return null
        }
      })}
    </div>
  )
}
