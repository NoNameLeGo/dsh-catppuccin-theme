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
const ONBOARDING = ['继续', '稍后配置', '进入应用', '跳过', '开始使用', '完成']

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
  // 0.1.7-rc.2 实测的变化：向导是多个包拼的多步流程（`dsh-client-ui-settings-account`
  // 的「继续 / 进入应用 / 跳过」+ `dsh-client-ui-settings-models` 的「稍后配置」），
  // **步骤切换的间隙整棵子树会短暂脱离 `role=dialog[aria-modal]`**，而且退出后那层
  // `_mask_*` 遮罩仍留在 DOM 里继续吃点击 —— 旧写法只看 dialog，第一步「继续」之后
  // 就以为做完了，后面的点击全被遮罩拦下（本机 rc.2 实测 30s 超时）。
  // 所以：dialog 优先，找不到就按标签在全页找（首次运行的首屏没有别的东西可点），
  // 而且必须确认遮罩消失才算走完。
  let steps = 0
  for (; steps < 8; steps++) {
    await page.waitForTimeout(900)
    const modal = page.locator("[role='dialog'][aria-modal='true']").last()
    let target = null
    if ((await modal.count()) > 0) {
      const buttons = await modal.locator('button').evaluateAll((els) =>
        els.map((el) => (el.getAttribute('aria-label') || el.innerText || '').replace(/\n/g, '|').trim()).filter(Boolean),
      )
      const next = ONBOARDING.find((label) => buttons.includes(label)) ?? buttons[0]
      if (next) {
        log(`  [onboarding] step ${steps + 1} (dialog): ${buttons.join(' / ')} → press「${next}」`)
        target = modal.getByRole('button', { name: next, exact: true }).first()
      }
    } else {
      const pageWide = page
        .getByRole('button')
        .filter({ hasText: new RegExp(`^(${ONBOARDING.join('|')})$`) })
      if ((await pageWide.count()) > 0) {
        log(`  [onboarding] step ${steps + 1} (page-wide): press「${(await pageWide.last().innerText()).trim()}」`)
        target = pageWide.last()
      }
    }
    if (!target) break
    await target.click({ timeout: 8000 }).catch((error) => log(`  [onboarding] click failed: ${String(error).split('\n')[0]}`))
    await page.waitForTimeout(900)
  }
  // 遮罩必须真的走了 —— 否则后面的设置页点击会被它拦下（Playwright 报
  // "intercepts pointer events"），而那看起来像插件坏了。
  for (let i = 0; i < 10; i++) {
    const masks = await page.evaluate(() =>
      [...document.querySelectorAll("[class*='_mask_']")].filter((el) => {
        const style = getComputedStyle(el)
        return style.pointerEvents !== 'none' && el.getBoundingClientRect().width > 0
      }).length,
    )
    if (masks === 0) break
    if (i === 0) log(`  [onboarding] ${masks} 层遮罩仍在，等它退场…`)
    await page.waitForTimeout(500)
  }
  return steps
}

