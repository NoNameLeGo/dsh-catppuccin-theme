# Changelog

本项目的所有重要变更都记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（`0.x.y` 正式版，
`0.x.y-beta.n` 预发布 → `beta` npm 标签）。

## [Unreleased]

### 计划（0.5.0，重构——已决策：待 DSH 0.1.2 正式稳定后再做）

> **决策（2026-08-29）**：先发 0.4.3（兼容修复）。0.5.0 重构**非必需**——0.4.3 后插件在 0.1.1-rc.2 与 0.1.2-alpha.1 均正常，自建持久化稳定运行。重构是工程质量优化（少维护一套自建持久化），等 DSH 0.1.2 正式发布、官方 settings 机制稳定后再实施，届时 devDeps 同步对齐并移除 runtime 类型 bridge。

- **持久化迁移到官方 settings 机制**：DSH 0.1.1-rc.2 起 settings namespace 已放开 allowlist（"注册即暴露"），`ctx.settings.register` / `installSettingsSection`（host）+ `ctx.settingsScope.bind`（client）两版 API 一致。计划删除自建的 `/catppuccin/state` GET/PUT 路由、`src/host-state.ts`、`src/state-sync.ts` 的大部分与 `$DSH_HOME/catppuccin-state.json`，改用官方文档持久化（同样跨 Desktop 重启）。
  - **实现要点（向下兼容约束）**：① host 用 `installSettingsSection`（optional wiring），无 settings 服务的 profile 保持等待不崩；② client 保留 localStorage 兜底（settingsScope `status` 非 `ready` 时降级，仅影响跨重启持久）；③ 老用户 `catppuccin-state.json` 一次性迁移进官方 namespace（文件保留作回退）；④ `src/index.ts` 顶部过时的 allowlist 注释同步更新为"注册即暴露"事实。
- **设置行槽位（可选）**：Catppuccin / 玻璃 / 更新检查行可从 `settings.general.item` 迁到 `settings.plugin.item`（keyed 卡片槽，rc.2 与 0.1.2 均支持，Host 注册 namespace 后自动配对）。

## [0.4.3] - 2026-08-29

### 修复

- **兼容 DSH 0.1.2-alpha.1（dsh-client-runtime 移除）**：0.1.2 起
  `@deepseek-ai/dsh-client-runtime` 包被整体移除（slots 职责并入
  `dsh-client-ui-renderer`，新版 web 组合不再提供该服务）。插件 client 半区
  的 `dsh.client.inject` 声明了已不存在的 runtime 服务，会导致 client 半区
  永久等待、主题与设置行不生效。现将 inject 目标改为
  `@deepseek-ai/dsh-client-ui-renderer`，`ClientContext` 类型改从
  `@deepseek-ai/cordis` 导入，并移除 tsdown 中对已废弃 runtime /client 的
  external 豁免（该豁免现会生成运行时无法解析的 require，改为由纯度门在
  构建期拦截）；devDeps 的 client 类型包从 `^0.1.0-rc.6` 升至
  `^0.1.1-rc.2`（npm 当前可用版本，0.1.2 发布后再对齐）。
  **注（临时类型 bridge）**：devDeps 中保留
  `@deepseek-ai/dsh-client-runtime@^0.1.1-rc.2` 仅用于类型编译——0.1.1-rc.2
  的 `dsh-client-ui-settings` / `ctx.slots` Context merge 仍由该包类型提供
  （`dsh-client-ui-renderer` 自带 `ctx.slots` merge 是从 0.1.2 才开始的）。
  运行时不注入该服务，0.1.2 发布、devDeps 对齐后即可移除。
- 其余 API 经验证兼容：ThemeRuntime（register/setTheme/getTheme/theme/change）、
  `--dsw-*`/`--dsw-alias-*`/`--shiki-*` token（名称与值零差异）、webServer
  路由注册、slots/locale 注册、`settings.general.item` 槽位、React 18、
  `dsh plugin --profile` CLI、cordis 4.0.1 均未变化。

## [0.4.2] - 2026-08-29

### 修复

- **玻璃态下侧边栏 fixed 弹层被裁切的通用修复**：`sidebarCol` 上的
  `backdrop-filter` 会把 `position: fixed` 后代（任意插件从 `sidebar.*`
  slot 弹出的菜单 / dialog / 看板，例如 dsh-cost-dashboard 的
  `.cd-footerPanel`/`.cd-footerMask` 纯 div 弹层）的 containing block 从
  视口改签到侧边栏列，再被列上 `overflow: hidden` 裁成窄条，遮罩也只盖
  侧边栏。原有 `:has([role='dialog'])` 守卫只认 `role='dialog'`，对这种
  无角色的弹层完全漏防。
