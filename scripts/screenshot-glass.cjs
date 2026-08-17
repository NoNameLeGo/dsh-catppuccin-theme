// Regenerate the Catppuccin GLASS preview screenshots from the LIVE DeepSeek
// Harness web GUI (http://127.0.0.1:3080), using a FRESH session so the frame
// shows no personal data:
//
//   - the 新会话 entry opens the default fresh-session view (no workspace
//     files, no real conversation history, no other plugins' panels)
//   - the sidebar is collapsed (hides the workspace switcher / session list)
//   - the right details drawer is closed
//   - a demo message is sent to the model (a short code snippet) so the
//     preview also shows Catppuccin's syntax-highlight palette
//
// Then it picks a theme (Latte then Mocha), asserts the flavour token actually
// applied, enables the glass layer (settings → 玻璃质感 → 总开关), closes
// settings and captures the frosted view. Ends by restoring the original
// preference (glass off, follow system).
//
// This machine also runs skin-center/Aqua plugins which append inline
// --dsw-alias-*/--dsw-specific-* overrides to <body> AFTER the theme runtime
// applies the Catppuccin tokens, masking them with the DSH default palette.
// To capture a pure Catppuccin look the script strips those inline overrides
// (the registered Catppuccin tokens then resolve to their real values) and
// asserts the computed background equals the exact flavour base. The DSH
// full-viewport radial-gradient glow on the app root is cleared too (kept
// element, background removed) so the frame is a pure Catppuccin render.
//
// Requires the global @playwright/cli installation (and its cached Chromium):
//   npm i -g @playwright/cli
// Run with NODE_PATH pointing at the global playwright:
//   $env:NODE_PATH = "$env:APPDATA\npm\node_modules\@playwright\cli\node_modules"
//   node scripts/screenshot-glass.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'assets', 'previews')
fs.mkdirSync(OUT, { recursive: true })

// Expected computed body background per flavour (Catppuccin base colour).
const BASE = { latte: '#eff1f5', mocha: '#11111b' }

// The demo message sent into the fresh session (kept short so the reply
// finishes fast; the code block shows the Catppuccin syntax palette).
const DEMO = 'Write a short Python quicksort function with type hints, a docstring and comments. Keep it concise.'

function findChromiumExe() {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright')
  for (const dir of fs.readdirSync(cache)) {
    if (!dir.startsWith('chromium-')) continue
    for (const c of [path.join(cache, dir, 'chrome-win', 'chrome.exe'), path.join(cache, dir, 'chrome-win64', 'chrome.exe')])
      if (fs.existsSync(c)) return c
  }
  throw new Error('no chromium executable found in ms-playwright cache')
}

async function probeTheme(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    const b = document.body
    return {
      colorScheme: getComputedStyle(de).colorScheme,
      rootBg: getComputedStyle(de).getPropertyValue('--dsw-alias-bg-base').trim(),
      bodyBg: getComputedStyle(b).getPropertyValue('--dsw-alias-bg-base').trim(),
      bodyColor: getComputedStyle(b).backgroundColor,
      glass: {
        attr: de.hasAttribute('data-dsh-glass'),
        float: de.hasAttribute('data-dsh-glass-float'),
        compat: de.hasAttribute('data-dsh-glass-compat'),
        blur: getComputedStyle(de).getPropertyValue('--dsh-glass-blur').trim(),
        frost: getComputedStyle(de).getPropertyValue('--dsh-glass-frost').trim(),
      },
      glassPanels: document.querySelectorAll('[data-dsh-glass-frame], [data-dsh-glass-sidebar-root], [data-dsh-glass-inputbar], [data-dsh-glass-stats]').length,
    }
  })
}

const RGB_BASE = { latte: 'rgb(239, 241, 245)', mocha: 'rgb(17, 17, 27)' }

/** Normalise a CSS colour string to `rgb(r, g, b)` (handles hex and color(srgb …)). */
function normalizeColor(c) {
  const m = c.match(/[\d.]+/g)
  if (!m) return c
  const rgb = m.slice(0, 3).map((v) => Math.round(parseFloat(v) * (v.includes('.') && parseFloat(v) <= 1 ? 255 : 1)))
  return `rgb(${rgb.join(', ')})`
}

