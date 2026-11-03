# DSH `0.2.1-rc.3 → 0.2.1-rc.5` 适配审计（2026-11-03）

- 状态：**审计完成 + 真机实测通过，不需要改任何 CSS / 代码**。需要动的只有**元数据跟版**（§6.1，P0）
  与两条文档跟进（§6.3 / §6.4）。本文件只记录结论与证据。
- 触发：上游连续发布 `V0.2.1-rc.4`（2026-10-28）与 `V0.2.1-rc.5`（2026-10-30），本机官方壳已升级到
  `0.2.1-rc.5`（§1）。要回答的问题是「这次升级有没有需要本插件适配或更新的地方」。
- 取证：`.debug/issue-0.2.1-rc.5/`（`state-welcome.png`、`session-scrolled-clean-rc5.png`、
  `settings-catppuccin-rc5.png`）；探针 `.debug/real-verify/cdp.mjs`。均不入库。

## 1. 版本口径

| 对象 | 值 | 证据 |
|---|---|---|
| 桌面壳 UA | `@deepseek-ai/dsh-desktop/0.2.1-rc.5`（Electron 44.7.0 / Chrome 152） | CDP `navigator.userAgent` |
| 壳内 harness 运行时 | **`0.2.1-rc.5`** | `app.asar` 内 `0.2.1-rc.5` 出现 **4623** 次、`rc.3` 为 **0** |
| CLI 运行时 | `%APPDATA%\DSH\data\versions\0.2.1-rc.5`（11-01 21:33 装完） | 目录列表 |
| 对比基线 | `data/versions/0.2.1-rc.3` vs `0.2.1-rc.5`，全量 **306** 个 `@deepseek-ai/*` 包 | `diff -rq`，327 行输出 |

**基线选择说明**：上一轮审计（`docs/issue-0.2.1-rc.3-adaptation-audit.md`）的基线是 rc.3，本轮沿用，
覆盖 rc.4 + rc.5 两次发布。

## 2. 结论（一句话）

**rc.4 与 rc.5 都没有碰任何我们依赖的契约**——`--dsw-*` token 表、前端构建产物、`data-*` 钩子、
`--dsh-*` 变量、class 后缀**逐项不变**；变化集中在「思考内容展示」（rc.5）与「ACP 诊断输出」（rc.4），
都是上游内部行为。所以**不需要适配性改码**。

真正需要动的是一件**与 rc.5 无关、但被它触发的事**：商铺兼容窗口已经**掉出**（§6.1，P0）。

## 3. 差异清单（327 行 diff 里真正有行为意义的）

`diff -rq` 报出的 327 行中，**296 行是各包 `package.json` 的版本号**，另有 5 组 README / i18n
文档差异。实质代码差异只有 7 个 `client.js` + 3 个 `index.js` + 4 个 `.d.ts`：

| 包 | 变化 | 对我们的影响 |
|---|---|---|
| `dsh-client-ui-chat` | **新增 `reasoning-text.js`**：`reasoningText()` 剥离推理流里的 `<signature>…</signature>` 块（含流式半截 `<signature` 的兜底）；`ReasoningRow` 改用 `rawText` 计算 `{text, hidden}`，**`hidden` 时 `return null`** | 无。只改了文本准备与早退，**没有新增/删除 class，没有改 DOM 结构** |
| `dsh-client-ui-chat`（契约） | `ReasoningBodyOwnerProps` 新增 `rawText`；**`ReasoningContentInput` 不再 `extends ReasoningBodyOwnerProps`**，改为显式 `text` + `running` | 无（我们不注册 reasoning slot）。⚠️ 对**替代理 reasoning body 的第三方插件是破坏性改名** |
| `dsh-client-ui-conversation` | 视图标签新增 `ViewTabLabel` + `labelNeedsTooltip()`：按 **`.tabLabel` 的 88px 上限**估算宽度（全角 13px / 半角 7px），只在预计溢出时启用 Tooltip；**删除 locale key `session.moreViewsCurrent`**，「更多视图」按钮标题统一为 `更多会话视图` | 无。`.tabLabel` 的 `max-width: 88px` 真机实测仍在，我们没覆盖它 |
| `dsh-llm-deepseek-account` | 一处 `console.info` → `console.error`（即 rc.4 的「ACP 模式诊断混入 stdout」修复） | 间接提示，见 §6.5 |
| `dsh-mcp-client` | `resources/list` 与 `resources/templates/list` 增加能力探测（无 `resources` 能力时返回空数组） | 无 |
| `dsh-client-ui-settings-general` / `-account` / `dsh-client-modules` | 纯版本号字符串 | 无 |
| `dsh-cordis-client-runner` | slot 的 `source` 行号锚点（`slots.ts:441→447` 等）+ ownerProps 文档文本 | 无 |
| `dsh-experimental-client-ui-cot-translation` | 仅注释（`original` → `display-ready`） | 无 |

