# issue #15 分析与修复方案：DSH 0.1.7 的 settings seam 换成了 `configForms`

- 上游 issue：<https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/15>
- 状态：**已实施并本地全绿**（`0.5.6-beta.2`，未发布、未打 tag）
- 报告环境：DSH `0.1.7-rc.1` + `@nonamelego/dsh-catppuccin@0.5.5`（`0.5.6-beta.1` 同病）

## 0. 实施状态

| 项 | 结果 |
|---|---|
| 改动文件 | `src/state.ts`、`src/settings-catppuccin.ts`、`src/migrate-legacy.ts`（新）、`src/index.ts`、`src/client/state-sync.ts`、`src/client/index.ts`、`package.json`、`AGENTS.md`、`CHANGELOG.md` |
| 测试 | 新增 `tests/settings-seam.spec.ts`（17 条）；`tests/client.spec.ts` / `tests/reentrancy.spec.ts` / `tests/e2e/update-check.e2e.spec.ts` 扩写；**215 用例全绿**（原 192） |
| 验证 | `pnpm typecheck && pnpm typecheck:tests && pnpm build && pnpm test` 全过；产物核对：`lib/client.js` 的 `inject` 只剩 `['slots','locale','theme']`，两条软注入 `inject(["configForms"])` / `inject(["settingsScope"])` 都在；`lib/index.js` 仍从宿主解析 `@deepseek-ai/schemastery`（守卫有效），导出 `Config` |
| 依赖 | `@deepseek-ai/*` devDeps 整条升到 `0.1.7-rc.1`、`cordis ~4.0.4`、`schemastery ~3.18.4`；整份源码在这一版类型下**零改动通过** typecheck（无上游漂移） |
| 实施中修正 | 第一版 `volatileFields()` 只给 `glass.*` 标了 volatile，顶层 5 个标量漏了——被 `tests/settings-seam.spec.ts` 的「每个叶子都必须 volatile」当场抓住（这正是那条断言的价值） |
| **未做（明确缺口）** | §5.4 的 **P2 迁移**（把 `settings.yaml.imported` 里我们那个被拒的 `catppuccin:` 段捞回来）。原因：那是 YAML，而本插件的 host 半区是零依赖产物（不打包任何 YAML 解析器），读它需要一个我们不愿引入的运行时依赖。**影响面（2026-09-24 更正）**：两个桌面壳都用**固定端口**（官方壳 `--port 19387`；`anywhere-labs/dsh-desktop` 默认 `43120`，仅冲突时顺序 +1），所以 localStorage 的 origin 跨重启是稳定的 ⇒ 正常升级路径下客户端会把 localStorage 里的选择推回新文档、偏好**不会丢**。真正会丢的只有一种情形：偏好**只存在于旧的持久存储里、而当前浏览器的 localStorage 里没有**（例如在浏览器 A 里配过、之后第一次在浏览器 B / 桌面端打开，或站点数据被清过）——那时无源可推，回落到默认值。要修同样得先决策 YAML 依赖，或由上游把 section 名映射到条目 id |
| **未做（需授权）** | 真机复核（要升 CLI + 修 `web` profile，会往 C 盘下载）；GitHub Actions 的打 tag 发布 |

---

## 1. 结论速览

| 项 | 内容 |
|---|---|
| 现象 | Web boot 打 `@nonamelego/dsh-catppuccin: pending (waiting for service: settingsScope)`，插件整条不激活（四条设置行、四个风味主题全部消失） |
| 根因（客户端） | 0.1.7 删除了客户端 `settingsScope` 服务，改名为 `configForms`；本插件把它写进了**硬依赖 `inject`**，服务永不存在 ⇒ Cordis 永不激活 |
| 根因（Host） | 0.1.7 删除了 Host 的 `settings.installSection`；本插件在 `settings` 注入回调里无条件调用它 ⇒ 即使客户端修好，Host 也会在注入回调里抛 `TypeError` |
| 关键新机制 | 0.1.7 的「插件配置表单」不再由插件**注册命名空间**，而是由插件**声明带 `.volatile()` 的 `Config` schema**，settings 服务按 **profile 条目 id**（本插件 = `dsh-catppuccin`）自动投影成表单 |
| 兼容性约束 | `latest` 线（`@deepseek-ai/dsh@0.1.5-rc.3`）仍是旧 seam，且在售；**必须双通道**，不能只跟 0.1.7 |
| **兼容旧版结论** | **按本方案改完，旧版（≤ 0.1.6-alpha.2）保持兼容**：旧线走原路径、原落点、原判据，运行时代码路径与 `0.5.6-beta.1` 一致，唯一变化是注入时机提前（不等 `settingsScope`）。前提是三个「只在单通道生效」的收敛点必须做到位：`.volatile()` 守卫、`hasUserLayer` 只用于新通道、`expectedRevision` 只在新通道传——见 §4.1 / §4.2 / §5.6 |
| 隐藏地雷 | `.volatile()` 是 schemastery **3.18.3** 新增的；旧宿主锁 `schemastery@3.18.2` ⇒ 无条件调用会在**模块求值期**抛异常，把插件从"不激活"升级成"加载失败" |
| 建议版本 | `0.5.6-beta.2`（修复，走 beta 线） |

---

## 2. 现象

Web 端启动日志：