/**
 * Strip inline alias/specific overrides (keys starting with --dsw-alias /
 * --dsw-specific) that skin-center/Aqua appended to <body> after the theme
 * runtime applied the Catppuccin tokens. Removing them lets the
 * Catppuccin-registered tokens resolve to their real values. Also strips the
 * skin-center/aqua activation attributes and variables on <html>. Retries
 * until the override stays gone (the skin plugin may re-inject on events).
 */
async function decontaminateBody(page, expectedRgb) {
  let ok = false
  for (let i = 0; i < 8 && !ok; i++) {
    const r = await page.evaluate(() => {
      const b = document.body
      const de = document.documentElement
      const keys = [...b.style].filter((k) => k.startsWith('--dsw-alias') || k.startsWith('--dsw-specific'))
      for (const k of keys) b.style.removeProperty(k)
      for (const a of ['data-dsh-aqua', 'data-dsh-float', 'data-dsh-aqua-spotlight', 'data-dsh-aqua-press']) de.removeAttribute(a)
      for (const k of [...de.style]) if (k.startsWith('--dsh-aqua')) de.style.removeProperty(k)
      return {
        removed: keys.length,
        alias: getComputedStyle(b).getPropertyValue('--dsw-alias-bg-base').trim(),
        bodyColor: getComputedStyle(b).backgroundColor,
      }
    })
    ok = normalizeColor(r.bodyColor) === expectedRgb
    if (ok) {
      console.log(`decontaminated: removed=${r.removed} alias=${r.alias} body=${r.bodyColor}`)
      return
    }
    await page.waitForTimeout(400)
  }
  const t = await probeTheme(page)
  throw new Error(`could not decontaminate body to ${expectedRgb} (last=${t.bodyColor} alias=${t.bodyBg})`)
}

/**
 * Neutralise ambient backdrop layers that would tint the pure Catppuccin
 * render: the DSH full-viewport radial-gradient glow on the app root and
 * fullscreen background canvases (particle / wall art). These are environment
 * effects from the host app / other plugins. CAREFUL: the full-viewport
 * gradient lives on the app ROOT container (which holds the sidebar, chat,
 * etc.), so we clear its backgroundImage — never hide the element itself.
 */
async function clearAmbientLayers(page) {
  await page.evaluate(() => {
    const vw = innerWidth
    const vh = innerHeight
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      const bg = getComputedStyle(el).backgroundImage
      if (bg.includes('radial-gradient')) {
        if (r.width >= vw * 0.95 && r.height >= vh * 0.95) el.style.backgroundImage = 'none'
        else if (r.height >= 300) el.style.backgroundImage = 'none'
      }
    }
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect()
      if (r.width >= vw * 0.9 && r.height >= vh * 0.9) c.style.display = 'none'
    }
  })
  await page.waitForTimeout(300)
}

