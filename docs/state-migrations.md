# state 版本迁移约定（docs/plugin-improvements.md 的 Y 项）

本插件 0.5.0 起把持久化状态放进 DSH 官方 settings 文档（namespace
`catppuccin`）。settings seam 对「缺字段」有 schema 默认值兜底，但文档本身
不带 `version`——插件侧用 `src/state.ts` 的 `sanitizeState` / `migrate`
做字段归一与版本升级。

## 版本历史

| version | 变更 | 迁移步骤 |
|---|---|---|
| 1 | 初版（0.5.0）：`flavor` + `glass` | — |
| 1（增字段） | `autoCheck` / `updateChannel` / `overrides` / `shikiStyle`（2026-09 实施 C/X/H/I/K/M/CC/DD 等项时加入） | 无——`sanitizeState` 对缺字段取默认值，v1 文档自动前滚 |

> 目前没有结构性的 v1 → v2 步骤：0.5.0 之后加入的每个字段都有
> `sanitizeState` 默认值，v1 文档（以及任何缺这些字段的文档）无需迁移代码。
> 未来的结构性变化（重命名、移动字段、拆分对象）才需要真正写迁移步骤。

## 给未来迁移的步骤

1. **加字段（小改）**：只加新字段默认值时，不用写迁移步骤——只要在
   `src/state.ts` 的 `sanitizeState` 补默认值分支即可（老文档自动前滚）。
   同时更新：
   - `src/settings-catppuccin.ts` 的 schema（`.default(...)`）；
   - `src/state.ts` 的 `defaultState` / `defaultSettingsSection` /
     `settingsSectionFromState` / `settingsSectionsEqual` /
     `isDefaultState`；
   - `src/client/state-sync.ts` 的 `stateToMutateOps`（原子写要覆盖新字段）；
   - `tests/state.spec.ts` 的默认形状断言。

2. **结构性改动（vN → vN+1）**：
   - `src/state.ts` 里 `STATE_VERSION = N + 1`；
   - 新增 `migrateV{N}toV{N+1}(raw: vNShape): vNPlusOneShape` 纯函数，
     在 `migrate()` 的版本链里按序接入（见 `src/state.ts` 的 `migrate`）；
   - 在本文件追加一行版本历史，说明迁移做了什么；
   - `sanitizeState` 仍负责最终的字段归一（迁移只做结构性变换）。

3. **降级保护**：`migrate()` 对「版本大于当前 `STATE_VERSION`」的文档不做
   拒绝——保留 `sanitizeState` 能理解的全部字段，绝不把用户状态清空。
   新版插件写出的未知字段会被旧版忽略（settings 文档的 schema 默认值
   兜底），升级后再写会恢复正常。

## 迁移链入口

- `src/state.ts` → `migrate(raw: unknown): CatppuccinState`
- 当前实现里 legacy JSON（pre-0.5.0 `catppuccin-state.json`）的**一次性**
  迁移走 `src/index.ts` 的 `migrateLegacyStateOnce`（只读源、仅当文档无
  user layer 时才写），不在通用迁移链里。