```
@nonamelego/dsh-catppuccin: pending (waiting for service: settingsScope)
```

`pending` 是 Cordis 对「硬依赖未满足」的措辞。插件行一直挂起 ⇒ `apply` 从未执行 ⇒ 无主题注册、无设置行、无更新检查路由。

## 3. 根本原因

### 3.1 「硬依赖」是放大器，不是病根

`src/client/index.ts:362`：

```ts
export const inject = ['slots', 'locale', 'theme', 'settingsScope']
```

`inject` 是**硬依赖**：列表里任何一项不存在，整个插件就不激活（这正是这个仓库在 Host 侧把 `settings` 写成可选注入的原因）。0.1.7 里 `settingsScope` 不再被任何包 `provide`，所以这项永远满足不了。

### 3.2 两端 seam 的版本边界（已逐包核对 npm 产物，非推测）

| 包 | 0.1.5-rc.3（= `latest`） | 0.1.6-alpha.2 | 0.1.7-alpha.1 起 / 0.1.7-rc.1 |
|---|---|---|---|
| `dsh-client-ui-settings` `lib/client.js` 含 `settingsScope` | 有 | 有 | **无** |
| 同上含 `configForms` | 无 | 无 | **有** |
| `dsh-settings` `lib/index.js` 含 `installSection` | 有 | 有 | **无** |

即：**0.1.7-alpha.1 是分水岭**。旧/新两套 seam 结构同构但名字与语义不同：

| 维度 | 旧（≤ 0.1.6-alpha.2） | 新（≥ 0.1.7-alpha.1） |
|---|---|---|
| 客户端服务 | `ctx.settingsScope`（`SettingsScopeBinder`） | `ctx.configForms`（`ConfigForms`） |
| 取用方式 | `.bind({ namespace: 'catppuccin' })` | `.get<Section>('<profile 条目 id>')` |
| 命名空间来源 | 插件在 Host 侧自行 `installSection(ns, schema, base, sinks)` 注册 | 由 settings 服务**从插件 `Config` schema 自动投影**，ns = profile 条目 id |
| Host 注册 API | `settings.installSection(...)` | 无需注册；只需 `.volatile()` 字段（可选 `configure({ auto: false })`） |
| 快照字段 | `status / value / base / user / revision / writable / mode` | **逐字段同名同义** |
| `mutate()` 返回 | `Promise<void>`；**拒绝时不抛错**，只内部重读、静默返回（`lib/client.js` 实测：`if (!response.ok) { await this.recover(generation); return }`） | `Promise<boolean>`；拒绝时 `false` + 同样的内部重读 |
| `mutate()` 栅栏 | `expectedRevision ?? pendingRevision ?? snapshot.revision` | 同左 |
| 持久化落点 | `$DSH_HOME/settings.yaml` 的 `catppuccin:` 段 | profile patch：`$DSH_HOME/profiles/<profile>/cordis.patch.yml` 里该条目的 `config:` |

快照字段逐字段同名，是两个通道能共用一套适配层的前提。

**两处「同名但不易察觉」的语义差异，是兼容旧版时必须逐条对齐的地方**（详见 §5.6、§6.2）：

1. `mutate` 的**拒绝信号**：旧通道完全静默（无返回值、不抛错），新通道返回 `false`。⇒ 冲突检测唯一可移植的手段是**我们自己的读侧 revision 守卫**（现有实现已具备），新通道可额外把 `false` 当成冲突。
2. `mutate` 的**栅栏来源**：旧控制器有 `pendingRevision` 回退（上一次被超越的写答回的更新 revision）。显式传一个更旧的 `baseRevision` 会在窄竞态下把本来能成功的写变成（静默）拒绝。⇒ 显式栅栏**只在新通道用**，旧通道保持传 `undefined`，行为逐字节不变。

### 3.3 Host 侧的第二处必炸点

`src/index.ts:95-111`：

```ts
ctx.inject(['settings'], (sctx) => {
  sctx.settings.installSection(...)   // 0.1.7 上这个方法不存在
  migrateLegacyStateOnce(sctx.settings)
})
```

0.1.7 的 `SettingsForms` 只有 `configure / describe / update / replace / mutate / prepareDocument`（`@deepseek-ai/dsh-settings@0.1.7-rc.1/lib/types/index.d.ts` 实测）。因为这是**软注入**（`ctx.inject` 不会拦住插件本体），症状表现为运行时抛错而非 pending —— 客户端修好后它会立刻成为新的第一现场。

### 3.4 新 seam 的形状（修复必须照着它写）

Host 侧（`packages/settings/settings/src/schema.ts`）：

