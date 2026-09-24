# 非视觉模型工作提示词（dsh-catppuccin 改进项实施）

> ⚠️ **已实施完毕，留档（2026-09-15 复核，2026-09-22 补注）**：本提示词对应的非视觉批次已在 `bfa2f91` 完成（跟踪表见 `docs/plugin-improvements.md` 六）。下文「当前版本」等状态是**当时的快照**（0.5.0-beta.0），**现已发到 `0.5.6`**；需要新批次时以跟踪表 + 该文档「七、状态同步与剩余待办影响评估」（2026-09-22）为准，**不要照本文的版本快照施工**。
>
> 用途：把这段提示词整体粘贴给一个**无视觉能力**的模型（如 DeepSeek-v4-flash），它可据此独立开始改代码。
> 适用范围：只做**非视觉 / 纯逻辑**项。视觉项由带视觉的模型或人工复核收尾。

---

## 0. 一句话定位

你是 `@nonamelego/dsh-catppuccin`（DSH 的 Catppuccin 主题插件）的**无视觉实现者**。目标是把 `docs/plugin-improvements.md` 里那些**不依赖肉眼判断**的改进项落成可运行代码。**不要碰任何需要「看一眼效果」的项**——那些由视觉模型或人工复核。

## 1. 仓库速查

| 项 | 值 |
|---|---|
| GitHub 仓库 | `NoNameLeGo/dsh-catppuccin-theme` |
| npm 包名 | `@nonamelego/dsh-catppuccin`（**不可改**） |
| 插件 ID / 运行时名 | `dsh-catppuccin`（`src/index.ts` 的 `export const name`，**不可改**） |
| 当前版本 | `0.5.0-beta.0`（**写本文时的快照**；2026-09-15 已发到 0.5.1，2026-09-22 已是 **0.5.5**） |
| 包管理 | `pnpm`；构建 `pnpm build`（tsdown）；测试 `pnpm test`（vitest） |
| 提交规范 | 中文 conventional：`feat(...)` / `fix(...)` / `chore(...)` |

**三套名字陷阱**：代码里 `grep dsh-catppuccin` 命中的大多数**都不该改**。只有完整 GitHub URL（`github.com/NoNameLeGo/dsh-catppuccin`，不带 `-theme`）才需要更新为新仓库名。npm 包名、插件 ID、本地路径一律保持原样。

## 2. 权威文档

`docs/plugin-improvements.md` —— **已按仓库当前实现修正过**（原版基线写的是已发版 0.4.3，但仓库已是 0.5.0-beta.0）。文档里带「**现状修正**」前缀的段落就是修正后的真实状态，**以代码为准，文档只是索引**。（2026-09-22：该档基线已同步到 `0.5.5`，剩余待办与「做/不做」影响评估见其「七」）

实施前先读项目自己的 `AGENTS.md`（发版 SOP、名字陷阱表、CHANGELOG 双语约定都在里面）。

## 3. 硬性约束（违反会破坏发版）

1. **不要改**：npm 包名 `@nonamelego/dsh-catppuccin`、插件 ID `dsh-catppuccin`、`cordis.patch.yml` 里的 name 条目。
2. **不要手改** `src/client/palettes.ts`（ AUTO-GENERATED，改映射表后走 `pnpm gen:palettes` 重生成）。
3. **不要改** `src/client/glass/glass.module.css` 里的视觉规则（那是视觉项的地盘）。
4. 每次改动后跑 `pnpm typecheck` 与 `pnpm test`，确保绿。
5. 涉及发版/tag 的操作**不要做**——发版由 maintainer 走 GitHub Actions。

## 4. 你可以独立完成的项（非视觉 / 纯逻辑）

按推荐开工顺序排列：

### Sprint 2 — 稳定性（推荐先做，零视觉依赖）
- **C** 持久化读写一致性：`src/client/state-sync.ts` 的 `persistStateToScope` 前加 revision/`updatedAt` 检查，早于远端则放弃本地写。注意：写侧的 revision fencing 已由 `scope.mutate(...)` 覆盖，**不要重复实现乐观锁**，只补「读侧一致性」。
- **N** seam stamper 防抖：`src/client/glass/glass-seams.ts` 的 `startGlassSeamStamper` 现在每条 DOM 变化都 `stampAll()`。用 `requestAnimationFrame` 合批，或记录上一次 DOM signature 相同则跳过。
- **X** 与 C 同源，合并实施；UI 侧在 UpdateRow 给 toast「另一窗口已更新，本地改动未保存」。

### Sprint 3 — plugin UX（纯交互/布局，无视觉判断）
- **D** row 分组：确认 `dsh-client-ui-settings` 的 slot 是否支持 `settings.general.group`；不支持则发起到上游，不要自己造分组。
- **E** 按钮 wrap：`CatppuccinRow.tsx` 最外层加 `flex-wrap: wrap`，窄屏不溢出。
- **H** 自动检查更新开关：`CatppuccinState` 加 `autoCheck: boolean`，UpdateRow 加 Switch，默认开，持久化到 durable state。
- **I** prerelease 选择：后端 `selectNewest` / `UpdateCheckPayload` 已支持 `channel`，**缺的是 UpdateRow 上的 segmented UI**，补上即可。
- **J** tooltip/帮助图标：复用 dsh-client-ui-slots 已有 tooltip API，locale 加 `*.help` 字典。

