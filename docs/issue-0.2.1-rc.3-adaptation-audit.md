# DSH `0.2.1-rc.2 → 0.2.1-rc.3` 适配审计（2026-10-24）

- 状态：**审计完成 + 真机实测通过，无需改码**。唯一建议改动是**元数据跟版**（§6.1）与一条**可选**的修饰
  （§6.2）。本文件只记录结论与证据，不涉及任何代码改动。
- 触发：上游 `V0.2.1-rc.3` 发布，本机已升级（见 §1）。要回答的问题是「这次升级有没有需要本插件适配或更新的地方」。
- 取证脚本与截图：`.debug/issue-0.2.1-rc.3/`（包清单/哈希/属性/变量 diff）、
  `.debug/real-verify/`（CDP 实测：`menu-sidebar-rc3.png`、`menu-views-rc3.png`、`menu-guide-rc3.png`、
  `settings-catppuccin-rc3.png`）。两者都不入库。

## 1. 版本口径

| 对象 | 值 | 证据 |
|---|---|---|
| 桌面壳二进制 | `D:\PROGRAM\DeepSeek Harness`（10-23 16:00 更新） | UA：`@deepseek-ai/dsh-desktop/0.2.1-rc.3` |
| 壳内 harness 运行时 | **`0.2.1-rc.3`** | `resources/app.asar` 内 `0.2.1-rc.3` 出现 4623 次、`rc.2` 为 **0** |
| CLI 运行时 | `%APPDATA%\DSH\data\versions\0.2.1-rc.3`（10-24 13:52 装完） | `manager.log`「0.2.1-rc.3 安装完成」 |
| 旧包 | `app.asar.bak-20261017-221728` 已被升级流程清掉 | 目录列表 |

**对比基线**：`data/versions/` 下 `0.2.1-rc.2` vs `0.2.1-rc.3` 的**全量 306 个 `@deepseek-ai/*` 包**逐文件比对
（`diff -rq` + 字符串/属性/变量集合比对），不是只挑几个包看。

## 2. 结论（一句话）

rc.3 只加了一件事——**三个区域的「More」菜单（折叠入口 + 浏览插件/创建插件）+ 会话视图标签的折叠与换行**。
它**没有**碰 token 表、`data-*` 钩子、`--dsh-*` 变量、class 后缀、dock 结构，也没有改主题/语言/设置分区的注册 API。
所以：**不需要适配性改码**；要做的是「真机验收（本节已做完）+ 元数据跟版」。

## 3. 差异清单（全量比对里真正有行为意义的）

| 包 | 变化 | 对我们的影响 |
|---|---|---|
| `dsh-client-ui-entry-customization`（**新增**） | 三个 More 菜单；注册 3 个 `list` 槽：`sidebar.panellist.actions`、`conversation.session.header.views.actions`、`sidebar.right.tab.guide.actions` | 新表面，见 §5 |
| `dsh-client-ui-conversation` | 视图标签行：`.tabs` 加 `flex-wrap:wrap`、`gap` 36 → `16px 20px`、`width/min-width/box-sizing`，`tab` 加 `min-height:25px`，新增 `.viewTabs` 内层容器、`.viewsMore` 22×22 按钮、`.viewTabActive::after` 2px 下划线、菜单 `.viewsMoreMenu{width:288px}`；新增 `view-pins.d.ts` | 顶栏几何 + 一个新按钮 |
| `dsh-client-ui-sidebar` | 面板列表末尾加 More 按钮（`.moreAnchor/.moreMenu`，菜单 288px）；新增 `panel-pins.d.ts`；`setPinned` / `trackEntryClick` | 仅新增按钮 |
| `dsh-client-ui-sidebar-right` | 指南页加「更多工具」行 + 菜单（`max-content`，≤480px）；`GuideMoreIcon` 为**22px 版权 SVG** | 见 §6.2 |
| `dsh-client-ui-web-app`（`cordis.patch.yml`） | 只加一行：挂载 `entry-customization` | 多一个默认插件 |
| `dsh-client-ui-theme` | **`lib/client.js` 字节级一致** | `--dsw-*` 全表不变 |
| 前端 `dsh-web-frontend/dist` | `index-*.css` 仍是 **695 条规则**，逐条比对**只有 Tooltip 变**（hash 改名、`align-items:safe center`、`max-width:min(50vw,…)`、`data-side=left`）；`data-*` / token 不变 | 无 |
| 契约（`.d.ts`） | 全部是**加法**：3 个新槽 + 3 个 owner props、`pluginNavigation.openList()`、`DraftInitializationOptions.whenDraftExists`、`MessageSubmission.newSession/agentPreset` | 我们不消费这些类型 |