- 表单字段 = 「最近的 volatile 祖先」下的字段；`volatileForm()` 递归 object dict，**支持嵌套**（`glass.*` 可整体标 volatile，也可逐叶标，但不能父子同时标，会 `volatile fields require a fixed object path without an enclosing volatile field`）。
- `describe()` 的入选条件（`src/index.ts`）：条目 fiber **必须 `ACTIVE`**、`runtime.Config` 必须是能 `toJSON()` 的 schemastery schema、且 `volatileForm(schema)` 不为 undefined；`ns = entry.options.id`，并要求 id 在 profile 中**唯一**。
- `user` 层的语义：`configuration()` 里 `override` 取「最后一条同 id 且带 config 的 patch 行」，**不存在时是 `{}` 而不是 `undefined`**；`projectForm(form, {})` 仍返回 `{}`。⇒ 客户端「文档还没有用户层」的判据必须容忍空对象。
- 客户端侧（`packages/client/ui-settings/src/client/config-form.ts`）：`ctx.configForms.get(entryId)` 返回共享的 `ConfigFormController`，读走共享 describe 镜像（`settings/document-updated` + `connection/reset` 触发重读），写走 `ctx.remote.settings.mutate(ns, ops, revision)`。
- `settings.general.item` 槽位在 0.1.7-rc.1 **仍然存在**（`contract/slots.d.ts` 实测），所以 UI 不必搬家。
- `autoGenerate` 在全仓的消费方只有 `packages/settings/**`（Host）与 `api/settings-controller`，**客户端包内只有测试引用**（`grep autoGenerate` 实测）⇒ 已发布的客户端不会据它自动成页，加 `Config` 不会凭空多出一个表单界面。

---

## 4. 方案对比

| | A. 双通道适配（推荐） | B. 只跟 0.1.7（configForms only） | C. 维持旧 seam |
|---|---|---|---|
| 客户端 | 去掉 `settingsScope` 硬依赖；`configForms` 与 `settingsScope` 各走一个**软注入**，谁在就用谁 | `inject` 直接换成 `configForms` | 不动 |
| Host | 保留 `installSection`（`typeof` 守卫）+ 新增 volatile `Config` | 只留 volatile `Config` | 不动 |
| 0.1.7-rc.1 | 修 | 修 | **继续坏** |
| 0.1.5-rc.3（在售 latest） | 保持 | **坏**（`configForms` 不存在 → 同样 pending） | 保持 |
| 代码量 | 中（一个适配层 + 双通道测试） | 小 | 最小 |
| 风险 | 双路径测试面翻倍 | 直接劝退 latest 线用户 | 0，但等于不修 |

**选 A。** 理由：`@deepseek-ai/dsh` 的 `latest` 仍是 `0.1.5-rc.3`（`next` 才是 0.1.7-rc.1），绝大多数用户从最新版 CLI 装；B 会把"新宿主修好、老宿主坏掉"变成新的 issue。两套 seam 的快照结构逐字段同名，适配层成本比看上去低得多。

### 4.1 兼容旧版的判定依据（逐条实测，不是推断）

方案 A 到底能不能兼容旧版，取决于下面 8 件事。已用 `.debug/compat-probe.mjs` 与逐包解包核过（16/16 通过）：

| # | 判定项 | 结论 | 依据 |
|---|---|---|---|
| 1 | `ctx.inject(['configForms'], cb)` 在服务**永不出现**时是否安全 | 安全：不触发回调、不拦插件本体、`dispose()` 不抛错不挂起 | 探针 A1–A4（cordis 4.0.2 实跑）；仓库里 Host 侧 `ctx.inject(['settings'])` 已是同一先例 |
| 2 | `.volatile()` 守卫在 schemastery 3.18.2 上是否成立 | 成立：`.volatile` 是 undefined ⇒ 返回原节点、不抛错、`toJSON()` 里**不含** volatile 元信息 | 探针 B1–B4；3.18.2 正是 `dsh-settings@0.1.5-rc.3` 的 peer，且就是本仓库 node_modules 里那一份 |
| 3 | 老宿主会不会因为多出 `Config` 而**多出命名空间/表单** | 不会：旧 host 的 `describe()` 只遍历显式注册过的 `registrations`，不看条目 Config；`volatileForm(Config)` 在 3.18.2 下为 `undefined` | 探针 D1 + 旧 `describe()` 源码 |
| 4 | 新宿主上表单是否真的能投影出全部字段（含嵌套） | 能：顶层 6 字段 + `glass.*` 5 字段全部进表单，`isVolatilePath(['glass','blur'])` 为真 | 探针 D2–D5（用 0.1.7-rc.1 的 `volatileForm`/`isVolatilePath` 原逻辑跑真 schema） |
| 5 | 加 `Config` 会不会在旧宿主上凭空多出一个配置页 | 不会：`autoGenerate` 在已发布客户端里**没有运行时消费方**（只有测试引用）；0.1.5-rc.3 根本没有插件配置页（`dsh-client-ui-plugin-manager` 最早只发到 0.1.6-alpha.2），0.1.6-alpha.2 的插件页虽认 `plugins.*.config` 但没有 `configForms`/`settingsScope`、而我们不注册该槽位 | `grep autoGenerate` 全仓 + 逐版本解包 |
| 6 | 去掉硬依赖 `settingsScope` 会不会让老宿主上的插件提前激活而破坏时序 | 只提前，不破坏：`theme`/`slots`/`locale` 仍在硬依赖里；`ctx.get('theme')`、`theme.setTheme` 仍是可写方法（`this.setTheme(` 内部调用 0 处，monkey-patch 仍是纯外部 seam） | 0.1.7-rc.1 `ThemeRuntime` d.ts + `lib/client.js` |
| 7 | 我们依赖的其余上游 API 在 0.1.7 是否变形 | 全在：`ThemeTokens` 仍是 `Record<string,string>`、`ThemeDefinition{id,colorScheme,tokens}`、`getTheme/setTheme/register`、`locale.register(双语 typed 重载)/addLanguage/getLocale/subscribe`、`LocaleSnapshot.active`、cordis `effect(cb, label)` 与 `inject(deps, cb)` | 逐包 0.1.7-rc.1 d.ts 对照 |
| 8 | 从平台模块表取值会不会踩到 `web-platform.ts` 的漂移 | 不会：客户端唯一的平台表值导入是 `react` / `react/jsx-runtime`，两个版本都在表里 | `grep -rn "^import" src/client/**` |

