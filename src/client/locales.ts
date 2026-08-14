/**
 * Catppuccin settings-row copy. The zh dictionary is the key-set source of
 * truth; the en dictionary mirrors it (checked complete against the zh keys).
 */

/** Simplified Chinese dictionary. */
export const zh = {
  'row.title': 'Catppuccin 主题',
  'row.description': 'Latte / Frappé / Macchiato / Mocha 四款配色，一键切换。',
  'row.off': '跟随系统',
  'flavor.latte': 'Latte',
  'flavor.frappe': 'Frappé',
  'flavor.macchiato': 'Macchiato',
  'flavor.mocha': 'Mocha',
} as const

/** English dictionary, checked complete against the zh key set. */
export const en: Record<keyof typeof zh, string> = {
  'row.title': 'Catppuccin theme',
  'row.description': 'Latte / Frappé / Macchiato / Mocha, one click away.',
  'row.off': 'Follow system',
  'flavor.latte': 'Latte',
  'flavor.frappe': 'Frappé',
  'flavor.macchiato': 'Macchiato',
  'flavor.mocha': 'Mocha',
}

/** Key union of the Catppuccin dictionaries. */
export type CatppuccinKey = keyof typeof zh