### Sprint 4 — 扩展性
- **A** host half 拆分：把 update-check 路由从 `src/index.ts` 拆到 `src/update-check/host.ts`（注意：`/catppuccin/state` 路由 0.5.0 已取消，别按旧文档拆）。
- **K** 用户 token 覆盖：`CatppuccinState` 加 `overrides: Record<string, string>`，主题注册时合并。
- **R** TUI 自定义保护：`syncTuiThemes` 检测到目标文件存在且异于 ship 副本时改 `.bak` 备份。
- **S** dry-run：`syncTuiThemes` 加 `dryRun: true` 参数，返回 planned writes。
- **T** 社区主题：扫描 `~/.dsh-tui/themes/catppuccin-community/`，只读同步。
- **Y** schema 迁移：`src/state.ts` 加 `migrate(raw: unknown): CatppuccinState`，写 `docs/state-migrations.md`。
- **EE** e2e：`tests/e2e/` 用 supertest + 真 cordis 启动，断言 4 主题已注册、玻璃开关可切换、update-check 路由返回 200。
- **L** palette 版本锁定：`scripts/generate-palettes.mjs` 加 `--pin <sha>`，把 SHA 写进 `palettes.ts` 头部 `// UPSTREAM_PIN`。
- **II** glass CSS lazy-load：`glass-layer.ts` 在 `setEnabled(true)` 首次才 inject CSS，卸载时移除。
- **KK** sourcemap：`tsdown.config.ts` 加 `sourcemap: true`，`package.json` `files` 加 `*.map`。

### 其它（P3，按需）
- **CC** 多语言：`src/client/locales.ts` 补 ja/ko/es/fr/de；加 `tests/locales.spec.ts` 用 `Object.keys(zh)` 断言 key 集合一致。
- **DD** 风味副标题：locale 加 `flavor.<id>.subtitle`，`CatppuccinFlavorInfo` 加可选 subtitle key。
- **M** shiki 子样式：`SHIKI_TOKENS[flavor][style]` 二维表 + `shikiStyle` 首选项。
- **U** 错误分类：`network` 细分为 `network.local` / `network.upstream`。
- **V** 重试退避：`handleUpdateCheck` 包 retry wrapper，30s 后自动重试一次。
- **W** ETag：`update-cache` 加 `etag`，fetch 带 `If-None-Match`。
- **GG** `CONTRIBUTING.md`；**HH** typedoc 生成 `docs/api/`；**JJ** 主题 lazy-register；**AA** 键盘导航（slider `onKeyDown` Arrow/Home/End + segmented roving tabindex）。

## 5. 明确排除（视觉项，不要动手）

以下项需要肉眼判断效果，**非视觉模型只写代码、不做质量自证**，收尾必须截图给视觉模型或人工复核：

- **F** 主题预览缩略图、**G** glass swatch、**SS** 预设档位、**Q** layout preview —— 涉及 SVG/视觉布局
- **NN** hero 品牌化、**PP** 列表选中/hover、**QQ** 背景层、**RR** accent 自定义 —— 涉及 CSS 视觉
- **OO** compat 材质增强 —— 需要截图确认「能看出皮肤感」
- **LL** 次级文字 token 提档、**MM** 暗色 accent 提亮 —— 改 `scripts/generate-palettes.mjs` 映射表后重生成，**必须看截图确认对比度从 <3:1 提到 ≥4.5:1**
- **BB** 对比度警告 —— `getContrastRatio` 是纯函数可写，但警告阈值对不对需视觉复核
- **FF** 视觉回归 baseline —— baseline 图需视觉模型或人工生成
- **O** prefers-reduced-motion —— **已实施，直接跳过**
- **P** 高对比度模式、**Z** aria-valuetext —— 可写代码，但 accessibility 效果需复核

## 6. 建议的第一个任务

**Sprint 2 的 C + N + X**：三件都是纯逻辑、零视觉依赖、互相有关联（都挂在状态/observer 上），适合一次性清掉。

- C：`src/client/state-sync.ts` 读侧一致性
- N：`src/client/glass/glass-seams.ts` rAF 合批
- X：与 C 同源，UI toast

开工前先 `git status` 确认没有锁文件（`*.lock`），然后建一个分支 `feat/<项ID>-<简短描述>`，提交后回来报告。

## 7. 遇到不确定时

- 文档与代码冲突 → **以代码为准**，并在文档里记一笔。
- 上游 API 不确定（如 `dsh-client-ui-settings` 的 slot 分组）→ 先 grep 仓库里的用法，找不到就发起到上游，不要猜。
- 不要为了「完整性」加未请求的抽象或配置——这条仓库已经在 ponytail 模式下，能省则省。