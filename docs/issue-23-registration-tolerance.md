# issue #23 — 注册类调用容错（语言包 ID 冲突不得炸掉整个 boot）

> 状态：**已实施（未发版）**（2026-10-12）——实施记录见 §7。
> 报告人：yuzlyn（[issue #23](https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/23)，报告内容已逐条复核）。
> 上游取证基准：`@deepseek-ai/dsh-client-locale` / `dsh-client-ui-theme` / `dsh-client-ui-slots` /
> `dsh-settings` / `cordis` / `dsh-host-webserver` 的 **0.2.0-rc.2**（locale 另对 **0.1.7-rc.2** 复核，
> 文案逐字一致）；崩溃链在官方壳 `app.asar` 与 web 前端产物上交叉确认。
> 关联：`docs/locale-review.md`（item YY，注册方式的背景）、AGENTS.md 规则 4 的「代价太高了」原则。

## 0. 一句话

`apply()` 里**任何同步抛错**都会把本 entry 打成 `failed` → 整条 `web boot` 中止 →
官方桌面壳的崩溃救援 `disableAllPlugins()` 把**所有**第三方插件一起关停。
语言包抢注 `ja` 只是最先撞上的一颗雷——同形状的「裸注册」在本插件里还有若干处，
统一降级为「跳过 + 日志」，绝不让辅助性注册有权关停整个应用。

## 1. 根因链（每环都有出处）

| # | 环节 | 证据 |
|---|---|---|
| ① | 11 个语言注册裸调用 | `src/client/index.ts` 的 `ctx.effect(..., 'catppuccin: dictionaries')`：6×`locale.register` + 5×`locale.addLanguage` |
| ② | 上游 id 占用直接抛 | `dsh-client-locale/lib/client.js`：`addLanguage` → `locale "ja" is already registered`；`register` → `locale namespace "…" already has locale "…"`（0.2.0-rc.2 与 0.1.7-rc.2 文案一致）。**第三个抛错面**：fallback 不在 catalog → `locale fallback "en" is not registered`（预探测防不住这种） |
| ③ | `ctx.effect` 同步执行、原样 rethrow | `cordis/lib/index.js`：`try { task = this._execute(runner) } catch (reason) { …; throw reason }` |
| ④ | entry 变 FAILED | `Fiber._reload()` 的 catch → `_error` 置位 → state=failed → `await()` 重抛 |
| ⑤ | 整条 boot 中止 | web 前端 boot 组装：entry 非 active → `throw new Error('web boot: 1 entry did not activate…')`（与报告日志逐字一致） |
| ⑥ | 连带伤害 | 官方壳 `app.asar` 内存在 `disableAllPlugins()` 并在启动失败路径调用 → 全部第三方插件被系统关停 |

对照：`dsh-locale-pack` 自己 `try/catch + /already registered/`，所以**谁先激活谁赢**——
完全吻合报告人观察到的「装了语言包的机器 100% 复现、干净环境不复现」。

## 2. 修复方案

### 采纳的（报告人的核心建议）

- **降级为 no-op**：重复注册只跳过自己这一份，不失败 entry。
- **try/catch 包装**（而非预查 `getLocale().locales` 表）：
  - 预探测只能防「id 已占用」一种，防不住 ② 的 fallback 缺失 / 非法 id / chain 循环等其它抛错面；
  - try/catch 不依赖任何新 API，0.1.5 ~ 0.2.0 全线上语义一致，测试替身也不用扩。

### 与报告人建议的分歧（唯一一处）

报告人建议「非 `already registered` 的错仍然 rethrow」。**不采纳**，改为
「warn 日志 + 同样跳过」，理由：

1. rethrow 的代价是「GUI 打不开 + 全部插件被关停」，而这条路径上全是**辅助性注册**
   （语言 / 字典 / 主题 / 设置行），最大损失是「某行文案退化」。代价不对称到不需要犹豫。
2. 真出 shape bug 时不会静默消失：测试套件会红，且其余调用点（`getLocale()` 等）会一起坏。
3. 保留切换自由度：想把某类错误恢复成 fail-fast，只需把 warn 分支的 `return () => {}`
   换成 `throw error`（两行内）。

### 新增模块

`src/registration-tolerance.ts`（host / client 共用，双端内联，与 `update-check.ts` 同模式）：

```ts
/**
 * 容忍型注册：boot 关键路径上的辅助注册一律「跳过 + 日志」。
 * 已知的「他方已占用」形态静默跳过（与 dsh-locale-pack 的生态惯例一致）；
 * 其余异常记 warn 后同样跳过——这里没有任何一项注册值得用户的全套插件陪葬。
 */
export function tolerantRegistration(run: () => (() => void) | void): () => void {
  try {
    return run() ?? (() => {})
  } catch (error) {
    const message = String((error as Error)?.message ?? error)
    if (!ALREADY_OWNED.test(message)) {
      console.warn(`[dsh-catppuccin] registration skipped — ${message}`)
    }
    return () => {}
  }
}

/** 上游「他方已占用」的报错形态（逐条对过 0.2.0-rc.2 源码）。 */
const ALREADY_OWNED = /already (?:registered|has locale|has an entry)|duplicate .*route/u
```

## 3. 落地清单（精确到位置，含建议改法）

| # | 位置 | 现状 | 改法 |
|---|---|---|---|
| 1 | `src/client/index.ts` 的 `catppuccin: dictionaries` effect（11 个注册） | 裸调用，任一抛错即假死 | 每个调用包 `tolerantRegistration(() => …)`；disposers 数组结构不变 |
| 2 | `registerThemeFor()` 的 `theme.register({…})` | 裸调用；同步可达路径 = `applyScopeSnapshot → reapplyThemePrefs` | 包一层；失败时往 `themeDisposers` 存 noop（防重复重试风暴） |
| 3 | 4 个 `ctx.slots.inject('settings.general.item', …)` 回调里的 `ctx.slots.register` | 槽已声明时**同步**执行回调，抛错=致命 | 回调内包一层 |
| 4 | 详情卡 `ctx.slots.inject('plugins.bundle.config', …)` 的 register | 同上（在子 fiber 里，非致命但仍是噪声 + 监听泄漏） | 同上 |
| 5 | `src/index.ts`：`settings.configure?.({ auto: false }, ctx.fiber)` | **丢弃了返回的 disposer**（上游文档明说 "register it with the calling plugin's effects"） | 接住并在子 fiber 回调里 return：`const off = settings.configure?.(…); … return typeof off === 'function' ? () => { off() } : undefined` |
| 6 | `src/update-check/host.ts`：`ctx.effect(() => webServer.register({…}))` | 路由重复 → `webserver: duplicate exact route "…"` → 宿主 entry 启动失败 | 包 `tolerantRegistration`（另一份实例在时，路由由它服务） |
| 7 | `handleUpdateCheck` 的 `void handleUpdateCheck(ctx, req, res)` | 无顶层 catch；抛错 = unhandled rejection（Node 24 默认可终止进程） | 补 `.catch((error) => console.warn(…))`；纯保险（抛面实际很窄） |
| 8 | （可选）行的 `select()` 里两处 `theme.setTheme` | 其余 3 处已包，这两处未包；失败会冒到 React 事件层 | 包 try/catch，点击失败只降级不冒泡 |

## 4. 排查结论：全部注册 / 外部调用点，三档

### A 档 — boot 致命路径（同步、可被外部状态触发）⇒ 必修

| 项 | 触发场景 | 上游证据 |
|---|---|---|
| 1. 语言注册 ×11 | **现实**：任何注册同批 BCP 47 ID 的语言包共存（issue #23 本体） | 见 §1 ② |
| 2. `slots.register` ×5 | 双份安装 / 同 id 占用（`id`+`priority` 唯一）。槽已声明时 `slots.inject` 同步跑回调并 rethrow——上游文档注释原话：*"@throws callback setup failures synchronously when the slot is already declared"* | `SlotCore.register` → `list slot "…" already has an entry with id "…"` |
| 3. `theme.register` | 双份安装。同步可达路径 = `applyScopeSnapshot → reapplyThemePrefs`（dispose 后重注册，同 id 在别处存在时抛）；另两条路径（microtask / `storage` 事件）非致命但会变成 uncaught error 噪声 | `theme "…" is already registered` |
| 4. 宿主 `webServer.register` | 双份安装 → 宿主 entry 启动失败 | `webserver: duplicate exact route "…"` |

> 为什么「双份安装」也算现实场景：官方壳的升级路径是「删掉重装」（AGENTS.md），
> 任何一步没清干净就会留下两条 entry；而后果同样是全插件关停，容错成本又只有一行。

### B 档 — 非致命，但属契约违反 / 进程级风险 ⇒ 建议顺手修

- **5. `settings.configure` 丢弃 disposer**（§3-5 修）：宿主 fiber 一旦重启
  （Loader 配置变更 / HMR / 依赖服务重载），子 fiber 重跑回调必然命中上游
  `@throws "Settings presentation is already configured for this plugin instance"` →
  子 fiber 挂、本次激活里后续的 `scheduleLegacyMigration` 被跳过。
  （auto:false 策略本身还在 map 里，用户可见影响小，但属明确的契约违反。）
- **6. `void handleUpdateCheck` 无 catch**：Node 24 默认把 unhandled rejection 当未捕获异常。
- **7. 行 `select()` 的两处 `setTheme` 未包**：只影响单行交互，不致命。

### C 档 — 逐项核对过、确认安全（不修；防误判为漏网）

- `createDurableScope` 与详情卡的 `ctx.inject(['configForms'], …)`：**子 fiber**，抛错不伤 entry；
  且上游 `configForms.get(entryId)` 对任意 id 都是惰性建 form（不校验、不抛）。
- 全部 localStorage 读写：逐处 try/catch；`hostHasMenuBlur` / `resolveDark`：`typeof` + try 守卫。
- settings 文档水合链（`sanitizeState` → `stateFromSettingsSection`）：逐字段 sanitize，
  手改文档也进不了同步抛错路径。
- `scheduleLegacyMigration` / `migrateLegacyStateOnce` / `readLegacyState`：
  reject 全 catch、重试有界、fiber 作用域。
- 渲染期的 4 个 row `inject` 工厂：渲染器有 per-entry `SlotErrorBoundary`
  （*"one registrant crashing … must not take down siblings"*）→ 单行崩溃被隔离。
- `theme.setTheme` 其余调用点：已包或调用前确保注册存在。
- legacy `settings.installSection`（DSH ≤ 0.1.6 线）：本地无该版本包可取证，
  且它位于子 fiber → 不致命；**暂不动**，等真实旧宿主报告。

## 5. 验证与发版

- 新增 `tests/registration-tolerance.spec.ts`（jsdom，直接挂真 `apply()`，
  替身沿用 `tests/reentrancy.spec.ts` 的 theme / slots / configForms 形态）：
  1. `addLanguage` 抛 `already registered` → `apply()` 不抛；其余注册照常；卸载清理不抛。
  2. 语言替身抛非重复错（如 TypeError）→ 不抛 + `console.warn` 有记录（spy 断言）。
  3. `slots.register` 抛 `already has an entry…` → 不抛，后续注入照常。
  4. `theme.register` 重复 → 不抛（microtask flush 后断言）。
  - **变异验证**：把容错回退 → 四例全红（对齐本仓 R1~R3 测试的惯例）。
- `pnpm test` 全绿 + `pnpm build`。
- 版本 `0.6.2-beta.2`，走 AGENTS.md 的发版 SOP；CI 的 boot-e2e 兜底。
- issue #23 回帖：说明「降级 no-op 采纳 / 非重复错不 rethrow」的分歧与理由，附本文档链接。

## 6. 上游报错文案速查（后续复用）

| 文案 | 来源 | 归类 |
|---|---|---|
| `locale "ja" is already registered` | dsh-client-locale `addLanguage` | 静默跳过 |
| `locale namespace "…" already has locale "…"` | dsh-client-locale `register` | 静默跳过 |
| `locale fallback "en" is not registered` | dsh-client-locale `addLanguage` | warn + 跳过 |
| `theme "…" is already registered` | dsh-client-ui-theme `register` | 静默跳过 |
| `list slot "…" already has an entry with id "…"` | dsh-client-ui-slots `register` | 静默跳过 |
| `webserver: duplicate exact route "…"` | dsh-host-webserver `register` | 静默跳过 |
| `Settings presentation is already configured for this plugin instance` | dsh-settings `configure` | 由 §3-5 的 disposer 修复消除，不靠吞错 |

## 7. 实施记录（2026-10-12，**未发版**）

- 新增 `src/registration-tolerance.ts`：`tolerantRegistration` + `ALREADY_OWNED` 形态表。
- 落地清单 **8/8**：语言注册 ×11、`theme.register`、设置行 slot ×4、详情卡 slot →
  全部经 `tolerantRegistration`；宿主 `settings.configure` 接住并归还 disposer；
  宿主 `webServer.register` 包容错；`handleUpdateCheck` 的 `void` 调用补 `.catch`；
  行 `select()` 两处 `setTheme` 补 try/catch。
- 新增 `tests/registration-tolerance.spec.ts`（5 例）：语言冲突静默跳过（11 次调用全尝试、
  warn 不响、卸载不抛）／非重复错 warn + 跳过／slot 重复四行全跳过／theme 重复跳过但
  风味仍生效（微任务不炸）／helper 单元两分支。
- **变异验证**：把 `tolerantRegistration` 回退为裸调用 → 5 例全红，且主题用例复现
  pre-fix 形状（`ensureThemeRegistered → registerThemeFor` 的**微任务未捕获异常**）；
  还原后全绿。
- 验证：`pnpm typecheck` + `pnpm typecheck:tests` 干净；全量 `pnpm test` **286/286**
  （281 → 286）；`pnpm build` 通过。
- 发版：随 **`0.6.2-beta.2`** 发布（预发布按仓库惯例内容留在 CHANGELOG 的 `[Unreleased]` 节）；
  release commit 已备好，`tag` 推送待维护者放行（publish.yml 监听 `v*` tag）。
