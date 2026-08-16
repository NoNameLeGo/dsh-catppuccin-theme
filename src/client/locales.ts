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
  'glass.title': '玻璃质感',
  'glass.description': '顶栏、侧边栏、输入框、统计行、轨迹视图的磨砂玻璃效果，一键开关。',
  'glass.enable': '总开关',
  'glass.on': '开启',
  'glass.off': '关闭',
  'glass.mode': '模式',
  'glass.modeMica': '云母效果',
  'glass.modeCompat': '兼容模式',
  'glass.modeHint': '云母效果把界面改成悬浮磨砂卡片；兼容模式保持原版排版，只换玻璃材质',
  'glass.blur': '玻璃模糊度',
  'glass.frost': '磨砂度',
  'glass.brightness': '背景亮度',
  'glass.brightnessHintDark': '深色模式：0 压暗至纯黑，50 原样',
  'glass.brightnessHintLight': '浅色模式：50 原样，100 提亮至纯白',
  'glass.hue': '背景色调',
  'glass.hueHint': '背景渐变与光晕的色相偏移（0–360°）',
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
  'glass.title': 'Glassmorphism',
  'glass.description': 'Frosted glass for the top bar, sidebar, composer, stats line and trajectory view — one click on/off.',
  'glass.enable': 'Master switch',
  'glass.on': 'On',
  'glass.off': 'Off',
  'glass.mode': 'Mode',
  'glass.modeMica': 'Mica',
  'glass.modeCompat': 'Compatibility',
  'glass.modeHint': 'Mica restyles the UI into floating frosted cards; Compatibility keeps the stock layout and only swaps the material to glass',
  'glass.blur': 'Glass blur',
  'glass.frost': 'Frost',
  'glass.brightness': 'Backdrop brightness',
  'glass.brightnessHintDark': 'Dark mode: 0 fades to pure black, 50 unchanged',
  'glass.brightnessHintLight': 'Light mode: 50 unchanged, 100 brightens to pure white',
  'glass.hue': 'Backdrop hue',
  'glass.hueHint': 'Hue shift for the backdrop gradient and glow (0–360°)',
}

/** Key union of the Catppuccin dictionaries. */
export type CatppuccinKey = keyof typeof zh