### 3.1 上游发布说明

- `dsh-v0.2.1-rc.4`：**修复 ACP 模式下诊断输出混入 stdout**（@LegGasai, @tianyicui）。
- `dsh-v0.2.1-rc.5`：**优化对话中思考内容的展示效果**（@LegGasai）。

与代码 diff 完全对得上。视图标签 tooltip 与 mcp-client 能力探测未单列，属同批未记条目。

## 4. 明确**没有**变的（「不用做」的部分，硬证据）

| 判据 | 结果 |
|---|---|
| `dsh-client-ui-theme/lib/client.js` | **md5 完全相同**（`16782f2a…`，120614 字节）⇒ `--dsw-*` 全表不变，**不用重跑 `gen:palettes`** |
| 前端构建产物 `dsh-web-frontend/dist/assets` | `index-BNyAYEM7.css` / `index-BXV-oxvX.js` / `vendor-*` **hash 文件名与 md5 全同** ⇒ 宿主 CSS 规则零变化，所有 CSS module 类名未变 |
| `--dsh-*` 自有变量 | 76 → **76**，名字集合 `diff` 为空 |
| `data-*` DOM 钩子 | 660 → **660**，集合 `diff` 为空（含 `data-menu-material`、`data-composer-card`、`data-composer-dock`、`data-reader-reasoning-card`、`data-sidebar-right-panel`） |
| 我们依赖的 8 个 class 后缀 | `centerCol` 7/7、`composerSeat` 12/12、`headerBlank` 5/5、`sidebarCol` 17/17、`newSession` 56/56、`iconButton` 87/87、`searchButton` 11/11、`dock` 573/573，**逐项相同** |
| 变化的两项 | `tabLabel` 4→**5**（新组件里多一次引用）、`moreViews` 6→**3**（删 locale key + 简化调用）——都属新增用法，不是改名 |
| `dsh-web-app/cordis.patch.yml` | **字节一致** |
| `@deepseek-ai/*` 包数量 | 306 → **306**，**无新增/删除包** |
| 我们注册的 API | `settings.section` slot、`configForms` / `settingsScope` 注入 —— 对应包（`dsh-client-ui-settings`、`dsh-settings`、`dsh-client-ui-slots`）**只有 package.json 变** |

## 5. 真机实测（Mocha + 云母 blur 5 / frost 20 / 亮度 50，1280×822 @1.5，壳 `0.2.1-rc.5`）

### 5.1 基础面

| 项 | 实测 |
|---|---|
| boot | 正常，`html[data-dsh-glass]` 等在位，`data-dsh-*` 钩子共 **12** 个 |
| 风味 | `--dsw-static-blue-500` = `#89b4fa`（Mocha）✅ |
| 玻璃变量 | `--dsh-glass-blur: 5px`、`--dsh-glass-gap: 12px`、`--dsh-glass-glow-strength: 1`、`--dsh-glass-glow-size: 1`、`--dsh-glass-ambience: calc(1 - 0 - 0)` ✅（#31/#32 两轮旋钮都在） |
| 顶栏玻璃卡 | `top 52 / bottom 136.3 / h 84.3 / left 352.2 / w 851`，`blur(5px)`，圆角 20px —— 与 10-21 / 10-24 的基线一致（宽 856→851 是滚动条出现的 5px，非回归） |
| 视图标签 | 仍是 4 个（对话 / 轨迹 / 上下文 / 编队）+ More，单行，`.tabLabel` `max-width: 88px` 生效，实测标签宽 26–39px ⇒ **tooltip 恒不启用**（上游新逻辑） |
| 滚动补偿 | `margin-top: -95px; padding-top: 107px` **未变**（rc.3 已验证与顶栏高度无关，本次照旧） |
| 设置分区 | 设置 → 侧栏第 9 项 `Catppuccin`，页面正常；`data-dsh-glass-settings` 命中 **1** 个 |

