/**
 * Catppuccin syntax-highlighting token overrides for Shiki.
 *
 * DSH's default shiki.css (shipped by @deepseek-ai/dsh-client-ui-theme) defines
 * its own hard-coded syntax colours that are not Catppuccin.  This module
 * supplies the canonical Catppuccin palette colours (sourced from the official
 * Shiki themes shipped by @shikijs/themes) for each of the four flavours, so
 * code blocks inside the DSH GUI match the Catppuccin project's syntax
 * highlighting.
 *
 * The foreground and background tokens are kept as var() references into the
 * plugin's own --dsw-* overrides (foreground -> label-primary, background ->
 * markdown-code-block), so they automatically track the active flavour.  Every
 * other token is a literal hex from the Catppuccin palette.
 */

import type { CatppuccinFlavorId } from './palettes.ts'

/** Shiki token names as defined by DSH's shiki.css. */
export type ShikiTokenName =
  | '--shiki-foreground'
  | '--shiki-background'
  | '--shiki-token-constant'
  | '--shiki-token-string'
  | '--shiki-token-comment'
  | '--shiki-token-keyword'
  | '--shiki-token-parameter'
  | '--shiki-token-function'
  | '--shiki-token-string-expression'
  | '--shiki-token-punctuation'
  | '--shiki-token-link'

/** Per-flavour shiki token dictionary. */
export type ShikiTokens = Record<ShikiTokenName, string>

/**
 * Canonical Catppuccin syntax colours per flavour.
 *
 * Colour → token mapping (from the official @shikijs/themes Catppuccin themes):
 *   foreground  → text
 *   constant    → peach
 *   string      → green
 *   comment     → overlay2
 *   keyword     → mauve
 *   parameter   → maroon
 *   function    → blue
 *   string-expr → green (same as string)
 *   punctuation → overlay2
 *   link        → blue (same as function)
 *
 * Background and foreground use var() references so they flow through the
 * flavour's --dsw-* overrides; the rest are literal hex.
 */

export const SHIKI_TOKENS: Record<CatppuccinFlavorId, ShikiTokens> = {
  latte: {
    '--shiki-foreground':             'var(--dsw-alias-label-primary)',
    '--shiki-background':             'var(--dsw-alias-markdown-code-block)',
    '--shiki-token-constant':         '#fe640b', // peach
    '--shiki-token-string':           '#40a02b', // green
    '--shiki-token-comment':          '#7c7f93', // overlay2
    '--shiki-token-keyword':          '#8839ef', // mauve
    '--shiki-token-parameter':        '#e64553', // maroon
    '--shiki-token-function':         '#1e66f5', // blue
    '--shiki-token-string-expression': '#40a02b', // green
    '--shiki-token-punctuation':      '#7c7f93', // overlay2
    '--shiki-token-link':             '#1e66f5', // blue
  },

  frappe: {
    '--shiki-foreground':             'var(--dsw-alias-label-primary)',
    '--shiki-background':             'var(--dsw-alias-markdown-code-block)',
    '--shiki-token-constant':         '#ef9f76', // peach
    '--shiki-token-string':           '#a6d189', // green
    '--shiki-token-comment':          '#949cbb', // overlay2
    '--shiki-token-keyword':          '#ca9ee6', // mauve
    '--shiki-token-parameter':        '#ea999c', // maroon
    '--shiki-token-function':         '#8caaee', // blue
    '--shiki-token-string-expression': '#a6d189', // green
    '--shiki-token-punctuation':      '#949cbb', // overlay2
    '--shiki-token-link':             '#8caaee', // blue
  },

  macchiato: {
    '--shiki-foreground':             'var(--dsw-alias-label-primary)',
    '--shiki-background':             'var(--dsw-alias-markdown-code-block)',
    '--shiki-token-constant':         '#f5a97f', // peach
    '--shiki-token-string':           '#a6da95', // green
    '--shiki-token-comment':          '#939ab7', // overlay2
    '--shiki-token-keyword':          '#c6a0f6', // mauve
    '--shiki-token-parameter':        '#ee99a0', // maroon
    '--shiki-token-function':         '#8aadf4', // blue
    '--shiki-token-string-expression': '#a6da95', // green
    '--shiki-token-punctuation':      '#939ab7', // overlay2
    '--shiki-token-link':             '#8aadf4', // blue
  },

  mocha: {
    '--shiki-foreground':             'var(--dsw-alias-label-primary)',
    '--shiki-background':             'var(--dsw-alias-markdown-code-block)',
    '--shiki-token-constant':         '#fab387', // peach
    '--shiki-token-string':           '#a6e3a1', // green
    '--shiki-token-comment':          '#9399b2', // overlay2
    '--shiki-token-keyword':          '#cba6f7', // mauve
    '--shiki-token-parameter':        '#eba0ac', // maroon
    '--shiki-token-function':         '#89b4fa', // blue
    '--shiki-token-string-expression': '#a6e3a1', // green
    '--shiki-token-punctuation':      '#9399b2', // overlay2
    '--shiki-token-link':             '#89b4fa', // blue
  },
}