async function openSettings(page) {
  // The sidebar may be collapsed (hidden personal-data panels) — settings
  // lives in the sidebar, so expand it first if needed.
  await expandSidebar(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  await page.getByText('设置', { exact: true }).first().waitFor({ timeout: 90000 })
  const btn = page.getByText('设置', { exact: true }).first()
  try {
    await btn.click({ force: true, timeout: 5000 })
  } catch {
    await page.evaluate(() => {
      const span = [...document.querySelectorAll('span')].find((e) => e.textContent.trim() === '设置')
      const el = (span && span.closest('button')) || span
      if (el) el.click()
    })
  }
  await page.waitForTimeout(1500)
  const row = page.getByText('Catppuccin 主题', { exact: true }).first()
  await row.waitFor({ timeout: 15000 })
  await row.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
}

async function pickFlavor(page, label) {
  await page.getByText(label, { exact: true }).first().click()
  await page.waitForTimeout(1500)
}

async function setGlass(page, enabled) {
  const sw = page.getByRole('switch', { name: '总开关' }).first()
  await sw.waitFor({ timeout: 15000 })
  const checked = await sw.getAttribute('aria-checked')
  if ((checked === 'true') !== enabled) {
    await sw.click()
    await page.waitForTimeout(1200)
  }
  if (enabled) {
    // Raise the glass knobs so the preview actually shows the frosted look
    // (the shipped defaults are intentionally subtle: blur 2px / frost 20%).
    // The glass layer reads these two CSS variables off <html>; overriding
    // them matches exactly how the settings row writes its knobs (blur px,
    // frost = slider/50).
    await page.evaluate(() => {
      const de = document.documentElement
      de.style.setProperty('--dsh-glass-blur', '16px')
      de.style.setProperty('--dsh-glass-frost', '1.2')
    })
    await page.waitForTimeout(900)
  }
}

async function closeSettings(page) {
  for (const label of ['返回对话', '返回会话']) {
    const back = page.getByText(label, { exact: true }).first()
    if (await back.isVisible().catch(() => false)) {
      await back.click()
      await page.waitForTimeout(1500)
      return
    }
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  if (await page.getByText('Catppuccin 主题', { exact: true }).first().isVisible().catch(() => false)) {
    await page.evaluate(() => {
      const mask = document.querySelector('[class*="mask"]')
      if (mask) mask.click()
    })
  }
  await page.waitForTimeout(1500)
}

/** Collapse the sidebar (hides workspace switcher / session titles). */
async function collapseSidebar(page) {
  const collapse = page.getByRole('button', { name: '收起侧边栏' }).first()
  if (await collapse.isVisible().catch(() => false)) {
    await collapse.click()
    await page.waitForTimeout(1200)
  }
}

/** Expand the sidebar (needed to reach the settings entry). */
async function expandSidebar(page) {
  const expand = page.getByRole('button', { name: '打开侧边栏' }).first()
  if (await expand.isVisible().catch(() => false)) {
    await expand.click()
    await page.waitForTimeout(1000)
  }
}

/** Enter the fresh-session default view and hide panels with personal data. */
async function enterFreshView(page) {
  // Open a brand-new session (its own empty conversation, no workspace files).
  const nb = page.getByText('新会话', { exact: true }).first()
  if (await nb.isVisible().catch(() => false)) {
    await nb.click()
    await page.waitForTimeout(2500)
  }
  // Collapse the sidebar: hides the workspace switcher, session titles, etc.
  await collapseSidebar(page)
  // Close the right details / explorer drawer if it is open.
  for (const label of ['关闭详情', '收起面板', '关闭面板']) {
    const d = page.getByText(label, { exact: true }).first()
    if (await d.isVisible().catch(() => false)) { await d.click(); await page.waitForTimeout(800); break }
  }
}

/** Send the demo message and wait until the reply is fully streamed in. */
async function sendDemoMessage(page) {
  const ta = page.locator('textarea').first()
  await ta.waitFor({ timeout: 20000 })
  await ta.fill(DEMO)
  await page.waitForTimeout(500)
  const send = page.getByText('发送消息', { exact: true }).first()
  if (await send.isVisible().catch(() => false)) await send.click()
  else await ta.press('Enter')
  // Wait for the model reply: an assistant bubble appears and streaming ends
  // (no stop button, reply text length stabilises).
  let prevLen = -1
  let stableCount = 0
  let sawReply = false
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000)
    const st = await page.evaluate(() => {
      const text = document.body.innerText
      return {
        code: document.querySelectorAll('pre code, pre').length,
        canStop: [...document.querySelectorAll('button')].some((b) => /停止|stop/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || ''))),
        len: text.length,
      }
    })
    if (st.code >= 1 && !st.canStop && st.len === prevLen && stableCount >= 1) { sawReply = true; break }
    if (st.code >= 1 && !st.canStop) stableCount++
    if (st.len === prevLen && stableCount >= 3 && st.code >= 1) { sawReply = true; break }
    stableCount = st.len === prevLen ? stableCount + 1 : 0
    prevLen = st.len
  }
  console.log('reply present:', sawReply)
  await page.waitForTimeout(1500)
  // The fresh-session view auto-scrolls to the latest message; do NOT touch
  // the scroll position (scrolling can unmount the visible content).
}

/** Scroll the first code block into the centre of the viewport so the shot
 *  shows the Catppuccin syntax palette (does nothing when no code is found). */
async function scrollCodeIntoView(page) {
  await page.evaluate(() => {
    const code = document.querySelector('pre, [class*="md-code"], [class*="shiki"]')
    if (code) code.scrollIntoView({ block: 'center', behavior: 'instant' })
  })
  await page.waitForTimeout(1200)
}

/** Assert that real content (code block / markdown) is at the viewport centre
 *  — guards against screenshotting an empty/off-view frame. */