- **实现**：把磨砂填充 + `backdrop-filter` 模糊 + 顶缘高光从列元素移到
  `[class*='sidebarCol']::before` 子层（`z-index: -1; pointer-events: none`）。
  伪元素不是内容后代的祖先，其背景模糊只作用于页面背景，对任何
  fixed 后代**不再构成 containing block**——结构性根治，无需逐插件
  写选择器，所有从侧边栏 slot 弹 fixed 层的插件一次性恢复视口锚定。
  删除已失效的 `:has([role='dialog'])` 守卫。视觉（玻璃片填充/描边/
  圆角/阴影/折叠 rail）保持不变，关闭玻璃态完全还原原生界面。

## [0.4.1] - 2026-08-28

### 修复

- 深色 flavor（Frappé / Macchiato / Mocha）下弱层级文字（
  `label-secondary` / `label-tertiary` / `caption` / `dimmed`）对比度过低，
  改指更亮的调色档位，采纳 PR #8 的 `label-primary-dimmed` 层级改进
  （bluish-100 → bluish-75, subtext1）。(closes #7)
- 设置页文档显式指定 light/dark 时，刷新 / 重启后主题丢失（issue #6）。

## [0.4.0] - 2026-08-25

### 新增

- **dsh-TUI 终端主题支持**：一条命令装进 dsh-tui profile，启动时自动把
  四套 Catppuccin 主题同步到 `~/.dsh-tui/themes/`，`/theme` 切换；Web 端
  启动时若目录已存在也会自动同步。
- 新增 dsh-TUI 四风味主题静态资产（`themes/`）。

## [0.3.1] - 2026-08-23

### 变更

- 移除设置页的自动检查更新，回到纯手动按钮，避免未经用户动作的网络请求。

## [0.3.0] - 2026-08-23

### 新增

- 玻璃质感新增**清透 / 标准 / 磨砂**三档一键预设（滑条保留微调）。
- 设置行挂载时自动静默检查一次插件更新；Host 侧检查结果缓存 5 分钟。
- 关闭 Catppuccin 风味时**还原用户原有的官方主题偏好**，不再强制重置为
  「跟随系统」。

### 其他

- 玻璃旋钮默认值单一来源化（从 `DEFAULT_GLASS` 派生）。

## [0.2.11] - 2026-08-23

### 修复

- 收窄 `[class*='bubble']` 玻璃选择器到会话容器内，避免误伤第三方
  widget（如 dsh-whale-widget 的 `.dshwv-bubble`）。

## [0.2.10] - 2026-08-23

### 修复

- Latte 下「预览版」徽章文字对比度过低。(closes #4)

## [0.2.9] - 2026-08-22

### 修复

- 切换模型后 Catppuccin 主题被重置的问题。(closes #3)

## [0.2.8] - 2026-08-21

### 修复

- 顶栏圆角处玻璃轮廓线断开。(closes #2)

### 新增

- 语法高亮对齐 Catppuccin 官方配色（amber-400 改回 peach 系）。

## [0.2.7] - 2026-08-18

### 修复

- **DSH Desktop 持久化**：主题 / 玻璃偏好持久化到 DSH home 文件，
  桌面端随机端口重启不再回退默认配色。
- 更新检查适配 DSH Desktop，升级命令随环境自动变化。

### 新增

- 模型选择弹层分组名改为贴合文字的胶囊标签（参考新会话按钮），弹层背景
  提浓至主题 layer-2 @70%，提升可读性（原约 9% 近透明）。

## [0.2.5] - 2026-08-17

### 新增

- **玻璃质感皮肤**（云母 / 兼容双模式，模糊度 / 磨砂度 / 背景亮度可调），
  配色自动跟随当前 Catppuccin 主题。
- **检查 Catppuccin 插件更新**设置行：查询 npm dist-tags，通道感知
  （latest/beta）semver 比较并给出可复制升级命令。
- 页面边缘渐变模糊、气泡与新会话按钮玻璃化、折叠栏悬浮玻璃等玻璃细节。

### 修复

- 统计行宽度恢复为受容器约束，修复玻璃模式下溢出检测失效导致悬浮全文
  tooltip 不出现的问题。

## [0.2.0] - 2026-08-16

### 新增

- Catppuccin 四个风味主题（Latte / Frappé / Macchiato / Mocha）接入官方
  主题系统，全界面配色覆盖。
- 四主题斜切合成预览图。

## [0.1.x] - 2026-08-15/16

### 修复

- 0.1.2：将 `schemastery` 移入 dependencies（runtime 使用，
  devDependencies 在安装时不生效）。
- 0.1.1：补充 repository / homepage / keywords 字段。

[Unreleased]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.11...v0.3.0
[0.2.11]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.10...v0.2.11
[0.2.10]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.9...v0.2.10
[0.2.9]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.5...v0.2.7
[0.2.5]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.2.0...v0.2.5
[0.2.0]: https://github.com/NoNameLeGo/dsh-catppuccin-theme/compare/v0.1.2...v0.2.0