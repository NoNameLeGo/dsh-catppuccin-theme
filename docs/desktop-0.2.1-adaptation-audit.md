# 上游 0.2.1 线（官方桌面壳）适配审计

- 日期：2026-10-17
- 取证对象：本机官方桌面壳 `D:\PROGRAM\DeepSeek Harness`。`resources/runtime/primary-runtime/runtime.json`
  报 `desktopVersion 0.2.1-rc.2`，`app.asar` 内 `@deepseek-ai/dsh` 同为 `0.2.1-rc.2`
- 上游对照：`deepseek-ai/deepseek-harness` 的 tag **`dsh-v0.2.1-rc.2`** = `687f282e`；
  npm dist-tags 当时是 `latest = 0.2.0-rc.2`、**`next = 0.2.1-rc.2`**、`alpha = 0.2.1-alpha.5`
- 结论一句话：**配色层零改动**（`--dsw-*` 阶梯与 0.2.0 逐字节相同），**但 settings seam 断了一处**——
  上游删掉了快照里的 `mode`，插件原来的「`mode === 'host'` 才算可用」判定在 0.2.1 上恒为假，
  **设置持久化静默失效**。已修并真机验收通过。

> 本文件是 0.2.0 那轮（[`desktop-0.2.0-adaptation-audit.md`](./desktop-0.2.0-adaptation-audit.md)）的续篇，
> 只记录 0.2.0 → 0.2.1 之间的增量；两轮之间没有变化的契约不再重复。

---

## 0. 取证口径（可复现）

