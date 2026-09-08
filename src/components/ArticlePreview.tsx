import type { CSSProperties } from 'react'
import type { InlineContent, ListBlock } from '../lib/markdown'
import { headingAppearanceForPlatform, type Platform, type RenderNode } from '../lib/renderers'

type ArticlePreviewProps = {
  nodes: RenderNode[]
  platform: Platform
  className?: string
  style?: CSSProperties
  testId?: string
}

const renderInlineContent = (content: InlineContent[]) =>
  content.map((part, index) =>
    part.type === 'link' ? (
      <a key={`link-${index}`} href={part.url}>
        {part.text}
      </a>
    ) : (
      <span key={`text-${index}`}>{part.value}</span>
    ),
  )

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

export function ArticlePreview({ nodes, platform, className, style, testId }: ArticlePreviewProps) {
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
                {node.text}
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
                    {platform === 'zsxq' || node.calloutLabel ? line : `引用：${line}`}
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
          case 'table':
            return (
              <div key={key} className="article-block article-table-wrap">
                <table className="article-table">
                  <thead>
                    <tr>
                      {node.header.map((cell, cellIndex) => (
                        <th key={`${key}-head-${cellIndex}`}>{cell}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {node.rows.map((row, rowIndex) => (
                      <tr key={`${key}-row-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td key={`${key}-cell-${rowIndex}-${cellIndex}`}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
