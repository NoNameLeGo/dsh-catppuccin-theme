# CONTRIBUTING.md — dsh-catppuccin 贡献指南

感谢你愿意给这个插件添砖加瓦。开始之前请先读
[AGENTS.md](AGENTS.md) 的两节：「项目定位与核心目标」（**核心目标是把官方
Catppuccin 配色适配到 DSH；官方色板是默认取色来源，官方取值在 DSH 下确实不成立时可有据偏离；
玻璃质感是叠加的附带目标**）
与「项目身份速览」——仓库存在三套名字
（GitHub 仓库名 / npm 包名 / 插件 ID），**大多数 `dsh-catppuccin` 字样都不该改**。

## 技术栈速览

| 面 | 位置 | 说明 |
|---|---|---|
| Host half | `src/index.ts`、`src/update-check/host.ts` | cordis 插件入口：settings namespace 注册 + `/catppuccin/check-update` 路由 |
| Client half | `src/client/` | 浏览器 bundle（`exports["./client"]`）：主题注册、**三个 settings slot**（`catppuccin` = 主题 + 代码高亮风格 / `catppuccin-glass` = 玻璃质感 / `catppuccin-update` = 检查更新，见 `src/client/index.ts` 的三处 `slots.inject('settings.general.item')`）、玻璃皮肤 |
| TUI half | `src/tui-themes.ts` | 子路径 `./tui-themes`：把四套主题 JSON 同步进 `~/.dsh-tui/themes/` |
| 调色板 | `scripts/generate-palettes.mjs` → `src/client/palettes.ts` | **AUTO-GENERATED，不要手改** |
| 玻璃 CSS | `src/client/glass/glass.module.css` → 构建时生成 `glass-css.gen.ts` | 样式源文件；改完跑 `pnpm build` |
| 契约 | `src/state.ts`、`src/update-check.ts` | 两个 half 共享、无运行时依赖 |
| 持久化写侧 | `src/client/state-sync.ts` | settings 文档的 revision-fenced 原子写 + 多标签页读侧一致性 |

开发命令：`pnpm install` → `pnpm typecheck` → `pnpm test` → `pnpm build`。

## 怎么加一个风味（flavor）

1. **确认上游色板**：风味必须来自
   [catppuccin/catppuccin 的 palette.json](https://github.com/catppuccin/catppuccin)
   （本地缓存 `.cache/dsh-ref/catppuccin-palette.json`，脚本读它生成）。
2. **改 `scripts/generate-palettes.mjs`**：
   - `FLAVORS` 数组加 `{ id, label }`（大小写与官方一致，如 `Frappé`）；
   - 若新风味是深色系，确认 `palette.json` 里它的 `dark: true`，浅色系则
     `false`——映射表按 `dark` 自动选 Latte/暗色分支；
   - 重跑 `node scripts/generate-palettes.mjs --pin <upstream-sha>` 生成
     `src/client/palettes.ts`（pin 用于锁定上游版本，见改进项 L）。
3. **接链条**：
   - `src/client/shiki-tokens.ts`：补标「默认 + italic-comments」两套色板；
   - `src/state.ts` 的 `CATPPUCCIN_THEME_IDS` 加 themeId
     （`catppuccin-<id>` 命名空间归本插件所有）；
   - `src/client/index.ts` 的 `CATPPUCCIN_FLAVOR_VALUES` 由 palettes 导出
     自动跟随，无需手改；
   - `src/client/locales.ts` 的**每个语言**都补 `flavor.<id>` 与
     `flavor.<id>.subtitle` 键（zh 是 key 集合的 source of truth，
     `tests/locales.spec.ts` 会拦截漏键）。
4. **测试**：`pnpm typecheck && pnpm test`，`tests/palettes.spec.ts` 的
   对比度 / 单调性断言会替你兜住映射错误。视觉效果需要截图交给视觉复核
   （对比度等纯计算项可以自己先算）。

## 怎么改 token 映射

- 只改 `scripts/generate-palettes.mjs` 的映射表，**不要改**
  `src/client/palettes.ts`（顶部 `AUTO-GENERATED`）。
- 改完 `pnpm gen:palettes` 重生成。**默认取官方色板**（见 AGENTS.md
  「项目定位与核心目标」）：对比度问题先调混色目标（`base` / `crust`）与层级
  档位，**先不要换色相**；穷尽后仍不达标（例如官方色在 DSH 的实际用法下达不到 AA）
  才偏离官方取值，并必须在代码注释 + CHANGELOG 写明理由与对照值。
- 验收分两条路：**纯数值可判定**的对比度改动（如 issue #11 的蓝梯、VV 的绿 /
  琥珀 900 步）用 `tests/palettes.spec.ts` 的 WCAG 断言验收；涉及**观感**的改动
  （材质、圆角、光晕、亮度观感）必须附截图给视觉模型或人工复核。
- `tests/palettes.spec.ts` 的地板断言覆盖 WCAG 对比度与暗色层级单调性。

## 玻璃皮肤

- 样式文件：`src/client/glass/glass.module.css`（构建时由
  `pnpm build` 重新生成 `glass-css.gen.ts`，改完记得跑 build 让
  `pnpm test` 与产物同步）。
- 不要手改 `glass-css.gen.ts`。
- 视觉规则（圆角、光晕、纹理）改动需要截图复核；逻辑（seam、
  lifecycle、localStorage 持久化）在 `glass-layer.ts` / `glass-seams.ts`，
  纯逻辑改动可以直接测。

## TUI 主题

- 四套官方主题在 `themes/`（`pnpm gen:themes` 生成，读同一份色板缓存）。
- `src/tui-themes.ts` 的 `syncTuiThemes` 契约：owned 文件冲突默认
  `.bak` 备份；`dryRun` 只报告；`catppuccin-community/` 子目录
  write-if-missing。
- 改同步逻辑后看 `tests/tui-themes.spec.ts`（用临时目录，不碰真 home）。

## 测试要求

- 每次改动跑 `pnpm typecheck && pnpm typecheck:tests && pnpm test`，保持绿
  （前两条分别是 src 与 tests 两个 tsconfig 的类型检查，CI 也跑它们）。
- **行级组件测试**在 `tests/rows.spec.tsx`（RTL + jsdom）。约定：两个 row 的依赖
  全部是 props，所以用**注入面 fake** 渲染，不碰模块全局；fake 的快照函数必须返回
  **稳定引用**（`useSyncExternalStore` 按引用比较，每次新建对象会无限重渲染）。
  新增交互时优先在这里补断言——纯逻辑测试盖不到“打字时那行会不会消失”这类缺陷。
- 新增/修改 `src/state.ts` 契约字段时，同步更新 `tests/state.spec.ts`
  与 `tests/client.spec.ts` 的断言（字段有专门的镜像守卫测试）。
- 涉及 settings 文档/持久化：看 `docs/state-migrations.md` 的约定。
- 纯视觉改动：无法用单测断言的部分必须附截图说明。

## 提交信息

中文 conventional 风格：`feat(...)` / `fix(...)` / `chore(...)` 等；
希望 changelog 带英文摘要时在正文写一行 `EN: <英文摘要>`。

## 发版

发版由 maintainer 走 GitHub Actions（OIDC Trusted Publisher），
**不要手动 `npm publish`**（CI 故障时的紧急回退见 AGENTS.md）。
发布是**推 `v*` tag 触发的**（见 `.github/workflows/publish.yml`），所以 tag 由
maintainer 按 AGENTS.md 的 SOP 打并推——普通 PR 不要打 tag。