被 `diff -rq` 报出来的其余条目：`package.json` 版本号、README、`node_modules` 目录布局差异（pnpm 结构）、
以及 LLM/账号类包（`dsh-llm-deepseek*` 的 catalog/listing 重构）——与前端外观无关。

## 4. 明确**没有**变的（也就是「不用做」的部分）

| 判据 | 结果 |
|---|---|
| `--dsw-*` token 全表 | `dsh-client-ui-theme/lib/client.js` 两版字节一致 ⇒ **不用重跑 `gen:palettes`** |
| `--dsh-*` 自有变量 | 76 个 → 76 个，**名字集合完全相同** |
| `data-*` DOM 钩子（63 个 client 包） | **0 增 0 删**（含 `data-menu-material`、`data-composer-card`、`data-composer-dock`、`data-conversation-tabs`、`data-sidebar-right-panel`） |
| 我们依赖的 14 个 class 后缀 | `centerCol` / `composerSeat` / `headerBlank` / `sidebarCol` / `newSession` / `iconButton` / `searchButton` / `dropdown` / `dock` … 出现次数**逐项相同** |
| 前端 `<header>` 语义 | 仍是「会话顶栏 + 页面 head」两个，标签行是顶栏里的 div，不新增 `<header>` |
| composer dock（#28/#29 前提） | `data-composer-dock` + `conversation.composer.dock` 的 JSX 与 rc.2 **逐字相同** |
| 菜单实现 | 三个新菜单都走 primitives `Menu`（`data-menu-material="translucent"` + `portal` + `data-menu-backing`）与 `MenuItemButton` |

## 5. 真机实测（Mocha + 云母，1280×822 @1.5，壳 `0.2.1-rc.3`）

### 5.1 基础面

| 项 | 实测 |
|---|---|
| boot | `resolved`；`data-dsh-glass` 挂上，`data-ds-dark-theme` 在 |
| 顶栏玻璃卡 | `top 52 / bottom 136.3 / h 84.3 / left 352 / w 856`——与 2026-10-21 的 856、352 一致 |
| 标签行 | 4 个视图（对话/轨迹/上下文/编队）+ More，`h 25`、单行（只有一个 top 值）、`gap 16px 20px`、`flex-wrap:wrap` |
| 激活下划线 | `::after` = `rgb(137,180,250)`（Mocha #89b4fa，走 `state-business-primary`）、`2px`、`bottom:-1px` |
| 设置分区 | 设置 → 侧栏第 7 项 `Catppuccin`，页面正常；`data-dsh-glass-settings` **命中 1 个**（`AnXs9G_overlay`），磨砂设置卡生效 |

### 5.2 三个新 More 菜单（全部自动继承玻璃）

| 菜单 | 位置/尺寸 | 填充 | 材质层 |
|---|---|---|---|
| 侧栏面板列表「更多」 | `288×76 @ (37,321)` | `color-mix(#181825 64%×0.4, transparent)` | `blur(5px)` |
| 会话视图「更多会话视图」 | `288×76 @ (610,126)` | 同上 | `blur(5px)` |
| 右栏「更多工具」 | `380×76 @ (802,644)` | 同上 | `blur(5px)` |

三点确认：① 菜单根 `border-radius` = `14px`（我们的规则命中）；② 行 `role=menuitem` 圆角 8px；
③ **`blur(5px)` 与顶栏卡、输入卡完全同值**（`--dsh-glass-blur` 本机 = 5px）⇒ 新表面与既有玻璃**同源**，无质感断点。

### 5.3 原以为会踩的坑：`-95px / 107px` 补偿 **不**依赖顶栏高度

担心点：`[data-phase=active] [data-conversation-scroll]{margin-top:-95px;padding-top:107px}` 是写字面常量，
rc.3 让标签行可以换行 ⇒ 顶栏变高后补偿会不会错位。