### 4.2 老线必须保持的不变式（回归测试的靶子）

改完之后，旧宿主（≤ 0.1.6-alpha.2）上以下行为必须**逐字节不变**：

1. 依赖满足后照常激活，四条设置行、四个风味主题、更新检查路由全在。
2. 持久化仍走 `settings.installSection` + `catppuccin` 命名空间，落点仍是 `settings.yaml`。
3. "还没有用户层"的判据仍是 `snapshot.user === undefined`（不是 `hasUserLayer`）。
4. 写调用仍是 `mutate(ops)`（不传 `expectedRevision`），沿用控制器自己的 `pendingRevision ?? snapshot.revision`。
5. 一次性迁移的 ns 仍是 `catppuccin`。
6. `Config` 构建不抛错、不留 volatile 元信息、不产生任何新界面。

只要第 3/4 条这两个差异全部收敛在适配器内部（不泄漏到调用方），老线的运行时代码路径与 0.5.6-beta.1 完全一致——**唯一的行为变化是注入时机提前**（不再等 `settingsScope`），而这是无害的：hydrate 的桥接订阅会在服务出现时补跑一次。

---

## 5. 改动清单

### 5.1 `package.json`

- devDependencies 的 `@deepseek-ai/*` **整条线**从 `^0.1.2-rc.1` 升到 `0.1.7-rc.1`（全部包在该版本齐备，已逐个核对：`dsh-brand / dsh-client-locale / dsh-client-ui-renderer / dsh-client-ui-settings / dsh-client-ui-slots / dsh-client-ui-theme / dsh-invariants / dsh-scope / dsh-session / dsh-settings / dsh-api-remotes`）。
  只升 `dsh-client-ui-settings` 会留下 `dsh-api-remotes`/`dsh-client-ui-slots` 的版本错配（类型解析交叉引用），整条升最省事。
- `@deepseek-ai/cordis`：`^4.0.2` → `~4.0.4`（0.1.7 各包的 peer 要求）。
- `@deepseek-ai/schemastery`：`^3.18.2` → `~3.18.4`（**必须**，见 §6.1）。
- `version` → `0.5.6-beta.2`。
- `dsh.client.inject` 不变（`@deepseek-ai/dsh-client-ui-settings` 在 0.1.7 仍是同一个包名）。

> 这些全是 devDependency，只影响本地类型与构建；运行时由宿主的 profile 树解析（这正是双通道能成立的原因）。

### 5.2 `src/state.ts`（共享常量）

- 新增 `export const CATPPUCCIN_ENTRY_ID = 'dsh-catppuccin'`，紧挨现有的 `CATPPUCCIN_SETTINGS_NS = 'catppuccin'`。
- 注释写明：这是**契约**——它必须等于 `cordis.patch.yml` 里 `name: '@nonamelego/dsh-catppuccin'` 那行的 `id`；用户若自行改条目 id，新 Host 通道会失联并退回 localStorage-only（旧通道不受影响，因为旧 ns 由插件自己注册）。

### 5.3 `src/settings-catppuccin.ts`

- 抽出**字段工厂** `catppuccinSchemaFields()`：每次调用返回**全新**的 schemastery 节点。
  ⚠️ `.volatile()` 是原地改 `meta` 并返回 this，**不能复用同一批节点实例**，否则旧 schema 会被悄悄标成 volatile。
- 保留 `CatppuccinSettingsSchema = Schema.object(catppuccinSchemaFields())` 与 `CATPPUCCIN_SETTINGS_BASE`（旧 Host 通道仍需）。
- 新增 `Config = Schema.object(catppuccinSchemaFields().map(为每个字段套 volatile 守卫))`，字段名/默认值与 `defaultSettingsSection()` **逐字段一致**（客户端把"全等于默认"当作"没有用户层"的判据，默认值错一个就会在首启时往用户 patch 里写垃圾）：

  | 字段 | 类型 | 默认 |
  |---|---|---|
  | `flavor` | `union([...四个 themeId, 'off'])` | `'off'` |
  | `glass.enabled / .mode / .blur / .frost / .brightness` | `boolean / union(['mica','compat']) / number 0..40 / number 0..100 / number 0..100` | 同 `DEFAULT_GLASS` |
  | `autoCheck` | `boolean` | `DEFAULT_AUTO_CHECK` |
  | `updateChannel` | `union(['latest','beta'])` | `DEFAULT_UPDATE_CHANNEL` |
  | `overrides` | `dict(string())` | `{}` |
  | `shikiStyle` | `union(['default','italic-comments'])` | `DEFAULT_SHIKI_STYLE` |

  volatile 可标在 `glass` 整棵子树（简洁），也可标在每个叶子（更显式）。二选一，**不要同时**。

### 5.4 `src/migrate-legacy.ts`（新建，从 `index.ts` 搬出）

把 `migrateLegacyStateOnce` 搬过来并加两个参数化点，`index.ts` 保持"薄组合"：

