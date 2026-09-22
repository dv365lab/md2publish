import { buildRenderNodes, type RenderNode } from './renderers'
import { getColumnStyle, type ColumnWidths, type TableColumnWidths } from './tableColumns'

export type TablePayload = {
  header: string[]
  rows: string[][]
}

export const extractTables = (nodes: RenderNode[]): TablePayload[] =>
  nodes
    .filter((node): node is Extract<RenderNode, { type: 'table' }> => node.type === 'table')
    .map((node) => ({ header: node.header, rows: node.rows }))

export const extractTablesFromMarkdown = (markdown: string, platform: 'zsxq' | 'wechat') =>
  extractTables(buildRenderNodes(markdown, platform))

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const renderTableMarkup = (table: TablePayload, columnWidths?: ColumnWidths) => `
<table style="border-collapse:collapse;width:100%;background:#ffffff;border:1px solid #d1d5db;">
    <thead>
      <tr>
        ${table.header
          .map(
            (cell, columnIndex) =>
              `<th style="padding:14px 16px;border:1px solid #d1d5db;background:#eef4ff;color:#0f172a;font-weight:700;text-align:left;font-size:15px;line-height:1.8;${getColumnStyle(cell, columnIndex, columnWidths)}">${escapeHtml(cell)}</th>`,
          )
          .join('')}
      </tr>
    </thead>
    <tbody>
      ${table.rows
        .map(
          (row) =>
            `<tr>${row
              .map(
                (cell, columnIndex) =>
                  `<td style="padding:14px 16px;border:1px solid #d1d5db;color:#1f2937;text-align:left;font-size:15px;line-height:1.8;${getColumnStyle(table.header[columnIndex] ?? '', columnIndex, columnWidths)}">${escapeHtml(cell)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')}
    </tbody>
  </table>`.trim()

export const buildTableHtml = (table: TablePayload, columnWidths?: ColumnWidths) => `
<div style="padding:0 24px;background:#ffffff;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
  ${renderTableMarkup(table, columnWidths)}
</div>`.trim()

export const buildAllTablesHtml = (tables: TablePayload[], columnWidths?: TableColumnWidths) => `
<div style="padding:24px;background:#ffffff;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
  ${tables
    .map(
      (table, index) => `
  <div style="${index > 0 ? 'margin-top:24px;' : ''}">
    ${tables.length > 1 ? `<div style="margin-bottom:8px;color:#6b7280;font-size:13px;font-weight:600;">表格 ${index + 1}</div>` : ''}
    ${renderTableMarkup(table, columnWidths?.[index])}
  </div>`,
    )
    .join('')}
</div>`.trim()

const renderTableCanvas = async (table: TablePayload, columnWidths?: ColumnWidths) => {
  const holder = document.createElement('div')
  holder.innerHTML = buildTableHtml(table, columnWidths)
  holder.style.position = 'fixed'
  holder.style.left = '-99999px'
  holder.style.top = '0'
  holder.style.width = `${Math.min(1600, Math.max(720, table.header.length * 320))}px`
  holder.style.pointerEvents = 'none'
  holder.style.opacity = '0'
  document.body.appendChild(holder)

  try {
    const target = holder.firstElementChild as HTMLElement | null
    if (!target) {
      throw new Error('无法创建表格截图节点')
    }

    const html2canvas = (await import('html2canvas')).default
    return await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    })
  } finally {
    holder.remove()
  }
}

export const renderTableAsDataUrl = async (table: TablePayload, columnWidths?: ColumnWidths) => {
  const canvas = await renderTableCanvas(table, columnWidths)
  return canvas.toDataURL('image/png')
}

export const renderTablesAsDataUrls = async (tables: TablePayload[], columnWidths?: TableColumnWidths) => {
  const images: string[] = []

  for (const [index, table] of tables.entries()) {
    images.push(await renderTableAsDataUrl(table, columnWidths?.[index]))
  }

  return images
}

export const copyTableAsImage = async (table: TablePayload, columnWidths?: ColumnWidths) => {
  const canvas = await renderTableCanvas(table, columnWidths)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) {
    throw new Error('表格图片生成失败')
  }

  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