### 5.2 玻璃面（#28/#29/#22/#33/#34 的既有承诺）

| 面 | 实测 |
|---|---|
| `[data-composer-card]` | 本体 `background: transparent` + `backdrop-filter: none`，材质在 `::before`（`blur(5px)`），圆角 24px ✅ 推论二仍成立 |
| `[data-composer-dock]` | 同上走 `::before`（`blur(5px)`），394×26 @ (577,792) ✅ #28/#29 未回退 |
| 菜单 `[data-menu-material=translucent]` | 207×324 @ (68,401)，**本体 `backdrop-filter: none`**、圆角 14px ✅ 推论三仍成立（材质在表面自带的 `--dsw-menu-surface-fill` / `--dsw-menu-backdrop-filter`） |
| 设置壳 `[role=presentation] > [role=dialog][aria-modal]` | 801×703 @ (237,59)，`backdrop-filter: none`、`position: relative` ✅ #33 未被返还；#34 的座位守卫仍在（`glass.module.css` 里已是 `[role='presentation'] >` 形态） |
| 会话操作菜单 | 「置顶 / 重命名 / 分叉 / 归档 / 复制 Session ID」整块正常弹出，无平移、无裁切 |
| 滚动穿透 | 顶栏与输入卡背板都能挡住滚动正文，`session-scrolled-clean-rc5.png` 无肉眼缺陷 |

### 5.3 思考内容是本次唯一有感的视觉变化，但不涉样式

rc.5 的 `reasoningText()` 会在显示层剥掉 `<signature>` 块，且**全空时整块不渲染**（`hidden → null`）。
对我们的意义是**正向**：`[data-reader-reasoning-card]` 那套圆角/底色规则不会画出「空壳卡片」。
反之若上游哪天改成渲染空容器，才会有残留——本轮**不需要**任何预防性改动。

## 6. 需要跟进的（按优先级）

### 6.1 P0｜商铺兼容窗口**已经掉出**（必须马上处理）

用 `.debug/dsh-store/verify-manifest.mjs` 复算（上游当前 dist-tag：`latest=0.2.1-rc.5`、
`alpha=0.2.2-alpha.2`、`next=0.2.1-rc.5`）：

```
窗口 = 0.2.1-rc.4, 0.2.1-rc.5, 0.2.2-alpha.2 (target 0.2.2-alpha.2)
窗口内命中 compatible: ❌ 无一命中
```

`package.json` 的 `dshReleases` 最高只到 **`0.2.1-rc.3`**，而窗口已前移到 rc.4/rc.5/0.2.2-alpha.2。

**这正是 rc.3 审计 §9 写下的预警**（「上游再发一版 rc.4 就会把 rc.2 挤出三版窗口」），现在发生了，
而且比预期更早被 alpha 通道推高：`dsh-release-policy.js` 的 target 取 `latest/next/alpha` 里**最高**的
受支持版本 ⇒ **上游每发一个 `0.2.2-alpha.*`，窗口锚点就抬一次**，rc 线会被更快挤出。

**动作**（本轮 §5 已实测通过，符合 AGENTS.md「先实测再标 compatible」）：

```json
"dshReleases": { …, "0.2.1-rc.3": "compatible", "0.2.1-rc.4": "compatible", "0.2.1-rc.5": "compatible" },
"dshOperations": { …, "0.2.1-rc.4": { "install": "passed", "start": "passed", "uninstall": "unknown", "rollback": "unknown" },
                        "0.2.1-rc.5": { "install": "passed", "start": "passed", "uninstall": "unknown", "rollback": "unknown" } }
```

⚠️ rc.4 本机**没装过**（`data/versions/` 只有 rc.3 / rc.5）。要么补一次 rc.4 真机验收再标，要么
**只标 rc.5** —— 窗口内命中 1 条即可通过，别为了填满窗口凭猜想写 `passed`。

