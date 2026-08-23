# AGENTS.md — dsh-catppuccin

给本仓库的 Agent（以及人类维护者）的项目速览与发版 SOP。开始改代码前请先读「项目身份速览」，**惯例是这里踩过坑的集结点**。

## 项目身份速览：三套名字，不要混淆

这个仓库同时存在三套不同的「名字」，改动前必须先分清（2026-08 仓库改名时踩过一次坑）：

| 名字 | 值 | 说明 |
|---|---|---|
| GitHub 仓库名 | `NoNameLeGo/dsh-catppuccin-theme` | 已从 `dsh-catppuccin` 301 改名，GitHub 自动跳转旧链接 |
| npm 包名 | `@nonamelego/dsh-catppuccin` | **不要改成 `-theme`**——安装/更新检查代码都依赖它（`src/update-check.ts` 的 `PACKAGE_NAME`、`cordis.patch.yml` 的 `name`、README 里的安装/升级命令） |
| 插件 ID / 显示名 | `dsh-catppuccin` | `src/index.ts:41` 的 `export const name`；运行时的 Cordis 插件身份，不可改 |

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

> ⚠️ **下次发版版本号**：当前 `0.3.1`（0.3.1 撤销了设置页自动检查更新，回到纯手动按钮；玻璃预设、关闭还原官方偏好等特性保留）。后续按常规 semver 判断：新特性走 `0.4.0`，修复走 `0.3.x`；预发布仍用 `-beta.n` 后缀。

### 1. 升版本 + 本地验证
1. 编辑 `package.json` 的 `version`（连同本次要发布的代码改动）
2. 本地自测：`pnpm build && pnpm test`（CI 也会跑同样步骤，但先自查）

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
- 玻璃质感（玻璃拟态）皮肤代码在 `src/client/glass/`；主题调色板由 `pnpm gen:palettes` 生成（`scripts/generate-palettes.mjs`）。
- 插件预览图生成脚本：`scripts/screenshot-previews.cjs`。
- CI 发布配置：`.github/workflows/publish.yml`（OIDC Trusted Publishing，无 token 入库）。