实测做法：注入 `[class*=tabs]{min-height:70px}` 把顶栏从 `84.3` 顶到 `129.3`（+45px），再量：

```
scroll.top − (header.bottom − 95)      = 0.0
scroll.top + 107 − (header.bottom + 12) = 0.0
```

即：滚动盒的常规流位置**本来就跟着顶栏底边走**，`-95` 只是把它上提、`107` 再加回来，**与顶栏高度无关**。
换行不会破坏这条关系。另外按当前视图数（4 个，标签区宽 213px / 预算 ≈820px）**根本换不了行**，
要 ~20 个视图才可能折行 ⇒ 该风险**不成立**，不改代码。

## 6. 需要跟进的（按优先级）

### 6.1 P1｜元数据跟版（属「更新」，不是「适配」）

`package.json` 的 `dsh.compatibility.dshReleases` / `dshOperations` 最高只到 `0.2.1-rc.2`，
`devDependencies` 也钉在 `0.2.1-rc.2`。

- 按 `AGENTS.md` 的规矩：**先实测（本次 §5 已完成）再把 `0.2.1-rc.3` 标 `compatible`**，别为了凑商铺窗口凭空写。
- 顺带用 `.debug/dsh-store/verify-manifest.mjs` 复算商铺兼容窗口（窗口随 dist-tag 漂移）。
- `devDependencies` 跟到 rc.3，让 `typecheck` 对着新契约（3 个新槽 / 新 owner props）跑一遍——本次只是**加法**，
  预期零错误，但需要一次确认。

### 6.2 P2｜右栏「更多工具」图标是硬编码颜色（可选修饰）

`GuideMoreIcon` 的 SVG 直接写 `stroke="#A6B2C7"`——rc.3 里**唯一不随 token 走的颜色**。
实测 `getComputedStyle(svg).stroke === 'rgb(166, 178, 199)'`（尺寸 22×22）。

影响：四风味下都是同一支灰蓝，Mocha 下尚可，Latte（浅色）下与 `label-secondary` 略偏。

修法（如果要做，一行 CSS，不动上游）：`fill/stroke: currentColor` 覆盖表现属性即可；
注意 CSS 声明**优先于** SVG 表现属性，所以不需要 `!important`。

> **状态（2026-10-24 维护者裁定）：只记录，不实施，下次再评估。**
> 含义有两层：① 本次不发版、不加这条 CSS；② 下个补丁/特性版动工前，先由维护者判定「做 / 不做」——
> 与其他未批准项同一规矩，#28 B 的先例（`docs/issue-28-fused-composer-plan.md`）适用。
> 评估时要一并回答的问题：`GuideMoreIcon` 是上游「设计稿授权」的 22px 版画（注释明写
> *designer-supplied artwork … authored size and ink*），把它改成 `currentColor` 等于**推翻上游的设计意图**；
> 所以更可能的结论是「保留原色」，而不是「改」。真要改，理由必须是四风味下可复核的对比度/观感证据，
> 不能只是「它没跟 token」。

### 6.3 P3｜我们的顶栏宽度上限改变了「折叠阈值」

我们把玻璃顶栏钳到「阅读列 + 32px」（默认 856px），原生是整列（本机 ≈1000px）。上游按**宽度预算**决定
把哪些视图折进 More ⇒ **同窗口下我们会比原生更早**折叠。

这是框语言的既定副作用（不是 bug）：想要原生折叠行为，只能放弃顶栏与输入卡的等宽关系。记录在案，暂不动。

## 7. 环境提示（与 rc.3 无关，但阻塞真机验收）

本次启动壳时 boot 直接失败：

```
Error invoking remote method 'dsh-desktop:boot': Error: UNKNOWN: unknown error,
realpath 'C:\Users\LeGo\.dsh\profiles\desktop\node_modules\@nonamelego\dsh-catppuccin'
```

`@nonamelego/dsh-catppuccin` 在 desktop profile 里是 `link:D:\Vibe-Coding\dsh-catppuccin`。实测：

