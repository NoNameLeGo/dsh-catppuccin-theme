# 上游 0.2.0 线（官方桌面壳）适配审计

- 日期：2026-09-30
- 取证对象：本机官方桌面壳 `D:\PROGRAM\DeepSeek Harness`（`app-update.yml` channel = nightly），
  内置运行时 **`@deepseek-ai/dsh-desktop-runtime@0.2.0-rc.2`**（`app.asar` 内 `dsh/package.json`），
  `resources/runtime/primary-runtime/runtime.json` 报 `desktopVersion 0.2.0-rc.2`
- 上游对照：`deepseek-ai/deepseek-harness` 公开仓，HEAD = tag `dsh-v0.2.0-rc.2`（`639ed015`），
  npm dist-tags `latest`/`next` = `0.2.0-rc.2`、`alpha` = `0.1.7-alpha.2`
  ⇒ **本机桌面就是当前上游顶端，没有"更新的一代"可等**
- 结论一句话：**插件在 0.2.0 上功能可用（启动级 e2e 19/19，真机桌面里就是活的）**；
  需要新适配的是**配色覆盖面的 17 个新 token**、**兼容/商店元数据落后一代**，
  以及**官方桌面壳 9 月中旬新增的 Windows 标题栏几何**（插件零处理，但实测未产生缺陷）

> **2026-09-30 实施状态**：§2 的 **P1-a / P1-b / P2-a / P2-b 已全部落地**（改动见 CHANGELOG 的
> `## [Unreleased]`；验证：单测 240/240、`pnpm build`、`pnpm typecheck`×2、启动级 e2e 在 0.2.0-rc.2 上 19/19）。
> **仍未做**：§2 P3（`ctx.theme.register/overrideTokens` 结构性改造，按计划留 0.6.0）、
> §5 的口径外 token（`base.css` / `onboarding.css`，属"权威范围"决策）、
> 以及 macOS 的 `html[data-platform='darwin']` 分支（本机无法验证）。

---

## 0. 取证口径（可复现）

| 手段 | 命令 / 位置 |
|---|---|
| asar 解包（无依赖读取器） | `.debug/desktop-audit/asar.mjs`（`list` / `cat` / `dump` / `grep`；Electron 把 `offset` 存成**字符串**，读取器已处理） |
| 0.2.0 整套运行时落地 | `node .debug/desktop-audit/asar.mjs dump "<asar>" dsh/ .debug/desktop-audit/dsh-0.2.0` + 覆盖 `app.asar.unpacked/dsh/` 的原生模块（10 915 文件，约 6 s） |
| 上游源码对照 | `gh api -X GET -H 'Accept: application/vnd.github.raw' repos/deepseek-ai/deepseek-harness/contents/<path> -f ref=dsh-v0.2.0-rc.2` |
| token 表对比（源码口径） | `.debug/desktop-audit/token-diff-src.mjs`、`token-coverage.mjs` |
| token 表对比（**出厂包**口径） | 子代理产出 `.debug/desktop-audit/token-diff.md` + `tokens-0.2.0-design-platform.json`（解析 `dsh-client-ui-theme/lib/client.js` 内联 `design-platform.css` 区段；与上游源文件交叉校验 0 差异） |
| 启动级 e2e | `DSH_BIN=<0.2.0 runtime>/@deepseek-ai/dsh/lib/bin.js node scripts/e2e-boot-check.cjs` → `.debug/desktop-audit/e2e-0.2.0.log` |
| 活体运行时查询 | `cordis_inspect_query`（client Service / Theme；**目录不是全集**，见 §1.2） |
| 真机像素 | `.debug/desktop-audit/capture-desktop2.ps1`（`PrintWindow` + `PW_RENDERFULLCONTENT`，不抢用户焦点） |
| 受控页面复现标题栏探针 | `.debug/desktop-audit/desktop-caption-probe.cjs` → `caption-probe.log` + `shots/probe-with-fade.png` / `probe-without-fade.png` |

