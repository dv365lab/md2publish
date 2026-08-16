import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArticlePreview } from './ArticlePreview'
import { buildRenderNodes } from '../lib/renderers'

afterEach(() => {
  cleanup()
})

describe('ArticlePreview', () => {
  it('renders wechat markdown tables as actual table elements', () => {
    const nodes = buildRenderNodes(
      `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      'wechat',
    )

    render(<ArticlePreview nodes={nodes} platform="wechat" />)

    const table = screen.getByRole('table')
    expect(table).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: '使用场景' })).toBeTruthy()
    expect(within(table).getByRole('cell', { name: 'Windows + Claude Code' })).toBeTruthy()
  })

  it('renders zsxq tables as actual table elements', () => {
    const nodes = buildRenderNodes(
      `## 一、先看结论：四种环境到底有什么不同

| 使用场景 | 配置入口 | 最关键的区别 |
| --- | --- | --- |
| Windows + Claude Code | PowerShell 环境变量 | PowerShell 使用 "$env:变量名='值'" |`,
      'zsxq',
    )

    render(<ArticlePreview nodes={nodes} platform="zsxq" />)

    const table = screen.getByRole('table')
    expect(table).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: '使用场景' })).toBeTruthy()
  })

  it('renders markdown images at their natural aspect ratio', () => {
    const nodes = buildRenderNodes('![架构图](https://example.com/architecture.png)', 'wechat')

    render(<ArticlePreview nodes={nodes} platform="wechat" />)

    const image = screen.getByRole('img', { name: '架构图' })
    expect(image).toHaveAttribute('src', 'https://example.com/architecture.png')
    expect(image).toHaveStyle({ maxWidth: '100%', height: 'auto' })
  })

  it('renders every heading level with a distinct color and bold weight', () => {
    const nodes = buildRenderNodes('# 一级标题\n\n## 二级标题\n\n### 三级标题', 'zsxq')

    render(<ArticlePreview nodes={nodes} platform="zsxq" />)

    expect(screen.getByText('【一级标题】')).toHaveStyle({ color: '#1d4ed8', fontWeight: '800' })
    expect(screen.getByText('一、二级标题')).toHaveStyle({ color: '#7c3aed', fontWeight: '700' })
    expect(screen.getByText('三级标题')).toHaveStyle({ color: '#0f766e', fontWeight: '700' })
  })
})