- 原来的链接（Git Bash 建的、目标写成 `/d/Vibe-Coding/...`）→ Node `realpath` 报 `UNKNOWN`；
- 重建成 **Junction** → 同样 `UNKNOWN`（.NET 报「包含不受信任的装入点」）；
- 重建成 **SymbolicLink** → 同样 `UNKNOWN`；
- 连**同盘新建**的符号链接也复现 `UNKNOWN`，而 pnpm 自己的 `.pnpm` junction 正常。

⇒ 在**本机当前状态**下，指向仓库的链接无法被 Electron/Node 解析，壳会**整页停在 Loading plugins…**。
**临时处置**：把插件装成**实体副本**（`package.json` / `lib` / `themes` / `cordis.patch.yml` / `icon.png` /
`README.md` / `LICENSE`，960 KB），壳即正常 boot（本次全部实测都跑在副本上）。

这带来一个**开发循环的变化**：`pnpm build` **不再自动生效**，每次改完要同步一次：

```bash
cd /d/Vibe-Coding/dsh-catppuccin && pnpm build && \
  cp -r package.json cordis.patch.yml icon.png README.md LICENSE lib themes \
  ~/.dsh/profiles/desktop/node_modules/@nonamelego/dsh-catppuccin/
```

（根因未定论：`fsutil behavior query SymlinkEvaluation` 显示本地↔本地是**启用**的，所以不像跨卷策略；
更像是这台机器上有东西在拦 reparse 点的遍历。若要恢复 `link:` 开发循环，需要单独排查，不属本次范围。）

## 8. 待办

1. `package.json`：`dsh.compatibility` 加 `0.2.1-rc.3: compatible` + `dshOperations`（install/start 记为 passed，
   依据 §5）——**已于 2026-10-24 完成**，见 §9。
2. `devDependencies` 六个 `@deepseek-ai/*` 跟到 rc.3，跑 `pnpm typecheck && pnpm test`——**未做**（要 `pnpm install`，
   会往 D: 写包，等维护者点头）。
3. `.debug/dsh-store/verify-manifest.mjs` 复算商铺窗口——**已完成**，见 §9。
4. （可选）`GuideMoreIcon` 的 `stroke` 归 `currentColor` + 一条 CSS 断言——**已记录、未实施，下次再评估**
   （维护者 2026-10-24 裁定，见 §6.2 的状态块；动工前必须先问「做 / 不做」）。
5. README / CHANGELOG 提一句「已验证 0.2.1-rc.3」（随下次发版）。
6. 环境侧：决定是留实体副本（简单、但每次要同步）还是排查链接解析问题（恢复 `link:` 开发循环）。

## 9. 发版判断（2026-10-24，维护者提问触发）

**结论：不为这次适配单独发版。**

理由：

1. **兼容声明不靠 npm 分发。** `dsh.compatibility` 是商铺专有字段，商铺每 8 小时从**默认分支**复检一次并刷新
   元数据 ⇒ 声明随 `git push` 生效，与是否 `npm publish` 无关。
2. **本次改动全在开发面。** `devDependencies` 跟版只影响本仓库的 typecheck 基线；`engines` 与运行时代码未动。
3. **唯一用户可见的是一条可选修饰**（§6.2 的图标 `currentColor`），一行 CSS，不值得单独走一遍
   beta → latest（含预览图重拍 + 真机验收 + CHANGELOG 落节）。
4. `0.6.4` 刚于 2026-10-21 转正进 `latest`，短期再版只会摊薄版本密度。

**商铺窗口实测**（`.debug/dsh-store/verify-manifest.mjs`，target = `0.2.1-rc.3`）：

```
窗口 = 0.2.1-rc.1, 0.2.1-rc.2, 0.2.1-rc.3
窗口内命中 compatible: 0.2.1-rc.2, 0.2.1-rc.3 ✅
```

即：**不跟版也不会掉出窗口**（`0.2.1-rc.2` 本来就在窗口里）；跟版的意义是**维持**命中——上游再发一版
（`0.2.1-rc.4`）就会把 `rc.2` 挤出三版窗口，那时若没有 `rc.3` 这条，窗口内命中为 0。

**已落地**：`package.json` 的 `dshReleases` / `dshOperations` 各加 `0.2.1-rc.3`（install/start = `passed`，
依据 §5 的真机 boot + 设置分区 + 三个菜单实测）。无版本号变更、无 CHANGELOG 条目、未提交、未推送。