```ts
export function migrateLegacyStateOnce(settings: SettingsLike, ns: string): Promise<void>
export function scheduleLegacyMigration(ctx: Context, settings: SettingsLike, ns: string): void
```

- `ns` 由调用方按通道给：旧通道 `CATPPUCCIN_SETTINGS_NS`，新通道 `CATPPUCCIN_ENTRY_ID`。
- **必须延迟 + 重试**（见 §6.3）：新通道下 `describe()` 只有在**自己这条 fiber 已 ACTIVE** 时才包含本条目，而 `ctx.inject(['settings'], cb)` 在 `settings` 已就绪时会**同步**回调——那一刻 fiber 还没 ACTIVE，`descriptor` 会是 undefined，迁移被静默跳过。
  建议实现：先试一次；未命中就挂 `ctx.on('settings/document-updated', ...)`（过滤 `ns === CATPPUCCIN_ENTRY_ID`）一次性补做，外加一个有上限的定时重试兜底；用一次性标志防重复写。所有失败仅 `console.warn`，绝不阻塞插件。
- 迁移前判据保持"文档里还没有用户层"：旧通道 `descriptor.user === undefined`；新通道用 `hasUserLayer(descriptor.user)`（见 5.5，`override` 缺省是 `{}`）。
- 写入用 `settings.update(ns, section, descriptor.revision)`——把刚读到的 revision 带上，比无条件写安全。
- **（P2，建议同批做）** 0.1.7 会一次性导入 `$DSH_HOME/settings.yaml` 并把文件改名成 `settings.yaml.imported`；section 按**同名条目**写入，本插件旧的 `catppuccin:` section 匹配不到任何条目 ⇒ 被拒、只留在 `.imported` 里，老用户升级会**静默丢偏好**。
  廉价修法：让 `readLegacyState()` 多认一个来源——先读 `settings.yaml.imported`，再读 `settings.yaml`，取其中 `catppuccin:` 段（与 `catppuccin-state.json` 同形）；两者都没有就跳过。注意从 `.imported` 读到的其实是「0.5.x 写在旧 settings 文档里的状态」，语义与本插件的一次性 JSON 迁移等价。

### 5.5 `src/index.ts`（Host）

- 新增 `export const Config = ...`（§5.3）与文档用的 `export interface Config`（字段为 `Volatile<T>`；本插件 Host 侧不读这些值，仅给 loader/tsserver 一个准确描述）。
- `inject` 保持 `['webServer']`。
- `ctx.inject(['settings'], (sctx) => { ... })` 内改成通道判定：

  ```ts
  const legacy = (sctx.settings as { installSection?: unknown }).installSection
  if (typeof legacy === 'function') {
    // ≤ 0.1.6-alpha.2：照旧注册命名空间 + 迁移到 CATPPUCCIN_SETTINGS_NS
  } else {
    // ≥ 0.1.7-alpha.1：什么都不注册；Config 已足够。
    // 可选：sctx.settings.configure?.({ auto: false }, ctx.fiber) —— 本插件自带宽设置行，
    // 关掉 schema 自动成页（保留 typeof 守卫，旧宿主没有 configure）。
    // 迁移走 CATPPUCCIN_ENTRY_ID。
  }
  ```
- `installSection` 的类型在新 devDep 里已经不存在 ⇒ 需要局部结构化类型 + 窄化（下同，见 5.6），并写注释说明为什么不用 `any`。

### 5.6 `src/client/state-sync.ts`（客户端适配层，改动最大的一个文件）

**关键设计约束：两个通道的语义差异必须"结构上无法泄漏"**。第一版草图把 `mutate(ops, expectedRevision?)` 直接暴露给调用方，等于把"要不要传栅栏"的决定权交给了不属于通道的代码——调用方一旦统一传 `baseRevision`，旧通道就被改了行为。所以对外接口里**不出现 `mutate`、也不出现对 `snapshot.user` 的直接判读**，两处差异各自成为通道的方法：

```ts
/** 两个通道共用的快照形状（0.1.5 与 0.1.7 逐字段同名，逐字段同义）。 */
export interface DurableSnapshot<T> { status; value; base; user; revision; writable; mode }

export interface DurableScope<T> {
  /** 命中的通道，仅用于诊断与测试断言。 */
  readonly kind: 'configForms' | 'settingsScope' | 'none'
  getSnapshot(): DurableSnapshot<T>
  subscribe(listener: () => void): () => void
  /** 宿主文档里是否已经有用户层。判据由通道决定（两套 describe 的缺省语义不同）。 */
  hasUserLayer(snapshot: DurableSnapshot<T>): boolean
  /** 一次原子写入。要不要把 baseRevision 当作宿主栅栏，由通道自己决定。 */
  write(ops: readonly SettingsPathOpView[], baseRevision: number | undefined): Promise<WriteOutcome>
}
export type WriteOutcome = 'accepted' | 'refused' | 'failed'
```

两个通道实现（**三处收敛点的落点就在这里**）：

