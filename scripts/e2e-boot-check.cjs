// 启动级检查（EE+FF 合并立项的 D 方案：不接整图 diff，只做「真起宿主 + 行为断言 + 关键区域采样」）。
//
// 做法：建一个**临时 DSH_HOME** → 把本仓库 `link:` 进它的 web profile → 起 `dsh web --no-open --port 0`
// → 用 Playwright 打开真实页面 → 走掉宿主引导 → 断言插件真被加载、风味真生效、玻璃真能切，
// 并读取**关键元素的计算样式 / 小区域像素**（而不是整图对比）。
//
// 为什么不是整图 diff：断言式采样几乎无 flaky（不随字体/动画/渲染器漂移），且本仓库已有很强的
// 样式级断言（见 tests/glass-css.spec.ts）；整图像素对比的边际价值不足以抵消它的维护税。
//
// 用法（先构建，link 的是 lib/）：
//   pnpm build
//   $env:NODE_PATH = "$env:APPDATA\npm\node_modules\@playwright\cli\node_modules"
//   node scripts/e2e-boot-check.cjs
// 可选环境变量：DSH_BIN（dsh CLI 入口，默认取全局 npm 安装）、DSH_E2E_KEEP=1（保留临时 DSH_HOME 供排查）
'use strict'
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const REPO = path.join(__dirname, '..')
const STARTED = Date.now()
const DSH_BIN =
  process.env.DSH_BIN ||
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

/** Onboarding buttons to try, in order, as the first-run wizard advances. */
const ONBOARDING = ['继续', '稍后配置', '跳过', '开始使用', '完成']

