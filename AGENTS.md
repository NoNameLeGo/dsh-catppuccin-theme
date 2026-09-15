# AGENTS.md — dsh-catppuccin

给本仓库的 Agent（以及人类维护者）的项目速览与发版 SOP。开始改代码前请先读「项目定位与核心目标」与「项目身份速览」，**惯例是这里踩过坑的集结点**。

## 项目定位与核心目标（判断「该不该做」的准绳）

**核心目标是「适配」，不是「设计配色」**：按 [Catppuccin 官方源配色](https://github.com/catppuccin/catppuccin)（`palette.json` v1.8.0）把 DeepSeek Harness 的官方 `--dsw-*` token 体系**完整**映射成四个风味。**官方色板是准绳，不是教条**——官方取值在 DSH 的实际用法下真不成立时（有证据）可以改，走规则 1；**玻璃质感（Glassmorphism）是叠加在正确配色之上的视觉皮肤，属附带目标**——它只改材质，不改配色。

权威数据源（由 `scripts/generate-palettes.mjs` 读取，均在仓库外的缓存）：

| 文件 | 作用 |
|---|---|
| `../../.cache/dsh-ref/dsw-tokens.json` | 官方 design-platform.css 解析出的 `--dsw-*` token 全表——**要全覆盖，不许漏 token** |
| `../../.cache/dsh-ref/catppuccin-palette.json` | 官方 Catppuccin 色板 v1.8.0——**默认取色来源**（官方取值在 DSH 下确实不成立时按规则 1 的例外流程偏离） |
| 产物 `src/client/palettes.ts` | 生成物；同源产物还有 `themes/`（`pnpm gen:themes`）与 shiki token 表 |

> **两层「官方」不要混淆**：(a) **Catppuccin 源色板** —— 取色来源；(b) **DSH 官方 token 的取值与语义** —— 被适配对象。改 (b) 是本插件存在的理由（例如整族重映射 `brand-primary` 到风味蓝），不需要理由；改 (a) 才需要证据（规则 1）。

### 由此推出的四条硬规则

1. **以官方色板为默认来源，偏离需要证据。** 每个 `--dsw-*` 的取值默认是官方 26 色本身、或由它们 `color-mix` 出来的中间值；**不得凭观感发明色相**（「这个蓝有点闷，换 sapphire」不是理由）。但当官方取值**在 DSH 的实际用法下确实不成立**时——例如该色被 DSH 用在对比度不达标的场景、或该 token 在 DSH 里被用在官方设计没有的场景——**可以改**，过下面三条即可：
   - ① 有可复核的证据（实测对比度数字 / 用户 issue / 上游设计差异）；
   - ② 已穷尽「不换色相」的手段（混色目标、层级档位）仍不达标；
   - ③ 在代码注释 + CHANGELOG 写明**与官方取值的差异及理由**，并补上锁定该决定的断言。
2. **改颜色只改映射表。** 调 `scripts/generate-palettes.mjs` → `pnpm gen:palettes` → 提交生成物；手改 `palettes.ts` 下次生成即被覆盖。
3. **对比度问题先换手段，再换颜色**：第一步永远是不换色相的调整——混色目标（`base` → `crust`）与层级档位（先例：issue #7、issue #11、VV）。仍不达标时按规则 1 的例外流程偏离并记录：已有两个**记录在案的有意偏离**——① Latte `--dsw-static-blue-900`：该步被 DSH 当作浅色徽章（hero「预览版」）上的**文字**用，通用浅色计划把它混向 `base` 会洗成淡色，故改混向 `text`（`generate-palettes.mjs` 内有完整注释）；② `brand-primary` 整族：DSH 官方品牌蓝与 Catppuccin 主题冲突，直接重映射为风味蓝（生成器头部注释说明）。
4. **玻璃层不得改变配色语义。** 玻璃只动 alpha / blur / rim / shadow；开关关闭时必须回到与官方色板逐 token 一致的纯色形态。

### 用这条准绳做过的判定（可引用的先例）

- 2026-09-15 **驳回** MM（暗色主 accent 提亮）：驳回理由**不是「官方色不许动」**，而是它拿不出「官方取值在 DSH 下不成立」的证据（`#89b4fa` / `#8caaee` 在 `crust` 上远高于 AA，属审美偏好而非缺陷），且 `brand-primary` 已被 `tests/palettes.spec.ts:105` 锁成契约。想要更亮的主操作色走 **K（token 覆盖）**，不走 palette。
- 2026-09-15 **立项** VV（success / warn tertiary 对比度）：实测 3.18~4.37 低于 AA，就是「官方取值在本项目不成立」的那类证据；修法仍走第一步（只换混色目标、色相不变）——规则 1 与规则 3 各占一半。

两次判定的完整理由见 `docs/plugin-improvements.md`（「六、2026-09-15 复核」）。

## 项目身份速览：三套名字，不要混淆

这个仓库同时存在三套不同的「名字」，改动前必须先分清（2026-08 仓库改名时踩过一次坑）：

| 名字 | 值 | 说明 |
|---|---|---|
| GitHub 仓库名 | `NoNameLeGo/dsh-catppuccin-theme` | 已从 `dsh-catppuccin` 301 改名，GitHub 自动跳转旧链接 |
| npm 包名 | `@nonamelego/dsh-catppuccin` | **不要改成 `-theme`**——安装/更新检查代码都依赖它（`src/update-check.ts` 的 `PACKAGE_NAME`、`cordis.patch.yml` 的 `name`、README 里的安装/升级命令） |
| 插件 ID / 显示名 | `dsh-catppuccin` | `src/index.ts:54` 的 `export const name`；运行时的 Cordis 插件身份，不可改 |

- 代码/配置里 `grep dsh-catppuccin` 命中的大多数**都不该改**。只有**完整的 GitHub URL**（`github.com/NoNameLeGo/dsh-catppuccin`，不带 `-theme`）才需要更新为新仓库名。
- npm 包名、插件 ID、本地路径 `link:D:\Vibe-Coding\dsh-catppuccin`（README 里的本地开发命令）一律保持原样。
- `git remote` 的 `origin` 指向 `https://github.com/NoNameLeGo/dsh-catppuccin-theme.git`。

## 下次发版 SOP

发布走 GitHub Actions 的 OIDC **Trusted Publisher** 自动发 npm。正常流程**不要手动 `npm publish`**（手动只是 CI 故障时的紧急回退，见下）。

### 发布前检查（一次性配置，已就绪但请复核）
- npmjs.com → 包 `@nonamelego/dsh-catppuccin` → Settings → **Trusted Publisher**：Repository 必须为 `dsh-catppuccin-theme`（当前已配好）。若与仓库名不一致，CI 的 `Publish to npm` 步会失败。

### 0. 选版本号（决定发布渠道）
- 正式版（版本号**不含** `-`）：`0.x.y` → 发布后进 `latest` 标签
- 预发布（**含** `-`）：`0.x.y-beta.n` → 发布后进 `beta` 标签
- `publish.yml` 用 `require('./package.json').version.includes('-')` 自动判断 `latest`/`beta`，无需手动指定。

> ⚠️ **发版版本号**：当前 `0.5.1`（已发布；0.5.0 把持久化迁到官方 settings 机制，0.5.1 修 issue #11 深色分段可读性 + 设置弹窗玻璃化）。下次按常规 semver 判断：**修复走 `0.5.x`，新特性走 `0.6.0`**；预发布仍用 `-beta.n` 后缀。发版前先在 CHANGELOG.md 的 `## [Unreleased]` 节写好条目、发版时落成 `## [<version>] - <日期>`（publish.yml 校验正式版必须已有对应条目；该节缺失时 `pnpm changelog:gen -- --write` 会自动补建）。

### 1. 升版本 + 本地验证
1. 编辑 `package.json` 的 `version`（连同本次要发布的代码改动）
2. **更新 CHANGELOG.md**：在 `## [Unreleased]` 追加条目，或发版时把草稿生成后润色成 `## [<version>] - <日期>` 节。生成草稿：
   ```bash
   pnpm changelog:gen            # 打印 上一 tag..HEAD 的草稿（按 conventional 分组）
   pnpm changelog:gen -- --write # 直接写入 [Unreleased] 节
   ```
   然后人工润色（补日期、合并条目、删噪音）。**正式版发版前必须已有对应 `## [<version>]` 条目**——publish.yml 的 `Verify changelog entry` 步会拦截缺失（预发布跳过该校验）。
3. 本地自测：`pnpm typecheck && pnpm typecheck:tests && pnpm build && pnpm test`（CI 也会跑同样步骤，但先自查）

### 2. 提交 + 打 tag + 推送（触发发布）
```bash
git add . && git commit -m "chore(release): 发布 v<version> ..."
git tag v<version>            # tag 名 = "v" + package.json 的 version，例如 v0.2.7
git push origin main --tags   # publish.yml 监听 v* tag 推送
```

### 3. 验证发布成功
- GitHub → Actions → `Publish Package` run 应为 `success`。
- `npm view @nonamelego/dsh-catppuccin dist-tags` 确认 `latest`（正式版）或 `beta`（预发布）已是新版本号。

### 4. 发布后
- 若插件已收录于 awesome-dsh-plugin，收录条目无需随发版改动。
- 正式版发完如 README 需要同步变化点，并入本次 release commit。

## 故障排查（发版失败）

**背景**：`Publish to npm` 步骤历史上**连续失败多次**（v0.1.2 ~ v0.2.5），而 `0.2.6` / `0.2.6-beta.0` 是绕过 CI、本地手动 `npm publish` 发出的——原因是 Trusted Publisher 的 Repository 与（改名前的）仓库名不匹配。改名并同步配置后，下次发版是 CI 通道的首次验证点。

- 失败在 **pnpm/action-setup** 步（`Multiple versions of pnpm specified`）→ workflow 的 `version` 与 `package.json` 的 `packageManager` **字符串必须完全相等**，否则 action 直接抛错。本仓库只保留 `packageManager`（workflow 不传 `version`，官方推荐用法）——2026-09-15 加 `packageManager` 时踩过一次，差点让发版在第二步失败。
- 失败在 **Typecheck** 步、本地却过（`TS2307: Cannot find module '@deepseek-ai/...'`）→ **本地过 ≠ CI 过**：TS 会向上逐层查找 `node_modules`，本仓库位于 `D:\Vibe-Coding` 下，父目录的 `node_modules` 里有什么就能解析什么（幽灵依赖）。未声明的 `@deepseek-ai/*` 类型包必须写进 `devDependencies`；拿不准时把仓库复制到**工作区之外**（如 `%TEMP%`）跑一遍 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm typecheck:tests && pnpm test`——2026-09-15 的 `@deepseek-ai/dsh-api-remotes` 就是这样被 CI 抓到的。

- 失败在 **install / build / test** 步 → 本地构建问题，先在本地重跑 `pnpm install && pnpm build && pnpm test`。
- 只失败在 **Publish to npm** 步：
  1. 首选怀疑 **Trusted Publisher 与仓库名不匹配** → npmjs 网页确认 Repository = `dsh-catppuccin-theme`。
  2. 打开该 run 的日志，看 `npm publish` 的具体报错（`errCode` / 401 / 403 / E401 等）。
- **紧急回退**（确信 CI 短时间修不好时）：本地手动发，必须显式走 npmjs registry——仓库 `.npmrc` 指向 npmmirror，直接 `npm publish` 会发错仓库/失败：
  ```bash
  npm publish --registry=https://registry.npmjs.org --tag latest   # 正式版
  npm publish --registry=https://registry.npmjs.org --tag beta     # 预发布
  ```

## 其它项目约定
- 提交信息用中文 conventional 风格：`feat(...)` / `fix(...)` / `chore(release): ...` 等。
- **CHANGELOG 双语**：希望 changelog 条目附带英文摘要时，在 commit 正文里写一行 `EN: <英文摘要>`（大小写不敏感）；`pnpm changelog:gen` 会自动把它渲染为 `- **中文标题**（EN: 英文）`。没有 `EN:` 行的 commit 只输出中文——双语是可选增强，不强制每条都要写英文。
- 玻璃质感（玻璃拟态）皮肤代码在 `src/client/glass/`；主题调色板由 `pnpm gen:palettes` 生成（`scripts/generate-palettes.mjs`）。
- dsh-TUI 主题文件在 `themes/`（四个风味各一个 `~/.dsh-tui/themes/` 用 JSON），由 `pnpm gen:themes` 生成（`scripts/generate-tui-themes.mjs`，读同一份官方色板缓存）；改键映射后重跑并核对 dsh-TUI `src/theme.ts` 的 Theme 键。
- TUI 安装入口是 `src/tui-themes.ts`（子路径导出 `./tui-themes`，cordis.patch.yml 第二行）：激活时幂等同步主题到 `~/.dsh-tui/themes/`；dsh-TUI 没有主题注册 API，目录是唯一接缝，`catppuccin-*.json` 命名空间归本插件所有、同步即覆盖。
- 插件预览图（README 专用，存在 `assets/previews/`）：`scripts/screenshot-previews.cjs` 出四风味图、`scripts/screenshot-glass.cjs` 出玻璃图、`scripts/combine-previews.py` 合成斜切大图（输出 `combined.png` / `glass-combined.png`）。三者都要求本地 GUI 跑在 `http://127.0.0.1:3080`；`screenshot-previews.cjs` 目前对 Frappé / Macchiato 的风味切换断言失败（脚本内 `ponytail:` 标记），重截前先修。
- **`assets/` 不进 npm 包**（`package.json` 的 `files` 不含它，图片只在 README 用），所以 README 里的图片一律写**绝对** `raw.githubusercontent.com` URL——别改回相对路径，否则 npm 页面会失去图。
- 对外 API 文档：`pnpm docs:api`（typedoc）→ `docs/api/`。**该目录不入库**（已 `git rm --cached` + 进 `.gitignore`，见 WW），本地按需生成即可；生成物当前是旧的（本次已重生成，但以后只在需要时重建）。重跑时 typedoc 会打一条 `origin` remote "not valid" 的警告——**实测是虚警**：链接照样生成，且指向当前 commit 的 permalink（`blob/<sha>/src/...`），无需改配置。真要自己写模板就用 `disableGit` + `sourceLinkTemplate`，注意 `{path}` **不含 `src/` 前缀**（否则生成 404 链接）。
- `src/profile-detect.ts`：更新检查里「自动探测当前 profile 名」的实现（探测失败回退 `web`）。
- CI 配置：`.github/workflows/ci.yml`（push main / PR：install + typecheck + build + test，只读权限）与 `.github/workflows/publish.yml`（`v*` tag / 手动 dispatch 才跑，OIDC 可信发布，无 token 入库）。**普通提交只靠 ci.yml 把关**——发布链路里才跑检查的旧格局已经让两次发版失败（幽灵类型依赖、跨测试污染）。