本会话本身就跑在该桌面壳里，这一点已实测而非推断：
`DSH_PROFILE=desktop`、`DSH_PROFILE_DIR=~\.dsh\profiles\desktop`、`DSH_WEB_URL=http://127.0.0.1:19387`、
`ELECTRON_RUN_AS_NODE=1`（**没有** `DSH_DESKTOP_NODE_EXECUTABLE`）；
进程链 `pwsh → DeepSeek Harness.exe(host, --expose-internals …/dsh-desktop-host/lib/index.js) → DeepSeek Harness.exe(Electron 主进程)`；
renderer 命令行含 `--standard-schemes=dsh-app --secure-schemes=dsh-app`。
该 profile 里装的是 `@nonamelego/dsh-catppuccin@^0.5.8`（registry 安装）。

---

## 1. 已核实「不需要改」的部分（免得后人重复怀疑）

1. **整代可用性**：把所有条件指向桌面自带运行时后，`scripts/e2e-boot-check.cjs` **19/19 通过**（40 s）：
   引导可走完、三行设置注册、切 Mocha 后 `--dsw-alias-bg-base` = `#11111b`、玻璃总开关/云母模式、
   兼容模式 rim、右侧栏 #16/#17 双向断言、无未捕获异常。
   日志：`.debug/desktop-audit/e2e-0.2.0.log`。
2. **settings seam 双通道仍成立**：真机 `~/.dsh/profiles/desktop/cordis.patch.yml` 在
   **2026-09-30 20:03:47** 被改写（`glass.blur 12 → 2`、`frost 45 → 20`），即用户在使用 0.2.0 桌面的同时
   通过插件设置行写盘成功 ⇒ `ctx.configForms`（0.1.7+ 通道）在 0.2.0 上读写正常。
   ⚠️ 注意：活体 Inspect 的 client Service **目录里没有 `configForms`**（`no catalogued Service named "configForms"`），
   但该服务在 0.2.0 里被 `dsh-client-locale` / `ui-chat` / `ui-conversation` / `ui-plugin-manager` 等官方包使用
   ⇒ **目录是策展过的子集，别拿它当"服务不存在"的证据**（`theme`、`layout`、`slots` 等在目录里，`configForms` 不在）。
3. **桌面识别判据仍成立**：`lib/main.js` 的 `DesktopHostProcess.start()` 依旧
   `spawn(this.node = process.execPath, […], { env: desktopNodeEnvironment(this.node, void 0, this.environment) })`，
   `bin === undefined` 时不注入 `DSH_DESKTOP_NODE_EXECUTABLE`；`DSH_DESKTOP_NODE_EXECUTABLE` 只出现在
   `dsh-desktop-host` 的 `packageManager.env`（包安装子进程）。故 `process.versions.electron` 仍是 profile 进程里
   唯一的官方壳信号（0.5.7-beta.0 的适配结论不变）。
4. **端口与 origin 未变**：`dsh-desktop-host/lib/index.js` 仍写死 `--no-open --port 19387`；
   页面 origin 是自定义协议 `dsh-app://app/`（不是 http origin），插件的持久化走 host 侧文档，不受 per-origin localStorage 影响。
5. **主题服务 API 未变**：活体 `ctx.theme` = `getTheme / setTheme / setFontSize / register / overrideTokens`，
   与仓库 devDependency（`@deepseek-ai/dsh-client-ui-theme@0.1.7-rc.1`）的 `.d.ts` 一致。
6. **Windows 标题栏取色链路对插件是对的（实测）**：
   - 受控页面复现 `preload-windows.ts` 的探针逻辑：`--dsw-specific-sidebar-fill` 解决为 `rgb(24, 24, 37)`、
     `--dsw-alias-label-primary` 解决为 `rgb(205, 214, 244)`，canvas 折算后 IPC 实发
     `["zh-CN", "rgba(24, 24, 37, 1)", "rgba(205, 214, 244, 1)"]`，两条都通过主进程的 `validColor` 正则。
   - 真机窗口像素：`y ≥ 32` 处正好 `24,24,37` = `#181825`（Mocha mantle = 该 token）⇒ 原生标题栏确实用了我们的颜色，
     符号色 = Mocha text，可读。
   - 顺带确认：`data-windows-titlebar` 下，页面顶部保留区与原生标题栏**取的是同一个 token**（都 = sidebar fill），
     设计上就要求"无缝"，本主题保持了这层关系。