async function assertContentInView(page, label) {
  const hit = await page.evaluate(() => {
    const cx = innerWidth / 2
    const cy = innerHeight / 2
    const stack = document.elementsFromPoint(cx, cy)
    const text = stack.map((e) => (e.innerText || e.textContent || '')).join(' ')
    return {
      hasCode: stack.some((e) => /pre|shiki|md-code|markdown/i.test(e.className || '') || e.tagName === 'PRE'),
      hasText: text.trim().length > 20,
      sample: text.trim().slice(0, 60),
    }
  })
  console.log(`[${label}] viewport centre:`, JSON.stringify(hit))
  if (!hit.hasText) throw new Error(`viewport centre empty for ${label} — nothing to screenshot`)
  return hit
}

;(async () => {
  const browser = await chromium.launch({ executablePath: findChromiumExe(), headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
  console.log('navigating to the GUI…')
  await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4500)

  // Fresh default view, panels hidden, demo message in.
  await enterFreshView(page)
  await sendDemoMessage(page)
  const preShotState = await page.evaluate(() => ({
    codeBlocks: document.querySelectorAll('pre code, pre').length,
    bodyText: document.body.innerText.slice(0, 260),
  }))
  console.log('pre-state:', JSON.stringify(preShotState))

  // --- Latte + glass ---
  await openSettings(page)
  await pickFlavor(page, 'Latte')
  await decontaminateBody(page, RGB_BASE.latte)
  let t = await probeTheme(page)
  console.log(`Latte: colorScheme=${t.colorScheme} bodyColor=${t.bodyColor} applied=${normalizeColor(t.bodyColor) === RGB_BASE.latte}`)
  if (normalizeColor(t.bodyColor) !== RGB_BASE.latte) throw new Error(`Latte did not apply cleanly (${t.bodyColor})`)
  await setGlass(page, true)
  t = await probeTheme(page)
  console.log('glass after enable:', JSON.stringify(t.glass))
  if (!t.glass.attr) throw new Error('glass attribute missing after enabling')
  await closeSettings(page)
  await decontaminateBody(page, RGB_BASE.latte)
  await clearAmbientLayers(page)
  await collapseSidebar(page)
  await scrollCodeIntoView(page)
  await assertContentInView(page, 'latte')
  const final1 = await probeTheme(page)
  console.log('pre-shot latte:', JSON.stringify(final1))
  const p1 = path.join(OUT, 'glass-latte.png')
  await page.screenshot({ path: p1, fullPage: false })
  console.log('saved', path.relative(path.join(__dirname, '..'), p1))

  // --- Mocha + glass (same fresh conversation) ---
  await openSettings(page)
  await pickFlavor(page, 'Mocha')
  await decontaminateBody(page, RGB_BASE.mocha)
  t = await probeTheme(page)
  console.log(`Mocha: colorScheme=${t.colorScheme} bodyColor=${t.bodyColor} applied=${normalizeColor(t.bodyColor) === RGB_BASE.mocha}`)
  if (normalizeColor(t.bodyColor) !== RGB_BASE.mocha) throw new Error(`Mocha did not apply cleanly (${t.bodyColor})`)
  await setGlass(page, true) // idempotent keep-on
  await closeSettings(page)
  await decontaminateBody(page, RGB_BASE.mocha)
  await clearAmbientLayers(page)
  await collapseSidebar(page)
  await scrollCodeIntoView(page)
  await assertContentInView(page, 'mocha')
  const final2 = await probeTheme(page)
  console.log('pre-shot mocha:', JSON.stringify(final2))
  const p2 = path.join(OUT, 'glass-mocha.png')
  await page.screenshot({ path: p2, fullPage: false })
  console.log('saved', path.relative(path.join(__dirname, '..'), p2))

  // --- restore: glass off, follow system (Catppuccin row's own "跟随系统") ---
  await openSettings(page)
  await setGlass(page, false)
  await page.getByText('跟随系统', { exact: true }).last().click()
  await page.waitForTimeout(1200)
  console.log('restored: glass off + follow system')
  const restored = await probeTheme(page)
  console.log('after restore:', JSON.stringify(restored))

  await browser.close()
  console.log('DONE')
})().catch((e) => { console.error('FATAL', e); process.exit(1) })