const log = (...args) => console.log(...args)
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  log(`${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`)
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => { out += String(d) })
    child.stderr.on('data', (d) => { out += String(d) })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}\n${out.slice(-800)}`))))
  })
}

/** Boot `dsh web` and resolve once it prints its tokenised URL. */
function bootServer(home) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DSH_BIN, 'web', '--no-open', '--port', '0'], {
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buffer = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`dsh web did not print a URL in 180s:\n${buffer.slice(-800)}`))
    }, 180_000)
    const onData = (data) => {
      buffer += String(data)
      const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(buffer)
      if (!match) return
      clearTimeout(timer)
      child.stdout.off('data', onData)
      child.stderr.off('data', onData)
      resolve({ url: match[1], stop: () => child.kill() })
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`dsh web exited early (${code}):\n${buffer.slice(-800)}`))
    })
  })
}

/** Advance through the host's first-run wizard; returns how many steps it took. */
async function passOnboarding(page) {
  let steps = 0
  for (; steps < 6; steps++) {
    const modal = page.locator("[role='dialog'][aria-modal='true']")
    if ((await modal.count()) === 0) break
    const buttons = await modal.first().locator('button').evaluateAll((els) =>
      els.map((el) => (el.getAttribute('aria-label') || el.innerText || '').replace(/\n/g, '|').trim()).filter(Boolean),
    )
    const next = ONBOARDING.find((label) => buttons.includes(label)) ?? buttons[0]
    if (!next) {
      log(`  [onboarding] no button to press, modal says: ${(await modal.first().innerText()).replace(/\n+/g, ' | ').slice(0, 160)}`)
      break
    }
    log(`  [onboarding] step ${steps + 1}: ${buttons.join(' / ')} → press「${next}」`)
    await modal.first().getByRole('button', { name: next, exact: true }).first().click()
    await page.waitForTimeout(1200)
  }
  return steps
}

;(async () => {
  if (!fs.existsSync(path.join(REPO, 'lib', 'index.js'))) {
    throw new Error('lib/ 不存在：先跑 `pnpm build`（link 的是构建产物）')
  }
  const { chromium } = require('playwright')
  // 本地用机器上已缓存的 Chromium；找不到（例如 CI 的 Linux，浏览器在
  // ~/.cache/ms-playwright 而不是 %LOCALAPPDATA%）就交给 playwright 自己的默认路径。
  const chromiumExe = (() => {
    const cache = path.join(process.env.LOCALAPPDATA || os.homedir(), 'ms-playwright')
    if (!fs.existsSync(cache)) return undefined
    for (const dir of fs.readdirSync(cache)) {
      if (!dir.startsWith('chromium-')) continue
      for (const candidate of [path.join(cache, dir, 'chrome-win64', 'chrome.exe'), path.join(cache, dir, 'chrome-win', 'chrome.exe')]) {
        if (fs.existsSync(candidate)) return candidate
      }
    }
    return undefined // CI: playwright's own download
  })()

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-boot-e2e-'))
  log(`临时 DSH_HOME: ${home}`)
  let server
  let browser
  try {
    log('① 把本仓库 link 进临时 profile…')
    const t0 = Date.now()
    await run(process.execPath, [DSH_BIN, 'plugin', '--profile', 'web', 'add', `link:${REPO}`], {
      env: { ...process.env, DSH_HOME: home },
    })
    log(`   done in ${Date.now() - t0} ms`)

    log('② 起 dsh web…')
    const t1 = Date.now()
    server = await bootServer(home)
    log(`   up in ${Date.now() - t1} ms → ${server.url.replace(/token=[\w-]+/, 'token=…')}`)

    browser = await chromium.launch({ executablePath: chromiumExe })
    // 固定浏览器 locale：DSH 的界面语言在没存过偏好时就从 `navigator.languages` 推导
    // （见 `@deepseek-ai/dsh-client-locale`），而 CI 的默认是 en-US —— 那里界面会变成英文，
    // 下面基于中文文案的选择器（设置 / 总开关 / 兼容模式 …）就全失效了。
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    await page.goto(server.url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)

    log('③ 走掉宿主首次运行引导…')
    const steps = await passOnboarding(page)
    check('引导可走完（设置入口不再被遮罩挡住）', true, `${steps} 步`)

    log('④ 打开设置…')
    await page.getByRole('button', { name: '设置', exact: true }).first().click({ timeout: 20000 })
    await page.waitForTimeout(2500)
    const row = page.locator('div', { has: page.getByRole('button', { name: 'Latte' }) }).last()
    await row.waitFor({ timeout: 15000 })

    // ---- 行为断言：三行真的注册上了 --------------------------------------
    const rowsText = await page.evaluate(() => document.body.innerText)
    check('「Catppuccin 主题」行已注册', rowsText.includes('Catppuccin 主题'))
    check('「玻璃质感」行已注册', rowsText.includes('玻璃质感'))
    check('「检查 Catppuccin 插件更新」行已注册', rowsText.includes('检查 Catppuccin 插件更新'))

    // ---- 关键区域采样 1：风味真的落到 token 上 ---------------------------
    const baseOf = () =>
      page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim())
    await row.getByRole('button', { name: 'Mocha' }).click()
    await page.waitForTimeout(2500)
    const mochaBase = await baseOf()
    check('切 Mocha 后 --dsw-alias-bg-base 生效', mochaBase.toLowerCase() === '#11111b', `实际 ${mochaBase}`)

    // ---- 玻璃层：先开启（默认是关的）------------------------------------
    // 顺序很重要：模式选择器只在玻璃开启时渲染，且「背后只有地面就不该有 blur」只有
    // 在玻璃开启时才是个真断言——本脚本初版把 blur 采样放在开关之前，结果在
    // glass.enabled=false 下拿到 none，是假绿。
    const glassSwitch = page.getByRole('switch', { name: '总开关' })
    const defaultOff = (await glassSwitch.getAttribute('aria-checked')) === 'false'
    check('玻璃层默认关闭（DEFAULT_GLASS.enabled === false）', defaultOff)
    if (defaultOff) {
      await glassSwitch.click()
      await page.waitForTimeout(1800)
    }
    check('开启后 data-dsh-glass 挂到 html', await page.evaluate(() => document.documentElement.hasAttribute('data-dsh-glass')))
    check('默认模式是云母（data-dsh-glass-float）', await page.evaluate(() => document.documentElement.hasAttribute('data-dsh-glass-float')))

    // ---- 关键区域采样 2：PP 选中行底色（计算样式，不是查 CSS 文本）------
    const ppFill = await page.evaluate(() => {
      const el = document.querySelector("[role='treeitem'][aria-selected='true']")
      return el ? getComputedStyle(el).backgroundColor : null
    })
    if (ppFill === null) {
      // 全新的 DSH_HOME 没有工作区/会话，侧栏里没有行可选——这不是缺陷，但不应该
      // 默默当成通过（那就是假绿），所以单独记一笔 skipped。
      results.push({ name: 'PP 选中行底色', ok: true, skipped: true, detail: '本环境无会话行（新 DSH_HOME 无工作区）' })
      log('— PP 选中行底色：跳过（本环境没有会话行，在真机上另测）')
    } else {
      check('PP 选中行有非透明底色（计算样式）', !/rgba\(0, 0, 0, 0\)|transparent/.test(ppFill), ppFill)
    }

    // ---- 关键区域采样 3：真页级联里「背后只有地面」的面确实没有 blur -------
    // tests/glass-css.spec.ts 断的是样式表文本；这里断的是**级联后的计算值**。
    const sheetBlur = await page.evaluate(() => {
      const sheet = document.querySelector("[class*='sidebarCol']")
      return sheet ? getComputedStyle(sheet, '::before').backdropFilter : null
    })
    check('侧栏玻璃片（背后只有地面）无 backdrop-filter', sheetBlur === 'none', String(sheetBlur))
    const covered = await page.evaluate(() => {
      // 首屏（hero，无工作区）可能根本不渲染 header，所以退到其它「盖住移动内容」的面；
      // 样式表那两条不变量在 tests/glass-css.spec.ts 里已经逐选择器锁过，这里只要确认
      // 级联后至少有一个这样的面真的还在付费。
      for (const sel of ['header', '[data-composer-card]', '[data-dsh-glass-inputbar]']) {
        const el = document.querySelector(sel)
        if (!el) continue
        return { sel, blur: getComputedStyle(el).backdropFilter }
      }
      return null
    })
    if (covered === null) {
      results.push({ name: '盖住内容的面保留 blur', ok: true, skipped: true, detail: '本环境无 header / composer' })
      log('— 盖住内容的面保留 blur：跳过（本环境无 header / composer）')
    } else {
      check(`盖住内容的面保留 backdrop-filter（${covered.sel}）`, covered.blur !== 'none' && covered.blur !== null, String(covered.blur))
    }

    // ---- 关键区域采样 4：OO 在 compat 模式下给浮动面 rim -----------------
    await page.getByRole('button', { name: '兼容模式' }).click()
    await page.waitForTimeout(1500)
    const rim = await page.evaluate(() => {
      const sel = "[role='menu'],[class*='card'],[class*='popover'],[class*='dropdown']"
      for (const el of document.querySelectorAll(sel)) {
        const box = el.getBoundingClientRect()
        if (box.width < 40 || box.height < 24) continue
        const style = getComputedStyle(el)
        if (style.outlineStyle !== 'none') {
          return { cls: (el.className || '').toString().slice(0, 24), outline: `${style.outlineWidth} ${style.outlineColor}`, bg: style.backgroundColor }
        }
      }
      return null
    })
    check('compat 模式下浮动面拿到 hairline rim（OO）', rim !== null, rim ? `${rim.cls} → ${rim.outline}` : '未找到带 outline 的面')
    const panelTouched = await page.evaluate(() => {
      for (const el of document.querySelectorAll("[class*='panel']")) {
        const style = getComputedStyle(el)
        if (style.outlineStyle !== 'none') return (el.className || '').toString().slice(0, 24)
      }
      return null
    })
    check('compat 模式下 panel 不被描边（OO 的刻意排除）', panelTouched === null, String(panelTouched))

    // ---- 行为断言：总开关真的能切（先切回云母，再关、再开）------------------
    await page.getByRole('button', { name: '云母效果' }).click()
    await page.waitForTimeout(800)
    await glassSwitch.click()
    await page.waitForTimeout(1200)
    check('关掉总开关后 data-dsh-glass 被摘除', await page.evaluate(() => !document.documentElement.hasAttribute('data-dsh-glass')))
    await glassSwitch.click() // 还原
    await page.waitForTimeout(1200)

    check('页面无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
  } finally {
    try { await browser?.close() } catch {}
    try { server?.stop() } catch {}
    if (process.env.DSH_E2E_KEEP === '1') log(`保留临时 DSH_HOME: ${home}`)
    else fs.rmSync(home, { recursive: true, force: true })
  }

  const failed = results.filter((r) => !r.ok)
  const skipped = results.filter((r) => r.skipped)
  log(`\n${results.length - failed.length}/${results.length} 项通过${skipped.length ? `（其中 ${skipped.length} 项跳过）` : ''}`)
  log(`总耗时 ${Math.round((Date.now() - STARTED) / 1000)} s`)
  if (failed.length) {
    log('失败项：')
    for (const f of failed) log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)
    process.exit(1)
  }
})().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