7. **桌面壳专属 token 不需要映射**：`--dsw-desktop-window-tint`（`renderer/assets/window-material.css`）
   只被 `renderer/welcome.css` `@import`，作用于欢迎/策略登录窗口 `renderer/welcome.html`；那份窗口自带整套字面量
   token（`lib/welcome/welcome.css` 是 189 token/方案的完整副本），**不继承主界面主题**（有意为之）。
8. **标题栏菜单不构成冲突**：0.2.0 新增的 `preload-menu.ts`（Windows 上「应用 / 编辑」）挂在 shadow DOM、
   `z-index: 1100`，只消费 `--dsw-alias-label-secondary` / `--dsw-alias-interactive-bg-hover` /
   `--dsw-alias-label-primary` / `--dsw-alias-state-business-primary` / `--dsw-font-family` —— 全在插件映射表内；
   挂载前提 `document.querySelector('[data-shell-overlay]')` 插件从未触碰。
9. **`data-ds-theme-source` 与原生 chrome 一致**：探针实测 `themeSource = "dark"`，与 Mocha 一致
   （插件用 `theme.setTheme()` 强制亮/暗，`ui-layout`/`ui-theme` 写该属性，桌面壳据此设 `nativeTheme.themeSource`，
   macOS vibrancy 与 Platform 登录页跟随）。

---

## 2. 需要新适配的地方

### P1-a 配色覆盖缺 17 个 alias（其中 8 个是字面量，无法继承我们的静态阶梯）

口径：`design-platform.css`（出厂包内联区段 = 上游源文件，0 差异）

| 家族 | 0.1.7-alpha.2（插件基线） | 0.2.0-rc.2 | 插件现状 |
|---|---|---|---|
| static | 77 / 77 | 77 / 77 | 全映射 |
| alias | 84 / 84 | **101 / 101** | 缺 17 |
| specific | 11 / 11 | 11 / 11 | 全映射 |
| 合计 | 172 | **189** | 172（基线覆盖率 172/172，确实"基线全跟"） |

新增 17 个 alias（两方案均声明，删除 0 个）：

```
bg-document-selection            label-shimmer                tooltip-key-bg
file-diff-added-bg               menu-group-header-fill       turn-trigger-bg
file-diff-added-gutter           menu-icon                    turn-trigger-bg-hover
file-diff-added-marker           switch-thumb
file-diff-deleted-bg             toast-label
file-diff-deleted-gutter         label-deep-diving
file-diff-deleted-marker         label-deep-diving-shimmer
```

另有同一代新增但**不在基线口径内**的 6 个：`--dsw-alias-settings-card-fill/-stroke`（base.css）、
`--dsw-alias-onboarding-accent/-card-fill/-secondary-fill/-checkbox-border`（onboarding.css）。
另有 `--dsw-menu-surface-fill`（非 alias 家族，但同属 `--dsw-` 主题表面）。

**为什么其中 8 个必须处理**：`--dsw-alias-file-diff-{added,deleted}-{bg,gutter,marker}`（6 个，字面量
`rgb(230,244,231)` 等官方绿/红）、`--dsw-alias-menu-group-header-fill`（`rgba(248,249,250,.94)` /
`rgba(48,49,54,.94)`）、`--dsw-menu-surface-fill`（`rgba(248,249,250,.58)` / `rgba(48,49,54,.5)`）——
它们的取值是**字面量而不是 `var(--dsw-static-*)`**，所以"只覆盖静态阶梯、别名自动跟随"的机制对它们无效，
会以官方中性灰/绿红出现在 Catppuccin 界面里（菜单分组标题、菜单/浮层材质、文件 diff 视图）。
其余 9 个是 `var()` 链，自动继承，但仍应从 `palettes.ts` 补上（覆盖率断言与 `ctx.theme` inspect 目录都用得上）。

两处**官方取值变化**需要一并复核：
- `--dsw-alias-bg-document-preview`：light `bluish-750 → bluish-100`
- `--dsw-alias-label-document-preview`：light `bluish-200 → bluish-700`
  插件在 Latte 上对该 label 有**记录在案的有意偏离**（`tests/palettes.spec.ts` 断言为 `bluish-00`）；
  上游这次把浅色端改深，正是同一类对比度问题的方向，需要重新判定偏离是否仍然必要。