| | `configForms`（≥ 0.1.7-alpha.1） | `settingsScope`（≤ 0.1.6-alpha.2） |
|---|---|---|
| `hasUserLayer` | `user` 是非空对象（`override` 缺省是 `{}`） | `snapshot.user !== undefined`（旧 describe 无段即缺字段） |
| `write` | `form.mutate(ops, baseRevision)` → `true`=`accepted` / `false`=`refused`；抛错=`failed` | `await scope.mutate(ops)`（**不传栅栏**）=`accepted`；抛错=`failed`；**拒绝静默，无法观测** |
| 语义理由 | 栅栏在 Host 侧真实生效，拒绝可观测 | 控制器自带 `pendingRevision ?? snapshot.revision` 回退；显式传更旧的 base 会把今天能成功的写变成静默丢失 |

`createDurableScope(ctx)` 内部：

- 维护 `current: DurableScope | undefined`；未绑定时 `kind: 'none'`、`getSnapshot()` 返回 `{ status: 'unavailable', mode: 'memory', … }`（等价于今天的"传输不可用"降级），`write` 直接返回 `'failed'`，`hasUserLayer` 返回 `false`（此路径下调用方在 `durableStateFromSnapshot` 就已提前返回，永远不会问到）。
- 两个**软注入**各自 attach，返回的 disposer 里 detach：

  ```ts
  ctx.inject(['configForms'], (c) => {            // 0.1.7+
    attach(configFormsChannel(c.configForms.get<CatppuccinSettingsSection>(CATPPUCCIN_ENTRY_ID)))
    return () => attach(undefined)
  })
  ctx.inject(['settingsScope'], (c) => {          // ≤ 0.1.6-alpha.2，类型已在 0.1.7 移除，
    attach(legacyChannel(legacyBind(c)))           // 用局部结构化类型 + 窄化访问
    return () => attach(undefined)
  })
  ```
  两者都不会拦住插件本体（软注入语义），也不会同时命中。
- 转发订阅：把 `current.subscribe` 桥接给外部订阅者，并在 attach/detach 时通知一次（让 hydration 重跑）。

其余函数签名相应调整：

| 函数 | 改动 |
|---|---|
| `isScopeUsable` | 不变（`status === 'ready' && mode === 'host'`），可选加 `writable !== false` |
| `durableStateFromSnapshot` | 不变 |
| `hasUserLayer` | **移入通道内部**（见上表），调用方只写 `scope.hasUserLayer(snapshot)`，不再直接读 `snapshot.user` |
| `persistStateToScope`（保留名字、改签名） | `const outcome = await scope.write(ops, baseRevision)`；`'accepted'` ⇒ `'written'`；`'refused'` ⇒ `'stale'`（新通道独有信号，控制器已内部重读过，语义等于"另一窗口已更新"）；`'failed'` ⇒ `'error'`。**旧通道的静默拒绝无法识别**——这正是读侧 revision 守卫必须保留的原因 |
| `scheduleDurablePersist` / `cancelDurablePersist` / `createBaseRevisionTracker` | 不变 |
| `bindCatppuccinScope` / 重导出的 `SettingsScope*` 类型 | 删除；改为导出 `DurableScope` / `DurableSnapshot` / `WriteOutcome` |

加一条门禁断言（§5.9）：`persistStateToScope` 的源码里**不得出现** `scope.mutate`，`src/client/index.ts` 里**不得出现** `snapshot.user`——两处收敛点一旦被重新泄漏，测试立刻红。

### 5.7 `src/client/index.ts`

- `inject` → `['slots', 'locale', 'theme']`（**删掉 `settingsScope`**，这是本 issue 的直接修复点）。
- `const scope = bindCatppuccinScope(ctx)` → `const scope = createDurableScope(ctx)`。
- `applyScopeSnapshot()` 里 `if (snapshot.user === undefined)` → `if (!hasUserLayer(snapshot.user))`。
- 头部注释同步改写（"bound through `ctx.settingsScope`" → 双通道说明）。
- UI 注册（`settings.general.item` × 4）**完全不动**：该槽位在 0.1.7-rc.1 仍然存在。

### 5.8 `src/client/glass/glass-layer.ts`、`src/state.ts`、`src/legacy-state.ts` 注释

只改注释里对 `ctx.settingsScope` 的引用，说明现在经适配层；无逻辑改动。

### 5.9 测试

| 文件 | 改动 |
|---|---|
| `tests/client.spec.ts` | 类型换成 `DurableScope`/`DurableSnapshot`；`mutate` double 补三条：`resolves(true)` → `'written'`、`resolves(false)` → `'stale'`、reject → `'error'`；新增 `hasUserLayer` 用例（`undefined` / `{}` / `{flavor:'x'}`） |
| `tests/reentrancy.spec.ts` | 现有 `provide('settingsScope', …)` 的用例**保留**（= 旧通道回归覆盖）；新增一份 `provide('configForms', { get: () => scope })` 的平行用例 |
| `tests/e2e/update-check.e2e.spec.ts` | 现在断言 `installSection` 被调用 ⇒ 拆成两个 describe：旧形 `settings` stub（带 `installSection`）断言注册 + ns='catppuccin'；新形 stub（**无** `installSection`，带 `configure`/`describe`/`update`）断言不抛错、`configure({auto:false})` 被调用、迁移尝试打到 `'dsh-catppuccin'` |
| 新增 `tests/settings-seam.spec.ts` | (a) `cordis.patch.yml` 里 `name: '@nonamelego/dsh-catppuccin'` 那行的 `id` === `CATPPUCCIN_ENTRY_ID`（守住 §5.2 的契约）；(b) **守卫逻辑**：`maybeVolatile` 对无 `volatile` 方法的节点返回原节点、对有该方法的节点返回其调用结果；`CatppuccinSettingsSchema`（不标 volatile）的 `toJSON()` 不含 volatile 元信息，`Config` 的每个字段都含；(c) `Config` 默认值与 `defaultSettingsSection()` 逐字段相等；(d) `configForms` 与 `settingsScope` 两条注入路径分别让 `createDurableScope` 变成对应 `kind` 且 usable；(e) **收敛点门禁**：读 `src/client/state-sync.ts` 与 `src/client/index.ts` 的源码文本，断言其中不出现 `scope.mutate` / `snapshot.user`（差异只能活在通道里） |
| 合并进 `tests/settings-seam.spec.ts` | 服务**永不出现**的软注入：不触发、不拦本体、`await root.fiber.dispose()` 不抛错（对应 §4.1 第 1 条的长期回归；`createDurableScope` 在未绑定态返回 `unavailable` 快照、写入直接短路、`kind==='none'`） |

