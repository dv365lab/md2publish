import type { CSSProperties } from 'react'
import { HEADING_APPEARANCE, type Platform, type RenderNode } from '../lib/renderers'

type ArticlePreviewProps = {
  nodes: RenderNode[]
  platform: Platform
  className?: string
  style?: CSSProperties
  testId?: string
}

export function ArticlePreview({ nodes, platform, className, style, testId }: ArticlePreviewProps) {
  return (
    <div className={className} style={style} data-testid={testId}>
      {nodes.map((node, index) => {
        const key = `${node.type}-${index}`

        switch (node.type) {
          case 'heading':
            return (
              <div
                key={key}
                className={`article-block article-heading article-heading-${node.level}`}
                style={HEADING_APPEARANCE[node.level]}
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
              <ul key={key} className="article-block article-list">
                {node.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>
                    {node.ordered ? `${itemIndex + 1}. ${item}` : item}
                  </li>
                ))}
              </ul>
            )
          case 'quote':
            return (
              <blockquote key={key} className="article-block article-quote">
                {node.lines.map((line, lineIndex) => (
                  <p key={`${key}-${lineIndex}`}>{platform === 'zsxq' ? line : `引用：${line}`}</p>
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