- `--dsw-specific-menu` 新增 **macOS 分支**（`html[data-platform=darwin] body` → `#f8f9faf0` / `#303136f0`）：
  插件无条件覆盖该 token，macOS 上"菜单底没有底层时接近不透明"的官方意图会被我们的半透明值取代，本机无法验证。

**做法（按仓库规则 2）**：刷新 `.cache/dsh-ref/dsw-tokens.json`（对 `dsh-v0.2.0-rc.2` 的
`packages/client/ui-theme/src/styles/design-platform.css`）→ `pnpm gen:palettes` → 处理生成器里"新名字落到哪个计划"
的分支 → 补断言（照 `tests/palettes.spec.ts` 里「upstream 0.1.7 token additions」那节的先例加一节 0.2.0）。
**别手改 `src/client/palettes.ts`**。

> ✅ **已实施（2026-09-30）**：解析器扩出第四个桶 `other`（`light_other` / `dark_other`）；
> 缓存按 `dsh-v0.2.0-rc.2` 重建（static 77 / alias 101 / specific 11 / other 1 = 190，覆盖 190/190，
> 并与出厂包内联表交叉校验通过）。生成器新增 `aliasLiteralOverrides`（8 个字面量 token）与
> `otherOverrides`（`dsw-menu-surface-fill`），`--dsw-specific-menu` 改成 `var(--dsw-menu-surface-fill)` 跟随上游结构。
> 两处取值变化都处理了，并且**发现一处必须改的连带问题**：0.2.0 把浅色文档预览翻成「近白面 + 中深字」后，
> 旧补丁（label 钉 bluish-00）会变成近白字压浅面（1.05:1）；而只退役旧补丁又会因为我们的阶梯把官方
> bluish-100 映射到 surface1（188,192,204）而只剩 3.44:1 ⇒ 按规则 3 把**面**钉到官方亮度最接近的
> bluish-50（Latte mantle），实测 **5.14:1**，label 保持官方 bluish-700。断言见
> `tests/palettes.spec.ts` 的「upstream 0.2.0 adaptation」一节（5 条）。

### P1-b 兼容声明与商店窗口落后一代

- `package.json` 的 `dsh.compatibility`：`dshReleases` 只到 `0.1.7-rc.1`，`dshOperations` 只有 `0.1.7-rc.1`，
  `profiles: ["web"]`（未声明 `desktop`）；devDependencies 全部钉在 `0.1.7-rc.1`。
- 商店侧实测（`.debug/dsh-store/verify-manifest.mjs`）：当前窗口 = **`0.1.7-rc.2, 0.2.0-rc.1, 0.2.0-rc.2`**
  （target `0.2.0-rc.2`），**窗口内命中 `compatible`：无一命中**。
- 影响面：我方条目本来就是 `blocked` + `external-only`，所以**不是不能装**，而是元数据/兼容展示与现实脱节；
  按对方策略，"approved 条目窗口内全非 compatible 会转 unlisted"值得避免。
- 下一手：0.2.0-rc.2 上的安装/启动/卸载/回滚逐项过一遍（本审计已覆盖"启动"，见 §1.1），
  然后补 0.2.0 行 + `desktop` profile。

> ✅ **已实施（2026-09-30）**：`dshReleases` 补 `0.2.0-rc.2: compatible`，`dshOperations` 补
> `0.2.0-rc.2: { install: passed, start: passed, uninstall/rollback: unknown }`（install 由临时 profile 的
> `link:` 安装 + 启动级 e2e 覆盖，卸载/回滚**没有**实测，仍标 unknown），`profiles` 补 `desktop`；
> 11 个 `@deepseek-ai/dsh-*` devDependencies 对齐 `0.2.0-rc.2` 后 `typecheck` / `typecheck:tests` **零漂移**
> （说明插件的 API 用法在 0.2.0 上仍然成立）。窗口复算：`{0.1.7-rc.2, 0.2.0-rc.1, 0.2.0-rc.2}` 命中 `compatible` ✅。

### P2-a 官方壳新增的 Windows 标题栏几何：插件零处理

上游在 **2026-09-17** 新增 `apps/desktop/src/windows-layout.ts` / `preload-windows.ts` / `preload-menu.ts`，
在 Windows 上给 `<html>` 挂 `data-windows-titlebar` 并设 `--dsh-windows-titlebar-height: 40px`，
`ui-layout` 据此在所有列上方预留标题栏；`ui-sidebar` 收起态另设 `--dsh-windows-menu-start: 84px`。
插件侧 **`grep -r windows-titlebar src/` 命中 0**。目前没有观察到缺陷（§1.6 说明取色链路是对的），
但有两个明确的 polish 点：