---

## 6. 必须避开的坑（按踩到概率排序）

### 6.1 `.volatile()` 不存在于 schemastery 3.18.2

- `.volatile()` 是 `Schema.prototype.volatile = function () { return this.extra('volatile', true) }`，**3.18.3 起才有**（3.18.2 无此方法，实测 `TypeError: ....volatile is not a function`）。
- 宿主关系：`dsh-settings@0.1.5-rc.3` peer `@deepseek-ai/schemastery: 3.18.2`；`0.1.7-rc.1` peer `~3.18.4`。本插件的 `@deepseek-ai/schemastery` **由宿主 profile 树解析**，所以我们拿到的是宿主那一份。
- 后果：无条件 `.volatile()` 会在**模块求值期**抛错 ⇒ 旧宿主上插件从"pending"变成"加载失败"，比现在更糟。
- 修法：每个字段过一遍守卫

  ```ts
  type VolatileCapable = { volatile?: () => unknown }
  const maybeVolatile = <T extends object>(node: T): T =>
    typeof (node as VolatileCapable).volatile === 'function' ? (node as VolatileCapable).volatile!() as T : node
  ```

  旧宿主上得到的是普通 schema（等价于今天"没有 Config"的状态），新宿主上才是表单。

### 6.2 `user` 缺省是 `{}` 而非 `undefined`（**只针对新通道**）

原因见 §3.4。新通道上沿用 `user === undefined` 的后果：偏好只在 localStorage 里的老用户升级后，那一次选择再也推不进新文档——之后换浏览器 / 清站点数据 / 换端口就回落到默认。**旧通道不要跟着改**：实测旧 `describe()` 在没有该文档段时给 `undefined`、有段就给对象（含空对象 `{}`），现行判据在那里是准确的；统一改成 `hasUserLayer` 只会在"文档里是空段"这一边缘情形下多触发一次写入。让两个通道各带自己的判据（§4.2 第 3 条）。

**旧通道不要跟着改**：实测旧 `describe()` 在没有该文档段时给 `undefined`、有段就给对象（含空对象 `{}`），现行判据在那里是准确的；统一改成 `hasUserLayer` 只会在"文档里是空段"这一边缘情形下多触发一次写入。让两个通道各带自己的判据（§4.2 第 3 条）。

### 6.3 `describe()` 的 self-reference 竞态

`ctx.inject(['settings'], cb)` 在 `settings` 已就绪时**同步**回调，此时本条目 fiber 尚未 ACTIVE，`describe()` 不含自己 ⇒ 迁移静默跳过。必须延迟 + 事件补做（§5.4）。

### 6.4 `installSection` 与 `settingsScope` 的类型在新 devDep 里已消失

需要 1~2 处局部结构化类型（`{ installSection?: (…)=>… }` / `{ settingsScope?: { bind(…) } }`）+ 窄化访问，**不要用 `any`**，并在注释里写明"这是为跨版本兼容而保留的旧 seam 形状，0.1.7 起上游已移除"。

### 6.5 条目 id 是新的契约

新通道的表单 ns = profile 条目 id。本插件由 `cordis.patch.yml` insert `id: dsh-catppuccin`，与常量一致；用户若自行改 id 会失联并降级（不崩）。用 §5.9 的 patch 断言把它钉住。

### 6.6 `mutate(false)` 的资源语义

新控制器在 `persistence === 'memory'` 或 `disposed` 时也返回 `false`。我们已用 `isScopeUsable`（`status==='ready' && mode==='host'`）挡在前面，所以落到 `false` 基本就是 revision 冲突 ⇒ 按 `'stale'` 处理是对的。

### 6.7 「拒绝」在两个通道里的可观测性不对称

旧通道拒绝后静默 resolve（`void`），新通道返回 `false`。不要为了"顺手统一"给旧通道也传 `expectedRevision`——那会把失败从"用最新 revision 重试成功"变成"静默丢弃"（§3.2 表下方第 2 条）。差异收敛在适配器的写方法里，别泄漏到调用方。

---

## 7. 验证方法

### 7.1 静态与单测（本地，每次改动都跑）

```bash
pnpm typecheck && pnpm typecheck:tests && pnpm build && pnpm test
```

