export type ColumnWidths = Record<number, number>
export type TableColumnWidths = Record<number, ColumnWidths>

export const isIdColumn = (header: string) => header.trim().toLowerCase() === 'id'

export const getColumnWidth = (
  header: string,
  columnIndex: number,
  overrides?: ColumnWidths,
) => overrides?.[columnIndex] ?? (isIdColumn(header) ? 136 : undefined)

export const getColumnStyle = (
  header: string,
  columnIndex: number,
  overrides?: ColumnWidths,
) => {
  const width = getColumnWidth(header, columnIndex, overrides)
  return `${width === undefined ? '' : `width:${width}px;min-width:${width}px;`}${isIdColumn(header) ? 'white-space:nowrap;word-break:normal;' : ''}`
}