| 手段 | 位置 |
|---|---|
| 两版依赖树对拍 | `%APPDATA%\DSH\data\versions\{0.2.0-rc.2,0.2.1-rc.2}\node_modules\@deepseek-ai\` |
| 出厂包内联 token 表抽取 + 逐 token diff | `.debug/upstream-021/extract-platform-css.mjs`（产物 `design-platform-*.css`） |
| 全树 DOM 钩子计数（>0 → 0 即断） | `.debug/upstream-021/hook-census.mjs` |
| 只比内联 CSS 模块（归一化 CSS-module 哈希） | `.debug/upstream-021/css-only-diff.mjs` |
| 硬编码颜色字面量集合 diff | `.debug/upstream-021/color-literal-diff.mjs` |
| 逐包 `lib/client.js` 归一化 diff | `.debug/upstream-021/pkg-client-diff.mjs` → `pkgdiff/` |
| **官方源码**（升级指南 / 规格 / agent note） | `gh api -H 'Accept: application/vnd.github.raw' <path>?ref=dsh-v0.2.1-rc.2`，落盘 `.debug/upstream-021/gh/` |
| **真机验收**（无 Playwright） | `env -u ELECTRON_RUN_AS_NODE "…\DeepSeek Harness.exe" --remote-debugging-port=9333` + `.debug/upstream-021/dv.mjs {eval,shot,click,clickText,key}` |

> ⚠️ 本机环境自带 `ELECTRON_RUN_AS_NODE=1`，不 `env -u` 掉的话 exe 会按 node 运行并报
> `bad option: --remote-debugging-port`。`raw.githubusercontent.com` 在本机代理下不通（curl 返回 000），
> 一律走 `gh api` 的 raw Accept 头。本机 Playwright 依旧不可用，真机验收全部走 CDP。

---

## 1. 已核实「不需要改」的部分（免得后人重复怀疑）

1. **配色阶梯零变化**：`design-platform.css` 两版**逐字节相同**（19081 B / 4 个选择器 / 382 条声明）；
   全树 `--dsw-*` 声明名两版都是 **404 个，增删各 0**。⇒ 不需要刷新 `.cache/dsh-ref`、不需要跑
   `pnpm gen:palettes`、不需要补覆盖率断言。上一轮（0.2.0）补的 17 个 alias + 8 个字面量 +
   `--dsw-menu-surface-fill` 在 0.2.1 上仍然完整可用。
2. **源码与出厂包一致**：`packages/client/ui-theme/src/styles/design-platform.css` @ tag 与出厂包内联表
   **190 个 token 逐个同名**，文本差异全是构建器把 `rgb()/rgba()` 规范化成 hex，无语义差异。
   `onboarding.css` 两版逐字节相同。⇒ 用出厂包做 diff 是可信的。
3. **没有新的字面量色漏洞**：内联 CSS 与前端包 CSS 的颜色字面量集合**完全相同**（0 新增）。
4. **依赖的 DOM 钩子全部存活**：`data-composer-card` / `data-menu-material` / `data-menu-group-*` /
   `data-phase` / `data-changed-files` / `data-turn-trigger` / `data-presented-file` /
   `data-sidebar-right-panel` / `data-sidebar-right-open` / `data-conversation-scroll` / `data-trigger-menu` /
   `data-overflow` / `data-expanded` / `data-tool` / `data-slot` / `data-dockkit-host` /
   `data-composer-placeholder` / `data-sidebar-collapsed` / `data-windows-titlebar`，以及类名片段
   `headerBlank` / `composerSeat`——**0 个消失**。输入卡（`[data-composer-card]`）的上游规则**逐字节相同**。
5. **注册冲突文案未变**：`locale "…" is already registered`、`theme "…" is already registered`、
   `duplicate … route` 一字未改 ⇒ `src/registration-tolerance.ts` 的 `ALREADY_OWNED` 不用动。
6. **主题服务 API 未变**：`getTheme / setTheme / register / overrideTokens` 签名一致。
7. **桌面壳材质与取色链路未变**：win32 主窗口仍无 `transparent` / `backgroundMaterial`；
   `preload-app.cjs` 仍读 `--dsw-specific-sidebar-fill` + `--dsw-alias-label-primary` 等 6 个 token。
8. **`base.css` 只改了字体**（1292 → 1933 B）：新增 `--dsh-font-family-text-default` /
   `--dsh-font-family-code-default`，并把 `--dsw-font-family` 改成「用户字体列表优先」。插件不消费该变量。

---

## 2. 必须修：`ConfigFormSnapshot.mode` 已删除（P0，已修）

### 2.1 上游做了什么

`fix(web): persist authenticated browser preferences on the Host`（PR #4201 / commit `23c29d06`，
2026-10-09）。官方 agent note（`.agents/notes/implemented/bug-fix/2026-09-15-authenticated-browser-host-preferences.zh.md`）：

> 「镜像的状态空间只有 `idle`、`loading` 与 `ready`，**表单快照不携带 mode**，表单也只有在 Host
> 未注册该 namespace 时才报告 `unavailable`。」
>
> 「**曾考虑的替代方案：保留内存分支的本地性门禁。已否决** —— 浏览器令牌认证已覆盖远程页面的每个
> Host 方法，该门禁保护不了任何东西。」

代码上：`ConfigForm` 构造函数少了 `persistence` 参数，快照初值不再有 `mode`，`derive()` 只写 `status`
与 `writable`。**这是有意删除且官方明确否决了保留**，所以不可能"兼容回 memory 模式"。

### 2.2 断在哪

`src/client/state-sync.ts` 原判据 `status === 'ready' && mode === 'host'` ⇒ 0.2.1 上 `mode` 是
`undefined`，**恒 false**。三个调用点一起失能：不写回 profile、不采纳已存 section、写入直接返回
`'error'`。本机单窗口下几乎无感（localStorage 还在兜底），换窗口 / 重装 profile / 清浏览器存储才暴露。

### 2.3 修法与验收

- `DurableSnapshot.mode` 改为**可选**，语义改为「缺失 = `host`」；判据改为
  `status === 'ready' && mode !== 'memory'`（显式 `memory` 仍不可用，兼容 ≤ 0.1.6 的 `settingsScope` 通道）。
- 测试：`tests/settings-seam.spec.ts` 的 `snapshot shape across DSH versions` 一组 6 条
  （缺 `mode` 可用 / 显式 `memory` 不可用 / 显式 `host` 可用 / `loading`·`unavailable` 恒不可用 /
  0.2.1 形状能读出 section / 带 `memory` 读不出）。
- **真机验收（0.2.1-rc.2 桌面壳，2026-10-17）**：
  1. 修复前：切「地面光斑」开关 → DOM 与 localStorage 都变，`cordis.patch.yml` 的 mtime / md5 **纹丝不动**；
  2. 修复并 `pnpm build` 后：同样操作 → 文件 mtime 由 `Oct 16 20:47` 变为 `Oct 17 23:52`，
     md5 由 `9438253…` 变为 `0fdf9c4…`，`glow: false → true`；
  3. 重启壳后插件状态仍是 `true`（文档被采纳）；再把文档手改为 `false` 重启 → 插件变成 `false`
     并回写 localStorage（**文档胜出**这条语义也一并验了）；
  4. 验收结束已把配置还原，与备份**逐字节一致**。

---

## 3. 元数据与兼容（待发版时一起做）

| 项 | 现状 | 要做 |
|---|---|---|
| devDependencies | 全部钉 `0.2.0-rc.2` | 对齐 `0.2.1-rc.2`；`@deepseek-ai/dsh-client-ui-primitives` 的 `0.2.1-rc.2` 已发布，可一起升 |
| `@deepseek-ai/dsh-invariants` | 仍挂在 devDeps | **删除**——这是补 0.2.0 的作业：`docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants` 的迁移第 3 条明写要从 `package.json` 移除；0.2.1 不再发布该包，我们也没有任何 import |
| `engines.dsh` | **未声明** | 建议补 `"dsh": ">=0.1.5-rc.1"`。`docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh`：兼容判定正从 peer 迁到 `engines.dsh`（有则只认它、忽略 peer；缺失才回落 peer）。我们靠回落"永远兼容"，但回落迟早会消失。注意必须是字符串——`engines` 非对象或 `engines.dsh` 非字符串会被判清单不可读而**直接拒装** |
| `dsh.compatibility` | 只到 `0.2.0-rc.2` | 补 `0.2.1-rc.2`（`dshReleases` + `dshOperations`）。该字段只服务**社区商店**的目录，官方安装器读的是 `engines.dsh` + DSH peer 包名，所以它不影响安装，优先级最低 |
| README「已验证的具体版本」 | 只到 `0.2.0-rc.2` | 发版时补 `0.2.1-rc.2`，并注明「启动级 e2e 未跑（本机 Playwright 不可用），真机验收走桌面壳 + CDP」 |

---

## 4. 视觉面复核：无需改 CSS

| 面 | 实测 | 结论 |
|---|---|---|
| `[data-shell-bottom]` | AppFrame 新增的第二行 + `shell.bottom` 槽；实际高度 **0**（只有 `dsh-experimental-inspector` 会往里注册） | 无影响 |
| `[data-slot="conversation.chat.flow"]` | 是 `.column[data-chat-flow]` 的**子节点**，不是包在 column 外面 | 我们基于 `[data-conversation-scroll]` 的选择器不受影响 |
| 菜单材质 | 模型菜单仍是 `data-menu-material="translucent"`，表面 `bg: transparent / backdrop: none`，材质画在 `::before`，填充来自我们覆写的 token | 推论三的配方仍成立 |
| 插件页改版（tabs / installedPanel / addMenu） | 皮肤下正常；页头没被卡片化误命中 | 无动作 |
| 设置页（新增字号行、模型页新行） | 玻璃来自 `[data-dsh-glass-settings]` 的 token remap，新行自动继承 | 无动作 |
| 轨迹视图（整包重写） | 全页视图正常；`role="toolbar"` 与 `section[aria-label="Trajectory timeline"]` 两个锚点仍在 | 无动作 |
| 聊天流新动效（`data-chat-motion` / `data-input-fold`） | 上游自带 `prefers-reduced-motion` 分支，插件不加动画 | 无动作 |
| 气泡圆角 `999px → var(--dsw-radius-sm)`、文件卡 `xl → lg`、日程/计划卡改 token | 都是跟随 token 的上游规范化 | 无动作 |
| 新增 `dsh-client-ui-sidebar-terminal`（右栏「新标签页」引导卡 + 终端 pane） | 卡片用 `--dsw-alias-bg-layer-1` 实色；右栏在 float 模式下本就是实色容器 | 结构上不是新缺口，启用终端后目视一次即可 |

### 4.1 一处**既有**偏离（不是 0.2.1 引入，可选对齐）

`docs/ui-radius.zh.md` 规定主容器（**对话输入框**、对话框、主面板）= **R28 = `--dsw-radius-panel`**，
`docs/web-styling.zh.md` 又要求「不新增 10px、14px、18px、24px 等局部数值」。而
`src/client/glass/glass.module.css` 给 `[data-composer-card]` 写死 `border-radius: 24px`（上游用
`var(--dsw-radius-panel)`，**0.2.0 起就已是 28px**）⇒ 我们的输入卡比 stock 紧 4px。

改成 `var(--dsw-radius-panel)` 更贴官方尺度，但会动视觉与 `tests/glass-css.spec.ts` 的断言，
且 0.2.1 之前一直是这样，属「口径对齐」而非缺陷，故本轮不动。

---

## 5. 流程改进（升代 SOP）

官方仓库有 `docs/upgrade-guide/<version>/<topic>/guide.zh.md`，**每个破坏性变更一条**，
比 git log（v0.2.0 → v0.2.1 之间 **1925 个提交**）好读得多。升代第一步应该是：

1. `gh api repos/deepseek-ai/deepseek-harness/contents/docs/upgrade-guide?ref=dsh-v<ver>` 找到最新版本目录；
2. 逐条读 `guide.zh.md`，对照本插件用到的面；
3. 再做出厂包级 diff（本文件 §0 那套脚本）。

本轮就是靠它捞到 §3 里的 `engines.dsh` 与 `dsh-invariants` 两件事。

---

## 6. 仍未做

1. §3 的元数据四件（devDeps / invariants / `engines.dsh` / `dsh.compatibility`）+ README 行。
2. §4.1 的圆角对齐（可选）。
3. `CHANGELOG.md` 的 `[Unreleased]` 条目——发版前写，条目里要提「0.2.1 测试期内改过的设置，
   升级后第一次启动会回到 profile 里最后保存的值」（断链期间只写进 localStorage 的改动会被文档覆盖）。