- `build` 后确认产物：`lib/index.js` 导出 `Config`；`lib/client.js` 里 **搜不到** `inject: [... 'settingsScope']` 这种硬依赖（`settingsScope` 只应作为软注入的服务名出现）。
  快速探针：`rg -c "settingsScope" lib/client.js` 与 `rg -n "volatile" lib/index.js`（后者应能看到守卫调用的痕迹）。
- 兼容旧版的关键论断已用一次性探针实测过：`.debug/compat-probe.mjs`（16/16 通过，gitignored）。**落地时把它搬成 §5.9 的 `tests/settings-seam.spec.ts`**——3.18.2 就在本仓库 node_modules 里，不需要装任何东西就能把"老宿主上不炸"钉成回归断言。

### 7.2 双通道 e2e（vitest，不需要升级真机）

`tests/e2e/update-check.e2e.spec.ts` 的两个 describe（§5.9）就是"0.1.5 形宿主"和"0.1.7 形宿主"的替身。这正是本轮最有价值的一层：**它把这次事故的形状（服务名/方法名漂移）变成可回归的断言**。建议对 `installSection` 缺失的分支做一次变异验证（把守卫去掉，确认测试变红）。

### 7.3 真机验证 0.1.7-rc.1（要动 C 盘，需维护者点头）

前置：本机 CLI 是 `0.1.5-rc.2`，且 `web` profile 依赖树已损坏（`@deepseek-ai/dsh-sandbox-local` 解析失败）。

1. 升级 CLI：`npm install -g @deepseek-ai/dsh@0.1.7-rc.1 --prefix "C:/Users/LeGo/AppData/Roaming/npm" --ignore-scripts`
   （`--ignore-scripts` 必带，否则 koffi 的 `cnoke.cjs --prebuild` 会因缺 CMake 失败并整包回滚。）
2. 修 profile：`dsh plugin --profile web install`（会下载到 C 盘，先确认空间）。
3. 装本地构建：`dsh plugin --profile web add link:D:\Vibe-Coding\dsh-catppuccin`。
4. `dsh web --no-open`，看 stdout token，浏览器打开 / Playwright 连上，检查：
   - 控制台**无** `pending (waiting for service:`；
   - 设置 → 通用 四条行都在，切风味生效；
   - 改一个旋钮后，**profile patch 落盘**：`$DSH_HOME/profiles/web/cordis.patch.yml` 里 `dsh-catppuccin` 条目出现 `config:`（可用 `settings.documentPath` 确认确切路径）——这是新通道的持久化落点，必须亲眼看一次；
   - 冷启动（关掉 dsh web 再起）后偏好仍在；
   - `$DSH_HOME/settings.yaml.imported` 存在时，确认 §5.4 的 P2 迁移把它吃进去（若做了）。
5. 旧线回归：另起一条 0.1.5-rc.3 的 CLI/prefix 跑同一步（或用 §7.2 的旧形 e2e 代替），确认升级后旧宿主行为不回退。

### 7.4 变异验证（这个仓库的既有习惯）

至少四处，去掉后确认对应断言会红——否则那些断言只是装饰：

1. 去掉 `typeof installSection === 'function'` 守卫（新形宿主应抛错）。
2. 去掉 `.volatile()` 的 `typeof` 守卫（换成无条件调用，`tests/settings-seam.spec.ts` 在 3.18.2 下应炸）。
3. 去掉新通道的 `hasUserLayer` 空对象分支（老用户偏好应重新变得推不进去）。
4. 去掉 `lib/client.js` 里 `settingsScope` 的软注入口（0.1.7 形宿主上的持久化断言应变红）。

---

## 8. 发布

- 版本：`0.5.6-beta.2`（修复走 `0.5.x`、预发布带 `-beta.n`）。
- CHANGELOG：在 `[Unreleased]` 写好条目（0.1.7 settings seam 迁移 + 双通道 + 老用户偏好迁移），发版时落成 `## [0.5.6-beta.2] - <日期>`。
- ⚠️ **推 tag 前必须问维护者**：tag 一推就自动发 npm、撤不回来。准备工作（版本号、CHANGELOG、本地全量验证、release commit）可以全做完，`git push origin main --tags` 等点头。
- 发布后：顺手更新 AGENTS.md 里"发版版本号"那句。

---

## 9. 附带发现（不影响本 issue，但值得单独处理）

`web-platform.ts` 的 `PLATFORM_MODULES` **与上游不一致**。上游（`dsh-v0.1.5-rc.3` 与 `dsh-v0.1.7-rc.1` 两版一致）为：

```
react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
@deepseek-ai/dsh-client-store, @deepseek-ai/dsh-client-ui-slots,
@deepseek-ai/dsh-client-ui-primitives, @deepseek-ai/dsh-client-ui-dockkit
```

本仓库现在写的是 `…dsh-client-web-react` + `…dsh-client-schema-form`（上游已无此二者），缺 `dsh-client-store` / `dsh-client-ui-dockkit`。

当前**不致命**：客户端从平台表里取值的只有 `react` / `react/jsx-runtime`，两者两版都在。但一旦以后要从 `dsh-client-store`（例如给设置行接 store）或 `dsh-client-ui-dockkit` 取**值**，就会撞上构建期的 bundle purity 门（被当跨界值导入直接报错）或运行时 `require` 落空。建议单独一个 chore 提交按上游同步。