- 玻璃层的顶部 13 px 渐隐（`[data-dsh-glass-fade=top]`，`background: rgba(0,0,0,.14)`，mask 自顶向下淡出）
  落在原生标题栏区内。真机采样：`y≈12` 处 = `21,21,33`（= `#181825` 叠 14% 黑，正是渐隐层不透明端），
  `y≥32` = 纯 `#181825`；受控页面里同位置页面本身是 crust `17,17,27` 且无中性元素
  ⇒ 顶部 0–9 px 的中性带 `32,32,32` 来自**原生窗口边缘**（本机是最大化窗口，取不到非最大化对照）。
  即：可接受，但"桌面下跳过或按 `--dsh-windows-titlebar-height` 下移顶部渐隐"是干净的改法。
- 侧栏在玻璃模式下是 `margin: 12px` 的浮动卡，而标题栏菜单起点默认 48 px / 收起态 84 px；
  若收起态观感有偏差，属同一批 polish。

> ✅ **已实施（2026-09-30）**：顶部渐隐改为在桌面标记下 `display: none`
> （`[data-dsh-glass][data-windows-titlebar] [data-dsh-glass-fade='top']`，见 `src/client/glass/glass.module.css`），
> 底部渐隐与通用规则不动；`tests/glass-css.spec.ts` 新增一条锁定「只在该标记下消失、通用规则仍带 blur 与 mask」。
> 侧栏浮动卡与菜单起点的观感差异**未改**（需要真机对比才能判定，属未验证项）。
> 另把标题栏取色链路做成护栏断言：`tests/palettes.spec.ts` 的「caption probe」用例要求
> `--dsw-specific-sidebar-fill` 与 `--dsw-alias-label-primary` 在四个风味里都能解析成不透明 hex 且 ≥4.5:1。

### P2-b `profiles` 未声明桌面

`dsh.compatibility.profiles: ["web"]`。官方桌面壳走的是 `$DSH_HOME/profiles/desktop`（`apps/desktop/src/paths.ts`
⇒ `join(dshHome, 'profiles', 'desktop')`，`dsh-desktop-host` 里 `runProfile({ profile: 'desktop' })`），
与社区壳同一个 profile 名——本次审计已在真机 desktop profile 上验证读写正常，声明可以补上。

> ✅ **已实施**：`profiles: ["web", "desktop"]`。

### P3 结构性机会（非缺陷，单独立项）—— ⏸ 本轮**未做**，留给 0.6.0

`ctx.theme` 的 `register({id, colorScheme, tokens})` / `overrideTokens(source, {token: {light, dark}})` 在
**0.1.7-rc.1 就已存在**（本地 `.d.ts` 有，0.2.0 仍一致），插件目前走的是"自注入样式表 + `setTheme()` 强制亮暗 +
localStorage 记忆用户原值"的路子。改用官方 registry 的收益：
不再改写用户的 `ui-theme.preference`、token 进入官方 inspect 目录（现在 `cordis_inspect_query` 的 Theme 里看不到插件 token）、
少一层与官方 token 样式表的注入顺序耦合。
代价：要动幂等注入、玻璃层取值、K 通道（用户覆盖）与既有断言 ⇒ 建议按 `0.6.0` 立项单独做，不混进 0.2.0 适配。

---

## 3. 建议动作与顺序

1. ✅ **先做 P1-a**（纯数据 + 生成器，风险最低、收益最直接）：刷新缓存 → `pnpm gen:palettes` → 补断言 → `pnpm test`。
   顺带把 `--dsw-specific-menu` 的 darwin 分支与两处 document-preview 取值变化在 CHANGELOG/注释里写清。
2. ✅ **再做 P1-b**：在 0.2.0-rc.2 上过一遍 install/start（uninstall/rollback 未测，如实标 unknown）→ 更新
   `dsh.compatibility`（补 `0.2.0-rc.2` 与 `desktop`）→ 重新算窗口（`verify-manifest.mjs` 的「窗口内命中」✅）。
