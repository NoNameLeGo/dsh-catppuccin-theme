// Regenerate the Catppuccin preview screenshots from the LIVE DeepSeek
// Harness web GUI (http://127.0.0.1:3080). For each flavour it opens
// Settings > General (the Catppuccin row), clicks the flavour, asserts the
// theme actually applied (base colour token + color-scheme), and saves a
// screenshot. Ends with a hero shot of the main view under Mocha, then
// restores the "follow system" (off) preference.
//
// Requires the global @playwright/cli installation (and its cached Chromium):
//   npm i -g @playwright/cli
// Run with NODE_PATH pointing at the global playwright:
//   $env:NODE_PATH = "$env:APPDATA\npm\node_modules\@playwright\cli\node_modules"
//   node scripts/screenshot-previews.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'assets', 'previews')
fs.mkdirSync(OUT, { recursive: true })

// Expected computed `--dsw-alias-bg-base` per flavour (alias layer resolves
// to the static step: light -> bluish-00 (base), dark -> bluish-950 (crust)).
const BASE = { latte: '#eff1f5', frappe: '#232634', macchiato: '#181926', mocha: '#11111b' }
const FLAVORS = [
  { name: 'latte', label: 'Latte' },
  { name: 'frappe', label: 'Frappé' },
  { name: 'macchiato', label: 'Macchiato' },
  { name: 'mocha', label: 'Mocha' },
]

function findChromiumExe() {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright')
  for (const dir of fs.readdirSync(cache)) {
    if (!dir.startsWith('chromium-')) continue
    for (const c of [path.join(cache, dir, 'chrome-win', 'chrome.exe'), path.join(cache, dir, 'chrome-win64', 'chrome.exe')])
      if (fs.existsSync(c)) return c
  }
  throw new Error('no chromium executable found in ms-playwright cache')
}

async function shot(page, name) {
  const p = path.join(OUT, name)
  await page.screenshot({ path: p, fullPage: false })
  console.log('saved', path.relative(path.join(__dirname, '..'), p))
}

async function probeTheme(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    const b = document.body
    const hits = []
    for (const el of [de, b, ...document.querySelectorAll('body *')]) {
      const st = el.getAttribute && el.getAttribute('style')
      if (st && st.includes('--dsw-')) {
        hits.push({ tag: el.tagName, style: st.slice(0, 160) })
        if (hits.length >= 2) break
      }
    }
    return {
      colorScheme: getComputedStyle(de).colorScheme,
      rootBg: getComputedStyle(de).getPropertyValue('--dsw-alias-bg-base').trim(),
      bodyBg: getComputedStyle(b).getPropertyValue('--dsw-alias-bg-base').trim(),
      hits,
    }
  })
}

async function openSettings(page) {
  await page.getByText('设置', { exact: true }).first().waitFor({ timeout: 90000 })
  await page.getByText('设置', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  // Settings opens on the General section by default; make sure the row is in view.
  const row = page.getByText('Catppuccin 主题', { exact: true }).first()
  await row.waitFor({ timeout: 15000 })
  await row.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
}

async function pickFlavor(page, label) {
  await page.getByText(label, { exact: true }).first().click()
  await page.waitForTimeout(1200)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: findChromiumExe(), headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
  console.log('navigating to the GUI…')
  await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded', timeout: 30000 })

  await openSettings(page)
  console.log('settings open, Catppuccin row visible')

  for (const f of FLAVORS) {
    await pickFlavor(page, f.label)
    const t = await probeTheme(page)
    const applied = t.rootBg.toLowerCase() === BASE[f.name] || t.bodyBg.toLowerCase() === BASE[f.name]
    console.log(`flavour ${f.name}: colorScheme=${t.colorScheme} rootBg=${t.rootBg} bodyBg=${t.bodyBg} applied=${applied}`)
    if (!applied) throw new Error(`flavour ${f.name} did not apply (base ${BASE[f.name]} not found)`)
    await shot(page, `${f.name}.png`)
  }

  // Hero shot: main view under Mocha. Close the settings panel (a modal
  // overlay — try the explicit button, then Escape, then the backdrop mask).
  await pickFlavor(page, 'Mocha') // ensure mocha is the active flavour
  const back = page.getByText('返回对话', { exact: true }).first()
  if (await back.isVisible().catch(() => false)) {
    await back.click()
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    if (await page.getByText('Catppuccin 主题', { exact: true }).first().isVisible().catch(() => false)) {
      await page.evaluate(() => {
        const mask = document.querySelector('[class*="_mask"]')
        if (mask) mask.click()
      })
    }
  }
  await page.waitForTimeout(1500)
  await shot(page, 'hero-mocha.png')

  // Restore the original preference (follow system / off).
  await openSettings(page)
  await pickFlavor(page, '跟随系统')
  console.log('restored: follow system')
  const restored = await probeTheme(page)
  console.log('after restore:', JSON.stringify(restored))

  await browser.close()
  console.log('DONE')
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