;(async () => {
  if (!fs.existsSync(path.join(REPO, 'lib', 'index.js'))) {
    throw new Error('lib/ 不存在：先跑 `pnpm build`（link 的是构建产物）')
  }
  const { chromium } = require('playwright')
  // 本地用机器上已缓存的 Chromium；找不到（例如缓存被清、或 CI 的 Linux，浏览器在
  // ~/.cache/ms-playwright 而不是 %LOCALAPPDATA%）就退到**系统 Chrome**（本机测量资产
  // 一节的老办法，省掉一次浏览器下载），再找不到才交给 playwright 自己的默认路径。
  const chromiumExe = (() => {
    const cache = path.join(process.env.LOCALAPPDATA || os.homedir(), 'ms-playwright')
    if (fs.existsSync(cache)) {
      for (const dir of fs.readdirSync(cache)) {
        if (!dir.startsWith('chromium-')) continue
        for (const candidate of [path.join(cache, dir, 'chrome-win64', 'chrome.exe'), path.join(cache, dir, 'chrome-win', 'chrome.exe')]) {
          if (fs.existsSync(candidate)) return candidate
        }
      }
    }
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    for (const candidate of [
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]) {
      if (fs.existsSync(candidate)) return candidate
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

    // `--no-proxy-server`：本机沙箱有 HTTP_PROXY=127.0.0.1:1793，不加它 localhost 的请求会被
    // 代理吃掉（见 AGENTS.md「本机测量资产」）；对 CI 是无副作用的空操作。
    browser = await chromium.launch({ executablePath: chromiumExe, args: ['--no-proxy-server'] })
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
    // 点一下不等于切过去了：本机 rc.2 实测有一次点击没生效，于是下面**所有** compat
    // 断言都在「compat 其实没开」的状态下取样 —— rim 找不到、panel 没描边、右侧栏
    // 没 blur 全部变成假绿。显式轮询到 html 真挂上 data-dsh-glass-compat 再往下走
    // （最多补点两次），并把这次切换本身也断出来。
    const compatOn = async () => page.evaluate(() => document.documentElement.hasAttribute('data-dsh-glass-compat'))
    let switched = false
    for (let attempt = 0; attempt < 3 && !switched; attempt++) {
      await page.getByRole('button', { name: '兼容模式' }).click()
      await page.waitForTimeout(1500)
      switched = await compatOn()
    }
    check('compat 模式已激活（html 挂上 data-dsh-glass-compat）', switched)
    const rim = await page.evaluate(() => {
      const sel = "[role='menu'],[data-composer-card],[class*='popover'],[class*='dropdown']"
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

    // ---- 关键区域采样 5：关闭态的右侧栏容器不得残留 blur（issue #16）------
    // 真页级联断言（上一节 compat 的 rim / panel 采样是同一层）。
    // `[class*='panel']` 是子串匹配，会命中宿主自己的右侧栏布局壳
    // （`P3OORG_panel` + `P3OORG_panelBody`，来自
    // `@deepseek-ai/dsh-client-ui-sidebar-right`）。那个壳在右栏关闭后仍留在
    // DOM 里（只把子节点 dock 移出并隐藏），于是 blur 继续绘制成右缘约
    // 300×518 的磨砂残带（报告人在 0.1.7-rc.2 实测）。修复后：容器及其子树
    // 在闭态下不允许有 backdrop-filter，展开态才允许。
    // 全新的 DSH_HOME 没有会话 ⇒ 很可能根本渲染不出这个容器，那按 PP 那条
    // 先例记 skipped（不假绿），真机另有复核。
    const rightPanel = await page.evaluate(() => {
      const el = document.querySelector('[data-sidebar-right-panel]')
      if (!el) return null
      const box = el.getBoundingClientRect()
      return {
        open: el.hasAttribute('data-sidebar-right-open'),
        blur: getComputedStyle(el).backdropFilter,
        bodyBlur: el.firstElementChild ? getComputedStyle(el.firstElementChild).backdropFilter : null,
        size: `${Math.round(box.width)}x${Math.round(box.height)}`,
      }
    })
    if (rightPanel === null) {
      results.push({ name: '右侧栏容器闭态无 blur（#16）', ok: true, skipped: true, detail: '本环境无会话 ⇒ 无右侧栏容器' })
      log('— 右侧栏容器闭态无 blur：跳过（新 DSH_HOME 无会话，在真机上另测）')
    } else {
      check(
        '右侧栏容器闭态无 blur（#16）',
        rightPanel.open || (rightPanel.blur === 'none' && rightPanel.bodyBlur === 'none'),
        JSON.stringify(rightPanel),
      )
      // 同页 A/B（AGENTS.md「控制项必须 DIFFERS」）：把**修复前那条**选择器插回去，
      // 同一个真宿主元素必须立刻变成 blur —— 否则 `none` 可能只是因为玻璃没开、
      // 元素不存在或规则压根没生效，那种绿什么都不证明。插完立刻撤掉。
      const ab = await page.evaluate(() => {
        const el = document.querySelector('[data-sidebar-right-panel]')
        if (!el) return null
        const style = document.createElement('style')
        style.textContent = "[data-dsh-glass-compat] [class*='panel']{backdrop-filter:blur(12px)}"
        document.head.append(style)
        const withOldRule = getComputedStyle(el).backdropFilter
        const bodyWithOldRule = el.firstElementChild ? getComputedStyle(el.firstElementChild).backdropFilter : null
        style.remove()
        return { withOldRule, bodyWithOldRule, afterRemoval: getComputedStyle(el).backdropFilter }
      })
      check(
        '同页 A/B：插回旧规则后同一元素立刻变 blur（#16）',
        ab !== null && ab.withOldRule !== 'none' && ab.afterRemoval === 'none',
        JSON.stringify(ab),
      )
    }

    // 上面那条依赖真有一个会话；新 DSH_HOME 通常没有，于是这里再补一条**不依赖会话**
    // 的同类断言：往真页里合成宿主右侧栏的 markup（类名 / 属性逐字照抄上游
    // SidebarRight.tsx），读**级联后**的计算样式。这层比 tests/glass-css.spec.ts 强
    // （真 Chromium + 真样式表），比上面那条弱（markup 是造的，不是宿主渲染的）——
    // 两条一起才既有 CI 覆盖、又有真机覆盖。必须留在 compat 分支内：下面就会把模式
    // 切回云母，那时 `[data-dsh-glass-compat]` 已经不在了。
    const synthetic = await page.evaluate(() => {
      const host = document.createElement('div')
      host.innerHTML =
        '<div class="P3OORG_panel" data-sidebar-right-panel="push" aria-hidden="true">' +
        '<div class="P3OORG_panelBody"></div></div>'
      const panel = host.firstElementChild
      document.body.append(host)
      const closedPanel = getComputedStyle(panel).backdropFilter
      const closedBody = getComputedStyle(panel.firstElementChild).backdropFilter
      panel.setAttribute('data-sidebar-right-open', '')
      panel.removeAttribute('aria-hidden')
      const openPanel = getComputedStyle(panel).backdropFilter
      // 反向对照（issue #17 改向）：同样的类名、但不带宿主的两个属性 ⇒ 现在必须
      // **没有**模糊。删掉通用 `[class*='panel']` 之前这里反向（必须有），所以这条
      // 同时证明「通用族真的被摘掉了」；少了它，一个把 panel 全族恢复回来的回退
      // 会让上面几条断言照样绿。
      const control = document.createElement('div')
      control.className = 'P3OORG_panel'
      document.body.append(control)
      const controlPanel = getComputedStyle(control).backdropFilter
      host.remove()
      control.remove()
      return { closedPanel, closedBody, openPanel, controlPanel }
    })
    check(
      '右侧栏容器闭态无 blur / 展开态有 blur / 其它 panel 类名不再有 blur（#16 + #17，合成 markup）',
      synthetic.closedPanel === 'none' &&
        synthetic.closedBody === 'none' &&
        synthetic.openPanel !== 'none' &&
        synthetic.controlPanel === 'none',
      JSON.stringify(synthetic),
    )

    // ---- 行为断言：总开关真的能切（先切回云母，再关、再开）------------------
    // 同 compat 那条：点了不等于切了（开关的点击也会静默不生效），所以要轮询到
    // 属性真的被摘掉再断，必要时补点一次。
    await page.getByRole('button', { name: '云母效果' }).click()
    await page.waitForTimeout(800)
    const glassOff = async () => page.evaluate(() => !document.documentElement.hasAttribute('data-dsh-glass'))
    let off = false
    for (let attempt = 0; attempt < 3 && !off; attempt++) {
      await glassSwitch.click()
      await page.waitForTimeout(1200)
      off = await glassOff()
    }
    check('关掉总开关后 data-dsh-glass 被摘除', off)
    if (off) {
      await glassSwitch.click() // 还原
      await page.waitForTimeout(1200)
    }

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
