import html2canvas from 'html2canvas'
import type { TableContent } from './markdown'
import { buildRenderNodes, renderInlineHtml, type RenderNode } from './renderers'
import { getColumnStyle, type ColumnWidths, type TableColumnWidths } from './tableColumns'

export type TablePayload = {
  header: string[]
  rows: string[][]
} & Partial<TableContent>

export const extractTables = (nodes: RenderNode[]): TablePayload[] =>
  nodes
    .filter((node): node is Extract<RenderNode, { type: 'table' }> => node.type === 'table')
    .map((node) => ({
      header: node.header,
      rows: node.rows,
      headerContent: node.headerContent,
      rowsContent: node.rowsContent,
    }))

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
              `<th style="padding:14px 16px;border:1px solid #d1d5db;background:#eef4ff;color:#0f172a;font-weight:700;text-align:left;font-size:15px;line-height:1.8;${getColumnStyle(cell, columnIndex, columnWidths)}">${table.headerContent?.[columnIndex] ? renderInlineHtml(table.headerContent[columnIndex]) : escapeHtml(cell)}</th>`,
          )
          .join('')}
      </tr>
    </thead>
    <tbody>
      ${table.rows
        .map(
          (row, rowIndex) =>
            `<tr>${row
              .map(
                (cell, columnIndex) =>
                  `<td style="padding:14px 16px;border:1px solid #d1d5db;color:#1f2937;text-align:left;font-size:15px;line-height:1.8;${getColumnStyle(table.header[columnIndex] ?? '', columnIndex, columnWidths)}">${table.rowsContent?.[rowIndex]?.[columnIndex] ? renderInlineHtml(table.rowsContent[rowIndex][columnIndex]) : escapeHtml(cell)}</td>`,
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

const distinguishRepeatedPng = (dataUrl: string) => {
  const prefix = 'data:image/png;base64,'
  const bytes = Uint8Array.from(atob(dataUrl.slice(prefix.length)), (char) => char.charCodeAt(0))
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  const iendOffset = bytes.length - 12
  if (!dataUrl.startsWith(prefix) || iendOffset < 8
    || !signature.every((byte, index) => bytes[index] === byte)
    || String.fromCharCode(...bytes.subarray(iendOffset + 4, iendOffset + 8)) !== 'IEND') {
    throw new Error('重复表格图片的 PNG 数据无效，请重新复制。')
  }

  // Zsxq's paste uploader deduplicates by src but only replaces one occurrence.
  // Give repeated tables distinct PNG metadata; retain all original pixel data
  // and the usual data:image/png;base64 header so upload validation still works.
  const text = new TextEncoder().encode(`md2publish-copy-id\0${crypto.randomUUID()}`)
  const chunk = new Uint8Array(text.length + 12)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, text.length)
  chunk.set([116, 69, 88, 116], 4) // tEXt
  chunk.set(text, 8)
  let crc = 0xffffffff
  for (const byte of chunk.subarray(4, chunk.length - 4)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0)

  const result = new Uint8Array(bytes.length + chunk.length)
  result.set(bytes.subarray(0, iendOffset))
  result.set(chunk, iendOffset)
  result.set(bytes.subarray(iendOffset), iendOffset + chunk.length)
  const encoded: string[] = []
  for (let offset = 0; offset < result.length; offset += 32768) {
    encoded.push(String.fromCharCode(...result.subarray(offset, offset + 32768)))
  }
  return prefix + btoa(encoded.join(''))
}

export const renderTablesAsDataUrls = async (tables: TablePayload[], columnWidths?: TableColumnWidths) => {
  const images: string[] = []
  const seen = new Set<string>()

  for (const [index, table] of tables.entries()) {
    const image = await renderTableAsDataUrl(table, columnWidths?.[index])
    images.push(seen.has(image) ? distinguishRepeatedPng(image) : image)
    seen.add(image)
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
