/// <reference types="node" />
import { Buffer } from 'node:buffer'
import { crc32, inflateSync } from 'node:zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import html2canvas from 'html2canvas-pro'
import { renderTablesAsDataUrls } from './tableImage'

vi.mock('html2canvas-pro', () => ({ default: vi.fn() }))

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
const otherPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg=='
const table = { header: ['字段', '内容'], rows: [['同一表格', '正文']] }
const canvasWith = (source: string) => ({ toDataURL: () => source }) as HTMLCanvasElement

const readPngChunks = (source: string) => {
  expect(source).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
  const bytes = Buffer.from(source.split(',')[1], 'base64')
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks: { type: string; data: Buffer; bytes: Buffer }[] = []
  let offset = 8
  while (offset < bytes.length) {
    expect(bytes.length - offset).toBeGreaterThanOrEqual(12)
    const length = bytes.readUInt32BE(offset)
    expect(offset + length + 12).toBeLessThanOrEqual(bytes.length)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    expect(bytes.readUInt32BE(offset + length + 8))
      .toBe(crc32(bytes.subarray(offset + 4, offset + length + 8)))
    chunks.push({
      type,
      data: bytes.subarray(offset + 8, offset + length + 8),
      bytes: bytes.subarray(offset, offset + length + 12),
    })
    offset += length + 12
  }
  expect(chunks[0].type).toBe('IHDR')
  expect(chunks.at(-1)?.type).toBe('IEND')
  expect(chunks.at(-1)?.data.length).toBe(0)
  return chunks
}

// Model an editor that queues unique sources, then replaces only the first
// matching image for each completed upload. Repeated sources remain local.
const uploadEachDistinctSourceOnce = (sources: string[]) => {
  const pastedSources = [...sources]
  for (const source of new Set(sources)) {
    const index = pastedSources.indexOf(source)
    pastedSources[index] = `https://images.example/uploaded-${index}.png`
  }
  return pastedSources
}

beforeEach(() => {
  vi.mocked(html2canvas).mockReset().mockResolvedValue(canvasWith(png))
})

describe('duplicate table image uploads', () => {
  it.each([2, 3])('gives %i identical table renders distinct PNG sources so all are uploaded', async (count) => {
    expect(uploadEachDistinctSourceOnce(Array.from({ length: count }, () => png))
      .filter((source) => source.startsWith('data:'))).toHaveLength(count - 1)
    const images = await renderTablesAsDataUrls(Array.from({ length: count }, () => table))
    expect(images).toHaveLength(count)
    expect(new Set(images).size).toBe(count)
    expect(uploadEachDistinctSourceOnce(images).some((source) => source.startsWith('data:'))).toBe(false)
    expect(images[0]).toBe(png)
  })

  it('leaves already distinct PNG sources byte-for-byte unchanged', async () => {
    vi.mocked(html2canvas)
      .mockResolvedValueOnce(canvasWith(png))
      .mockResolvedValueOnce(canvasWith(otherPng))
    const images = await renderTablesAsDataUrls([table, table])
    expect(images).toEqual([png, otherPng])
  })

  it('adds valid text metadata without changing the PNG chunks or decoded pixels', async () => {
    const images = await renderTablesAsDataUrls([table, table, table])
    const original = readPngChunks(png)
    const originalIdat = Buffer.concat(original.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data))
    expect([...inflateSync(originalIdat)]).toEqual([0, 255, 0, 0, 255])

    for (const source of images.slice(1)) {
      const chunks = readPngChunks(source)
      const metadata = chunks.filter((chunk) => chunk.type === 'tEXt')
      expect(metadata).toHaveLength(1)
      expect(metadata[0].data.toString('utf8')).toMatch(/^md2publish-copy-id\0.+$/)
      expect(chunks.filter((chunk) => chunk.type !== 'tEXt').map((chunk) => chunk.bytes))
        .toEqual(original.map((chunk) => chunk.bytes))
      const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data))
      expect(idat).toEqual(originalIdat)
      expect(inflateSync(idat)).toEqual(inflateSync(originalIdat))
    }
  })

  it('does not reuse duplicate image metadata across separate copy batches', async () => {
    const first = await renderTablesAsDataUrls([table, table, table])
    const second = await renderTablesAsDataUrls([table, table, table])
    const duplicates = [...first.slice(1), ...second.slice(1)]
    expect(new Set(duplicates).size).toBe(4)
    const metadata = duplicates.map((source) => readPngChunks(source)
      .find((chunk) => chunk.type === 'tEXt')?.data.toString('utf8'))
    expect(metadata.every(Boolean)).toBe(true)
    expect(new Set(metadata).size).toBe(4)
    expect(first[0]).toBe(png)
    expect(second[0]).toBe(png)
  })

  it('preserves each repeated table and its selected column widths while rendering', async () => {
    await renderTablesAsDataUrls([table, table], { 0: { 0: 180 }, 1: { 0: 240 } })
    expect(html2canvas).toHaveBeenCalledTimes(2)
    const targets = vi.mocked(html2canvas).mock.calls.map(([target]) => target)
    for (const target of targets) {
      expect(Array.from(target.querySelectorAll('th, td'), (cell) => cell.textContent))
        .toEqual(['字段', '内容', '同一表格', '正文'])
    }
    expect(targets[0].querySelector('th')?.style.minWidth).toBe('180px')
    expect(targets[1].querySelector('th')?.style.minWidth).toBe('240px')
  })
})