### 6.2 P1｜`devDependencies` 从 `rc.2` 跟到 `rc.5`

12 个 `@deepseek-ai/*` 仍钉 `0.2.1-rc.2`。本次契约有**破坏性变更**（`ReasoningContentInput` 不再继承
`ReasoningBodyOwnerProps`），若哪天我们扩展 reasoning slot，typecheck 必须对着新契约跑。

代价：`pnpm install` 会往 D: 写包（当前 D: 余量紧），**需要维护者点头**后才动。

### 6.3 P2｜README 的「已验证的具体版本」表停在 `0.2.1-rc.2`

`README.md:343` 那格的最后一次真机验收写的是 `0.2.1-rc.2`，`package.json` 却已声明到 rc.3。
建议随下次发版把 rc.3 / rc.5 一行补上（本轮证据即 §5），避免「声明 ≥ 文档」的不一致。

### 6.4 P3｜CHANGELOG 不需要为本次开节

rc.4/rc.5 零适配 ⇒ 无用户可见变化。若做 §6.1，按规矩记一条 `Changed`（「声明兼容 0.2.1-rc.5」）即可，
不必单独发版 —— 商铺每 8 小时从默认分支复检，声明随 `git push` 生效。

### 6.5 P3｜插件侧的 `console.info`（源自 rc.4 的修复逻辑）—— **已处理**

rc.4 修的是上游「诊断混入 stdout」；同一个坑插件侧也有：`src/migrate-legacy.ts` 原本在迁移成功后
`console.info` 一行（走 stdout）。

**核实过的实际可达性**（结论比我最初估计的弱，三重门叠加）：

| 门槛 | 实况 |
|---|---|
| 得是 `dsh --profile acp` | ACP 是**独立 profile**，stdio 上跑 JSON-RPC（`dsh-acp-app` 的 `acpAppStartup` 服务接管 stdio） |
| 插件得装进 acp profile | 本插件 `package.json` 只声明 `profiles: ["web","desktop"]` ⇒ **默认进不去** |
| 还得撞上旧状态文件迁移成功那一次 | `~/.dsh/catppuccin-state.json` 存在且未迁移，会话内最多一次 |

另外确认宿主**没有**劫持 `console`（`grep globalThis.console =` 空），所以 `console.info` 确实写 stdout。

**处置（2026-11-03，维护者确认）**：删掉成功日志，失败路径保留 `console.warn`（stderr）。
删而不是改 `warn`，是因为 `tests/migrate-legacy.spec.ts:132` 的护栏是
`expect(warn).not.toHaveBeenCalled()`（验证「没有假失败」）——成功路径也打 warn 会让这条断言失去意义。
迁移结果可从 settings 文档本身观察，删除不损失诊断。全量测试 403/403 通过。

## 7. 待办

1. ✅ **P0** `package.json` 加 `0.2.1-rc.5` 到 `dshReleases` / `dshOperations`；`verify-manifest.mjs`
   复算窗口命中 `0.2.1-rc.5` ✅（**2026-11-03 完成**）。
2. **P1 未做**：`devDependencies` 跟到 rc.5 + `pnpm typecheck && pnpm test`（需 `pnpm install`，等点头）。
3. ✅ **P2** README 已验证版本表补 rc.3 / rc.5；顺带修正「只声明三条」那句已 drift 的描述
   （**2026-11-03 完成**）。
4. ✅ **P3** `migrate-legacy.ts` 的成功日志已删（**2026-11-03 完成**）。
5. 观察项（不改）：视图标签 tooltip 的 88px 阈值上游写死在客户端，与我们顶栏宽度上限（856px）无关；
   实测标签宽 26–39px，离 88 很远，暂不成立。
6. 观察项（不改）：**商铺窗口会持续被 alpha 通道抬高**。`dsh-release-policy.js` 的 target 取
   `latest` / `next` / `alpha` 里版本号最高的受支持版本，所以上游每发一个 `0.2.2-alpha.*`，
   三版窗口就前移一格；等 `rc.5` 被挤出（窗口变成 `alpha.2 / alpha.3 / alpha.4`）时必须再做一次
   跟版，届时要不要给 `0.2.2-alpha.*` 做真机验收由维护者定。
