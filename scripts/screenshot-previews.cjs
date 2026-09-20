// Regenerate the Catppuccin preview screenshots from the LIVE DeepSeek
// Harness web GUI (http://127.0.0.1:3080). For each flavour it opens
// Settings > General (the Catppuccin row), clicks the flavour, asserts the
// theme actually applied (base colour token + color-scheme), and saves a
// screenshot. Ends with a hero shot of the main view under Mocha, then
// restores whatever flavour preference the user actually had.
//
// The web host requires a token: the bare origin answers 401 and the run then
// dies later with a confusing 90s `openSettings` timeout. Pass the token that
// `dsh web` prints (stdout), or set DSH_WEB_TOKEN:
//   node scripts/screenshot-previews.cjs <token>
//
// Requires the global @playwright/cli installation (and its cached Chromium):
//   npm i -g @playwright/cli
// Run with NODE_PATH pointing at the global playwright:
//   $env:NODE_PATH = "$env:APPDATA\npm\node_modules\@playwright\cli\node_modules"
//   node scripts/screenshot-previews.cjs <token>
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ORIGIN = process.env.DSH_WEB_ORIGIN || 'http://127.0.0.1:3080'

/** Token sources, in order: argv, env, then the legacy log file.
 *  Current `dsh web` builds print the URL to stdout only, so `%TEMP%/dsh-web.log`
 *  goes stale (2026-09-18: that file was a day old while the live server had a
 *  different token) — it is a last resort, not the source of truth. */
function resolveToken() {
  if (process.argv[2]) return process.argv[2]
  if (process.env.DSH_WEB_TOKEN) return process.env.DSH_WEB_TOKEN
  try {
    const legacy = fs.readFileSync(path.join(os.tmpdir(), 'dsh-web.log'), 'utf8')
    return /[?&]token=([A-Za-z0-9_-]+)/.exec(legacy)?.[1]
  } catch {
    return undefined
  }
}

const TOKEN = resolveToken()
const URL = TOKEN ? `${ORIGIN}/?token=${encodeURIComponent(TOKEN)}` : ORIGIN

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

/** Button label as rendered -> expected base (null = follow-system / off). */
const LABEL_BASE = { Latte: BASE.latte, Frappé: BASE.frappe, Macchiato: BASE.macchiato, Mocha: BASE.mocha, 跟随系统: null }

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

/** The Catppuccin row: the innermost element that holds the flavour buttons.
 *  Scoping matters twice — (1) the dialog has its own "跟随系统" in the
 *  appearance segmented control (a `_8HJdBW_themeCube` button earlier in the
 *  DOM), so an un-scoped `.first()` restores the wrong control and strict mode
 *  throws; (2) the row title is followed by the "?" help badge (item J), so
 *  `getByText('Catppuccin 主题', { exact: true })` matches **nothing** since
 *  then. `[data-slot='settings.general.item']` is too coarse — an outer wrapper
 *  carries that slot too and still contains the appearance row. */
function catppuccinRow(page) {
  return page.locator('div', { has: page.getByRole('button', { name: 'Latte' }) }).last()
}

async function openSettings(page) {
  // The entry is a real `<button aria-label="设置" aria-haspopup="dialog">` at the
  // bottom of the session sidebar (behind a `display: contents` slot wrapper), so
  // key the a11y role/name rather than a text node — `getByText` candidates include
  // zero-size `display: contents` wrappers. Fall back to the text route just in case
  // a future host renames the button but keeps the label.
  const trigger = page.getByRole('button', { name: '设置', exact: true })
  try {
    await trigger.first().waitFor({ timeout: 30000 })
    await trigger.first().click()
  } catch {
    const fallback = page.getByText('设置', { exact: true }).first()
    await fallback.waitFor({ timeout: 15000 })
    await fallback.click()
  }
  await page.waitForTimeout(1500)
  // Settings opens on the General section by default; make sure the row is in view.
  const row = catppuccinRow(page)
  await row.waitFor({ timeout: 15000 })
  await row.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
}

async function pickFlavor(page, label, expectedBase) {
  const button = catppuccinRow(page).getByRole('button', { name: label })
  await button.click()
  // 主动轮询直到 CSS token 生效，不依赖固定等待时间
  if (expectedBase) {
    // Two attempts: a click can be swallowed by the row re-rendering right after
    // the previous flavour's lazy registration (observed on the 3rd flavour once).
    for (let attempt = 1; attempt <= 2; attempt++) {
      const start = Date.now()
      while (Date.now() - start < 8000) {
        await page.waitForTimeout(100)
        const t = await probeTheme(page)
        if (t.rootBg.toLowerCase() === expectedBase || t.bodyBg.toLowerCase() === expectedBase) {
          return // 成功应用
        }
      }
      if (attempt === 1) await button.click()
    }
    throw new Error(`Timeout waiting for ${label} to apply (expected ${expectedBase})`)
  } else {
    await page.waitForTimeout(1200)
  }
}

;(async () => {
  const browser = await chromium.launch({ executablePath: findChromiumExe(), headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
  console.log('navigating to the GUI…')
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // A missing/stale token is by far the most common failure, and it surfaces as a
  // bare 401 text page — fail here with the actual reason instead of timing out in
  // `openSettings` 90s later.
  const bodyText = await page.evaluate(() => document.body.innerText)
  if (/authentication required/i.test(bodyText)) {
    throw new Error(
      `dsh web answered 401 (missing/stale token). Pass the token printed by \`dsh web\`: ` +
        `node scripts/screenshot-previews.cjs <token>  [origin=${ORIGIN}]`,
    )
  }

  await openSettings(page)
  console.log('settings open, Catppuccin row visible')

  // Remember the user's actual selection and restore THAT at the end. Restoring
  // "跟随系统" unconditionally would silently drop a `catppuccin-latte` choice —
  // this machine's settings.yaml has exactly that. The button's text is the
  // label plus its subtitle line, so take the first line.
  const originalLabel = (await catppuccinRow(page).locator("button[aria-pressed='true']").first().innerText())
    .split('\n')[0]
    .trim()
  console.log('original flavour preference:', originalLabel)

  for (const f of FLAVORS) {
    await pickFlavor(page, f.label, BASE[f.name])
    const t = await probeTheme(page)
    console.log(`flavour ${f.name}: colorScheme=${t.colorScheme} rootBg=${t.rootBg} bodyBg=${t.bodyBg} ✓ applied`)
    await shot(page, `${f.name}.png`)
  }

  // Hero shot: main view under Mocha. Close the settings panel (a modal
  // overlay — try the explicit button, then Escape, then the backdrop mask).
  await pickFlavor(page, 'Mocha', BASE.mocha) // ensure mocha is the active flavour
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

  // Restore the original preference, then give the debounced durable persist
  // (300ms) time to reach the settings document — closing the browser right after
  // the click leaves the live UI on the old flavour while settings.yaml keeps the
  // preview flavour (measured 2026-09-18: doc still said catppuccin-mocha).
  await openSettings(page)
  await pickFlavor(page, originalLabel, LABEL_BASE[originalLabel] ?? null)
  await page.waitForTimeout(2500)
  console.log('restored:', originalLabel)
  const restored = await probeTheme(page)
  console.log('after restore:', JSON.stringify(restored))

  await browser.close()
  console.log('DONE')
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
