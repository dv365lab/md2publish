import type { RenderNode } from './renderers'
import { buildArticleCopyPlan, type ArticleCopyPart, type ArticleCopyPlan } from './articleCopy'

export const ZSXQ_ARTICLE_LIMIT = 100000
export const ZSXQ_COPY_SAFE_LIMIT = 95000

export type ZsxqCopyPart = ArticleCopyPart
export type ZsxqCopyPlan = ArticleCopyPlan

export const buildZsxqCopyPlan = (nodes: RenderNode[]): ZsxqCopyPlan =>
  buildArticleCopyPlan(nodes, 'zsxq', ZSXQ_COPY_SAFE_LIMIT)