3. ✅ **P2 两件小的**（与 1 同批）：桌面下按 `html[data-windows-titlebar]` 关掉顶部渐隐；
   标题栏取色链路护栏断言（未定义 `var()` 会让探针发 `rgba(0,0,0,0)`，原生标题栏整体变透明）。
4. ⏸ **P3 单独立项**（`0.6.0`）——本轮刻意不动。
5. ⏸ **§5 口径外 token**：需要先决定"权威范围"是否从 `design-platform.css` 扩到 `base.css` / `onboarding.css`，
   属维护者决策，不在本轮。
6. 发版仍按 AGENTS.md 的 SOP：**推 tag 前必须问维护者**（本轮**未**改版本号、**未**提交、**未**打 tag）。

---

## 4. 本审计新增的、未入库的取证资产（`.debug/desktop-audit/`）

| 文件 | 作用 |
|---|---|
| `asar.mjs` | 无依赖 asar 读取器（list / cat / dump / grep；处理 `offset` 为字符串的坑） |
| `token-diff-src.mjs` / `token-coverage.mjs` | 上游源码口径的 token 增删改 + 「插件缺哪些」 |
| `token-diff.md` / `tokens-0.2.0-design-platform.json` | 出厂包口径的完整 token 表与 diff（子代理产出，含交叉校验记录） |
| `versions.mjs` / `offsets.mjs` | asar 元数据与偏移诊断 |
| `e2e-0.2.0.log` / `e2e-0.2.0-after.log` / `e2e-0.2.0-final.log` | 启动级 e2e 在 0.2.0-rc.2 上的 19/19 → 19/19 → **20/20**（最后一条含新增的菜单材质断言） |
| `e2e-0.1.5-rc.1-ci-pin.log` | 按 CI 口径（`@deepseek-ai/dsh@0.1.5-rc.1` + `--before=2026-09-21`）复跑的旧宿主回归 19/19 |
| `caption-probe.log` / `desktop-caption-probe.cjs` | 受控页面复现桌面标题栏探针 + 渐隐层 A/B |
| `capture-desktop*.ps1` / `shots/*.png` | 真机窗口取证（`PrintWindow`，不抢焦点） |
| `preview-contrast.mjs` / `palette-diff.mjs` | 文档预览配对实测对比度 / 生成物逐 token 前后对照 |
| `upstream/*` | 关键上游源码与两份 design-platform.css 快照（tag 对齐） |

复现 e2e：`pnpm build` → `$env:DSH_BIN='<0.2.0 runtime>\node_modules\@deepseek-ai\dsh\lib\bin.js'` →
`$env:NODE_PATH="$env:APPDATA\npm\node_modules\@playwright\cli\node_modules"` → `node scripts/e2e-boot-check.cjs`

> ⚠️ **本地全局 `dsh`（0.1.5-rc.2）当前起不来**：干净 `DSH_HOME`、**不装任何插件**时也报
> `plugin(s) failed to load: @deepseek-ai/dsh-sandbox-local` ⇒ 是全局那棵树的自身问题，与插件无关。
> 想验证旧宿主请照 CI 的做法装到**临时前缀**（`npm i --prefix <tmp> @deepseek-ai/dsh@0.1.5-rc.1 --before=2026-09-21`），
> 不要动全局树。

---

## 5. 口径外的 6 个 alias（本轮未做，留给维护者定范围）

`base.css` / `onboarding.css` 里另有 6 个 `--dsw-alias-*`，**从不**在 `design-platform.css` 口径内，
且上游取值为字面量 ⇒ 与那 8 个同理，不会被静态阶梯带着走：

| token | 出处 | 上游取值（浅/深） |
|---|---|---|
| `--dsw-alias-settings-card-fill` / `-stroke` | `base.css` | 设置卡片材质别名（字面量） |
| `--dsw-alias-onboarding-accent` | `onboarding.css` | `#3964fe` |
| `--dsw-alias-onboarding-card-fill` / `-secondary-fill` / `-checkbox-border` | `onboarding.css` | 引导卡片/次要按钮/复选框（字面量） |

它们只影响引导流程与设置卡片材质，视觉面远小于菜单与 diff；是否纳入"要全覆盖"的范围
（即把解析器扩成多文件输入）需要维护者拍板，故本轮只记录不动手。

