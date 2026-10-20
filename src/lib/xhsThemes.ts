import { CODE_THEME_GITHUB_LIGHT, CODE_THEME_MOCHA, CODE_THEME_SLATE, type CodeTheme } from './xhsCode'

export type XhsThemeId = 'paper' | 'red' | 'morandi' | 'ink'

export type QuotePalette = { bgFrom: string; bgTo: string; border: string; accent: string }

export const CALLOUT_LABELS = ['说明', '提示', '重要提示', '注意', '警告'] as const
export type CalloutLabel = (typeof CALLOUT_LABELS)[number]

export type QuoteTheme = {
  shadow: string
  /** Plain quotes; follows the theme accent. */
  base: QuotePalette
  callouts: Record<CalloutLabel, QuotePalette>
}

export type XhsThemeTokens = {
  bg: string
  fg: string
  muted: string
  accent: string
  /** Text color used on top of the accent color (pill headings, cover badges). */
  onAccent: string
  /** Table header background. */
  quoteBg: string
  border: string
  padding: { top: number; x: number; bottom: number }
  radius: number
  fontFamily: string
  monoFamily: string
  size: { h1: number; h2: number; h3: number; body: number; small: number; code: number; coverTitle: number }
  lineHeight: { heading: number; body: number; code: number }
  blockGap: number
  headingStyle: 'bar' | 'underline' | 'pill' | 'plain'
  /** Optional CSS background for a 6px decorative band at the top of every card. */
  bgDecor?: string
  code: CodeTheme
  quote: QuoteTheme
}

const FONT_FAMILY = "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
const MONO_FAMILY = "'SFMono-Regular','Cascadia Code',Consolas,monospace"

const BASE = {
  padding: { top: 36, x: 36, bottom: 24 },
  radius: 10,
  fontFamily: FONT_FAMILY,
  monoFamily: MONO_FAMILY,
  size: { h1: 30, h2: 24, h3: 20, body: 17, small: 13, code: 13, coverTitle: 40 },
  lineHeight: { heading: 1.35, body: 1.75, code: 1.6 },
  blockGap: 14,
} satisfies Partial<XhsThemeTokens>

const LIGHT_CALLOUTS: Record<CalloutLabel, QuotePalette> = {
  说明: { bgFrom: '#eff6ff', bgTo: '#f8fbff', border: '#bfdbfe', accent: '#2563eb' },
  提示: { bgFrom: '#ecfdf5', bgTo: '#f6fdf9', border: '#a7f3d0', accent: '#059669' },
  重要提示: { bgFrom: '#f5f3ff', bgTo: '#faf8ff', border: '#ddd6fe', accent: '#7c3aed' },
  注意: { bgFrom: '#fffbeb', bgTo: '#fffdf4', border: '#fde68a', accent: '#d97706' },
  警告: { bgFrom: '#fef2f2', bgTo: '#fff7f7', border: '#fecaca', accent: '#dc2626' },
}

// Translucent tints keep light text readable on the dark card.
const DARK_CALLOUTS: Record<CalloutLabel, QuotePalette> = {
  说明: { bgFrom: 'rgba(37,99,235,0.22)', bgTo: 'rgba(37,99,235,0.08)', border: 'rgba(96,165,250,0.40)', accent: '#60a5fa' },
  提示: { bgFrom: 'rgba(5,150,105,0.22)', bgTo: 'rgba(5,150,105,0.08)', border: 'rgba(52,211,153,0.40)', accent: '#34d399' },
  重要提示: { bgFrom: 'rgba(124,58,237,0.24)', bgTo: 'rgba(124,58,237,0.08)', border: 'rgba(167,139,250,0.40)', accent: '#a78bfa' },
  注意: { bgFrom: 'rgba(217,119,6,0.22)', bgTo: 'rgba(217,119,6,0.08)', border: 'rgba(251,191,36,0.40)', accent: '#fbbf24' },
  警告: { bgFrom: 'rgba(220,38,38,0.24)', bgTo: 'rgba(220,38,38,0.08)', border: 'rgba(248,113,113,0.40)', accent: '#f87171' },
}

// Only use CSS that html2canvas-pro renders reliably: no backdrop-filter, mix-blend-mode,
// complex text-shadow, -webkit-line-clamp or text-decoration-color (it drops the whole line).
export const XHS_THEMES: Record<XhsThemeId, XhsThemeTokens> = {
  paper: {
    ...BASE,
    bg: '#fffdf8',
    fg: '#1f2937',
    muted: '#9ca3af',
    accent: '#d97706',
    onAccent: '#ffffff',
    quoteBg: '#faf5ea',
    border: '#e7e0d0',
    headingStyle: 'bar',
    bgDecor: 'linear-gradient(90deg,#ff6b6b,#feca57,#48dbfb)',
    code: CODE_THEME_MOCHA,
    quote: {
      shadow: 'rgba(15,23,42,0.08)',
      base: { bgFrom: '#fff7ed', bgTo: '#fffbf5', border: '#fde6c8', accent: '#d97706' },
      callouts: LIGHT_CALLOUTS,
    },
  },
  red: {
    ...BASE,
    bg: '#fff5f5',
    fg: '#1f1f1f',
    muted: '#a1a1aa',
    accent: '#ff2442',
    onAccent: '#ffffff',
    quoteBg: '#ffecee',
    border: '#fecdd3',
    headingStyle: 'pill',
    code: CODE_THEME_MOCHA,
    quote: {
      shadow: 'rgba(255,36,66,0.08)',
      base: { bgFrom: '#fff0f2', bgTo: '#fff8f9', border: '#fecdd3', accent: '#ff2442' },
      callouts: LIGHT_CALLOUTS,
    },
  },
  morandi: {
    ...BASE,
    bg: '#f2f4f1',
    fg: '#2f3a34',
    muted: '#8a968e',
    accent: '#6b8f71',
    onAccent: '#ffffff',
    quoteBg: '#e6ebe4',
    border: '#d3dbd1',
    headingStyle: 'underline',
    code: CODE_THEME_GITHUB_LIGHT,
    quote: {
      shadow: 'rgba(47,58,52,0.08)',
      base: { bgFrom: '#eaf0e8', bgTo: '#f5f8f4', border: '#d3dbd1', accent: '#6b8f71' },
      callouts: LIGHT_CALLOUTS,
    },
  },
  ink: {
    ...BASE,
    // html2canvas antialiasing on dark backgrounds looks heavier; bump text 1px.
    size: { h1: 31, h2: 25, h3: 21, body: 18, small: 14, code: 14, coverTitle: 41 },
    bg: '#0f172a',
    fg: '#e2e8f0',
    muted: '#64748b',
    accent: '#38bdf8',
    onAccent: '#0f172a',
    quoteBg: '#1e293b',
    border: '#334155',
    headingStyle: 'bar',
    code: CODE_THEME_SLATE,
    quote: {
      shadow: 'rgba(0,0,0,0.35)',
      base: { bgFrom: '#1e293b', bgTo: '#172033', border: '#334155', accent: '#38bdf8' },
      callouts: DARK_CALLOUTS,
    },
  },
}

export const XHS_THEME_LABELS: Record<XhsThemeId, string> = {
  paper: '纸感米白',
  red: '小红书经典红',
  morandi: '莫兰迪灰绿',
  ink: '深色终端',
}

export const XHS_THEME_IDS = Object.keys(XHS_THEMES) as XhsThemeId[]

export const isXhsThemeId = (value: unknown): value is XhsThemeId =>
  typeof value === 'string' && value in XHS_THEMES
