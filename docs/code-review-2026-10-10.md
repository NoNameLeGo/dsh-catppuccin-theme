# 代码审查报告 —— 2026-10-10

> **审查对象**：dsh-catppuccin（`@nonamelego/dsh-catppuccin`）工作区快照（`8cedf28`，版本 0.6.1）。
> **审查方法**：静态通读 `src/`（25 文件）、`tests/`（19 文件）、构建/发布配置、两个 workflow，
> 并对关键结论做**运行时取证**：官方 `ThemeRuntime` / `ThemePresenter` 的 tokens 应用方式、
> slots 框架的 inject 工厂缓存策略、npm 包实际内容（`lib/*.map` 的 `sourcesContent`）。
> **测试实跑**：审查当日 `pnpm test` 全绿 —— **19 文件 / 269 用例通过（42.9s）**（含 reentrancy、glass-css、migrate-legacy、双 seam、rows 全组）。
> **行号说明**：本报告行号为 2026-10-10 快照（与 `8cedf28` 对齐）；仓库既有规范倾向**符号名**引用，
> 两类定位符都给。行号漂移时用符号名检索。
> **既有基线**：上一轮审计 `docs/code-audit-2026-09-22.md`（F1~F9）与台账 `docs/plugin-improvements.md`
> 已确认修复/已实施的项目**不重复报告**，其中经本轮复核通过的在文末「确认没问题」清单列出。

---

## 1. 总体结论

**质量评级：高（可发布）。** 无 Blocker、无 Critical。

- 架构合规：`apply` / `inject` / `ctx.effect` 用法与官方插件形态一致；卸载路径覆盖完整；
  跨版本兼容全部走**特性探测**（`installSection`、`whileServed`、`.volatile()`）而非版本号解析，设计优秀。
- 安全：无 XSS 路径（已就 token 覆盖的注入面做运行时取证，见 §5）；localStorage 无敏感信息；
  唯一出网请求为公开 npm registry 查询，不携带用户数据；无 `eval` / `child_process` / `dangerouslySetInnerHTML`。
- 状态与持久化：迁移并发竞态（`claimed`/`settled`）与读侧陈旧写保护（`createBaseRevisionTracker`）**均已修复且在案**；
  残余一处 boot 窗口期低概率静默丢弃（R2，需真机确认窗口时长）。
- 类型与测试：`src/` 零 `any`（结构化局部类型替代）；测试 4947 行 / 18 个 spec + 1 个 e2e，
  CI（check + boot-e2e）与发布门禁（changelog 门禁、OIDC）齐备。
- 最大风险（均为"建议尽快修"级，非阻断）：
  1. **R1**（Major）：`theme.setTheme` 猴子补丁无幂等/共存保护——唯一一处改动宿主单例对象的地方；
  2. **R2**（Minor，需验证）：scope 未 ready 窗口内的用户改动可能被文档静默回滚；
  3. **R3**（Minor）：客户端 update-check 无超时，`checking` 卡死时按钮无法恢复。

**是否适合发布**：适合。0.6.1 已发布；R1/R2/R3 建议在 0.6.x 补丁版内消化（修复成本都极小）。

---

## 2. 风险地图（按模块）

| 模块 / 文件 | 风险 | 说明 |
|---|---|---|
| `src/client/index.ts` | **中** | R1（setTheme 补丁）、R2（persist 丢弃窗口）、R8（auto 结果无订阅）集中于 `apply` 的闭包编排；其余清理路径完整 |
| `src/client/state-sync.ts` | 低 | 写路径设计（无 fence、读侧 guard、channel 差异）有完整注释与测试；模块级 debounce 单槽在单实例前提下安全 |
| `src/client/glass/glass-layer.ts` | 低 | R4（滑块节流）、R5（死分支）；生命周期/DOM 还原完整 |
| `src/client/glass/glass-seams.ts` | 低 | rAF 合批已实施；全文档 9 选择器每帧一次的余量成本（已测，暂可接受） |
| `src/state.ts` | 低 | R6（`migrate()` 无调用者）；`sanitizeState`/`sanitizeOverrides` 防线完整 |
| `src/update-check/host.ts` | 低 | 8s 超时、错误码分类、ETag/304、失败不缓存，均已实施；无并发锁（幂等无害） |
| `src/client/UpdateRow.tsx` | 低 | R3（无 AbortSignal）；重试纪律（单次 30s、manual 重置）正确 |
| `src/profile-detect.ts` | 极低 | R11~R13 均为 Nit（只读探测、错误仅影响文案） |
| `package.json` / 发布物 | 低 | R7（无类型产物）；`.map` 发布为**有意决策**（KK，见 §6） |
| `src/tui-themes.ts` | 极低 | 有备份/幂等/`dryRun`；失败静默为**有意契约**（建议文档化） |

---

## 3. 问题清单

级别定义：Blocker / Critical / Major / Minor / Nit。**本轮未发现 Blocker 与 Critical。**

| 级别 | 位置（符号名 / 快照行号） | 问题 | 影响 | 修复建议 |
|---|---|---|---|---|
| **Major** R1 | `client/index.ts` `apply` → `theme.setTheme = wrapper`（575-578）、恢复（770） | 直接替换共享 `ThemeRuntime` 单例的 `setTheme`；恢复时无条件写回 `originalSetTheme`，无幂等/共存守卫 | 与其它同样包装 `setTheme` 的扩展共存时（当前生态无第二个包装者），卸载顺序可能导致**包装残留**或**抹掉对方的包装**；这是全仓唯一改动宿主对象之处 | ① 用局部 `wrapper` 变量替代匿名函数；② 恢复前校验 `if (theme.setTheme === wrapper) theme.setTheme = originalSetTheme`，否则 `console.warn` 不动；③ 补"第二个包装者在场"的卸载顺序测试 |
| **Minor** R2 | `client/index.ts` `persistLocal`（520-535）＋ `applyScopeSnapshot`（687-726）；`state-sync.ts` `scheduleDurablePersist` | scope 尚未 `ready`（或 `memory`）时，flush **直接 return 丢弃**；若此时文档已有 user layer，随后 hydration 判"document wins"会把本地改动覆盖回滚 | boot 后 ~百毫秒级窗口内用户在设置里的改动可能**静默丢失并回滚**（需文档已有 user layer，即非首装用户）。窗口时长未实测 | flush bail 时置 dirty 标记；`scope.subscribe` 回调检测到 `isScopeUsable()` 且 dirty 时重试一次 `queuePersist()`。或：hydration 的"文档胜出"分支前对比 localStorage 是否晚于快照（不易判定，首选 dirty-retry） |
| **Minor** R3 | `UpdateRow.tsx` `runCheck`（188-218）、按钮 `disabled={phase === 'checking'}`（358）；`client/index.ts` `runAutoCheck`（734-743） | 客户端 fetch 无 `AbortSignal` 超时；Host 半区有 8s 超时兜底，但半开连接/宿主卡死时 fetch 可悬挂，`checking` 阶段的按钮持续禁用，用户**无法重试** | 罕见条件下的"检查更新键永久变灰" | `fetch(url, { signal: AbortSignal.timeout(15_000) })`；catch 归入 `network.local`（`runAutoCheck` 同改） |
| **Minor** R4 | `glass/glass-layer.ts` `setBlur` / `setFrost` / `setBrightness`（315-342）→ `applySettings`（381-400） | range 滑块每次 `input` 事件执行 4×`setProperty` + 2×`toggleAttribute` + `publish()`（React 重渲染），且 `--dsh-glass-blur` 变量变化触发**全页所有 backdrop-filter 面重算** | 拖动期间每帧一次全量 CSS 变量写与重绘，玻璃模式下 GPU 负载进一步升高（issue #13 已实测 mica 流式约 80% GPU） | 值先入内存，`requestAnimationFrame` 合批后一帧一次 `applySettings()`；或分离"拖动中写变量 / 释放时 publish" |
| **Minor** R5 | `glass/glass-layer.ts` `ensureStyle`（425-436）/ `releaseStyle`（441-444）/ 模块级 `glassStyleTag`（56） | `releaseStyle()` 无条件移除标签并把模块引用置 `null` ⇒ `ensureStyle` 的 `if (glassStyleTag !== null)` **分支不可达**（注释声称的 "re-append" 优化未生效）：每次启用都重建 `<style>` 并重新解析约 15KB（minified）CSS 文本 | 每次开关玻璃多一次 CSS 解析；注释与实现不符（维护陷阱） | 二选一：① 保留引用跨 toggle（`releaseStyle` 改为仅 `remove()` 不置 null），让 re-append 分支生效；② 删除死分支并改注释。两处都在，说明意图与实现脱节 |
| **Minor** R6 | `state.ts` `migrate`（266-276）；`docs/state-migrations.md`「迁移链入口」 | `migrate()` **无任何生产调用者**（仅测试调用）；真实读路径全部走 `sanitizeState`（`legacy-state.ts readLegacyState`、`stateFromSettingsSection`、`durableStateFromSnapshot`） | 当前 v1 无害；但按文档指引为 v2 结构性迁移写 `migrateV1toV2` 时，**settings 文档主路径不会经过它**——迁移被静默跳过 | 接线：在 `stateFromSettingsSection` / `readLegacyState` 调用 `migrate()`（替代或包住 `sanitizeState`）；或至少在文档里写明"结构性迁移必须同时接入读路径" |
| **Minor** R7 | `package.json` `exports`（27-32）/ `files`（77-85）；`tsdown.client.ts`（95, 208） | `lib/` 无 `.d.ts` 产物，`package.json` 无 `types` 字段；`tsdown.client.ts` 注释 "Types ship from lib/types (tsc)" 与实际不符（注释系上游模板原文） | TS 消费者 import 无类型；注释误导维护者 | 明确决策：① 不发行类型 → 删除/改写注释并说明；② 发行 → build 增 `tsc --emitDeclarationOnly` 并补 `exports.types` |
| **Minor** R8 | `client/index.ts` `lastAutoResult`（543, 734-743）；`UpdateRow.tsx`（235） | 自动检查结果写入 `lastAutoResult` 时**不发通知**；行仅在其它 render 时重读 | 用户若在 boot+3s 前打开设置面板，自动检查的"发现新版本"横幅不会自行出现 | `runAutoCheck` 成功写入后调用 `emitPrefs()`（该行已订阅 prefs） |
| **Minor** R9 | `CatppuccinRow.tsx` `commitPersistedValue`（255-261）/ `commitDraftValue`（220-228）；`state.ts` `sanitizeOverrides`（187-194） | overrides 值不 `trim`、无最低格式反馈；把整行 `--dsw-x: #fff` 粘进值框（含 `;`/`:`）会被 CSSOM 静默丢弃 | 用户"设了没效果"，无任何提示；排查成本高 | 提交时若值含 `;` `{` `}` 拒绝并给行内提示；值统一 `trim()`（键已 trim，值未 trim，不对称） |
| **Minor** R10 | `glass/glass-row.tsx` `Knob`（63, 73） | `Number('') === 0`：清空数字框瞬间 `clamp(0)` 写入最小值（如 brightness 跳到 min） | 无法"清空重输"；误触即改值 | `if (e.target.value === '') return`（视作编辑中）再提交 |
| **Nit** R11 | `profile-detect.ts` `isRegistrySpec` / `installSourceOf`（163-178） | `npm:@scope/pkg@ver` alias spec 因 `^[a-z][a-z0-9+.-]*:` 命中被误分类 → 落到 `'git'` | 升级提示文案错误（"本地安装可能不适用"，实际是 registry 安装） | 特判 `npm:` 前缀 → `'registry'`（或至少 `'unknown'`） |
| **Nit** R12 | `profile-detect.ts` `detectProfile`（196, 234, 257-260） | profile 名（来自 argv hint / `desktopProfile.name`）未消毒即 `join()`，`..` 可穿透 | **只读** package.json，无写入、无泄露面；纯健壮性 | 拒绝含 `/` `\` `..` 的名称（可选） |
| **Nit** R13 | `profile-detect.ts` 扫描循环（246-260） | `readdir` 顺序非规范保证；多 profile 都装了本包时选择非确定 | 升级命令可能指向另一个 profile（同包装多处时） | 排序（优先 `desktop`/`web`）或按 manifest mtime 取新 |
| **Nit** R14 | `tests/glass-css.spec.ts`（整体） | 测试锁定的是**源文件** `glass.module.css`，运行时消费的是生成物 `glass-css.gen.ts`；无二者一致性断言 | 本地"改源只跑 tsdown"可产出过期 CSS 且测试全绿（CI/publish 会重新生成，发布物安全） | 加 spec：`transform(源) minify 结果 === GLASS_CSS_TEXT`（lightningcss 在 vitest 可用） |
| **Nit** R15 | `CatppuccinRow.tsx`（185-187）等 3 处 | `useSyncExternalStore` 缺第三个参数 `getServerSnapshot` | 当前全客户端渲染，无影响；若未来引入 SSR/hydration 会抛错 | 视需要补 `() => 同 getSnapshot` |

> 另有两处**不构成问题**但值得记录：`GlassLayer` 的 `unmount`/`sync` 每次 toggle 会重建 `<style>`（同 R5）；
> `handleUpdateCheck` 并发请求可同时 miss 缓存各自 fetch（幂等、无害，不加锁可接受）。

---

## 4. 优先修复顺序

**P0**（无）：没有阻断发布的问题。

**P1**（下一个补丁版本建议，全部小改）：
1. **R3** fetch 加 `AbortSignal.timeout`（1 行 × 2 处）——用户可感知的卡死。
2. **R1** setTheme 包装守卫 + 恢复校验（diff ~6 行）——架构卫生。
3. **R2** scope 未就绪窗口的 dirty-retry（~10 行）——先真机验证窗口是否可复现，再决定是否修。

**P2**（汇总进一次"健壮性批次"）：
4. R8（auto 结果 `emitPrefs`）、R9（值校验/trim）、R10（空输入）、R5（死分支二选一）——均 <10 行。
5. R6（`migrate()` 接线或文档澄清）、R7（类型发行决策）——决策成本 > 编码成本。
6. R4（滑块 rAF 合批）——需性能实测佐证收益后再做。

**P3**（Nit 批次，随手）：R11~R15。

---

## 5. 安全专题（按用户问项逐一作答，含取证）

| 问项 | 结论 | 证据 |
|---|---|---|
| XSS（自定义 token 值注入 DOM） | **无**。官方 `ThemePresenter` 用 `body.style.setProperty(name, value)`（CSSOM）逐 token 应用——值无法解析逃逸为额外规则或脚本；React 渲染路径全文本转义；无 `dangerouslySetInnerHTML` | `@deepseek-ai/dsh-client-ui-layout/lib/client.js` 的 `ThemePresenter.apply`（本机 0.2.0-rc.2 出厂包）；仓库 grep 无 `innerHTML`（用户数据）/`eval`/`new Function` |
| localStorage 敏感信息 | **无**。仅 7 个偏好键：flavor / restore / autoCheck / updateChannel / overrides / shikiStyle / glass.*（含 3 个数值旋钮）——全部为 UI 偏好，无 token、无路径、无标识 | `client/index.ts` 各 `*_KEY` 常量；`glass-layer.ts` `NUMERIC_KEYS`/`MODE_KEY`/`GLASS_ENABLED_KEY` |
| 更新检查泄露用户信息 | **无**。出网仅 `https://registry.npmjs.org/@nonamelego%2Fdsh-catppuccin`（公开 packument），headers 仅 `accept`（+条件请求 `if-none-match`）；无 cookie、无自定义标识；`channel` 参数只走本机路由 | `update-check.ts` `REGISTRY_PACKUMENT_URL`；`host.ts` `fetchLatestVersion` |
| npm 包不必要文件 | **符合预期，但体积可议**。包内：`lib/`（js+map）、`themes/`、`cordis.patch.yml`、`icon.png`、README、LICENSE；**不含** src/tests/scripts/配置。`*.map`（含 `sourcesContent` 全量 TS 源码）为**有意决策**（KK：stack trace 可读）——代价是体积 266KB→716KB（map 354KB+89KB+8KB，其中 client.js.map 比 client.js 还大） | `npm pack` 构成由 `files` 决定；实测 `lib/*.map` 含 14 个源文件全文（274,389 字符。源码 MIT 公开，无泄密性质） |
| 文件系统权限面 | 读取：`$DSH_HOME/profiles/*/package.json`（安装探测）、`$DSH_HOME/catppuccin-state.json`（迁移源，只读）、`~/.dsh-tui/themes/*`（对比）。写入：仅 `~/.dsh-tui/themes/catppuccin-*.json`（+`.bak`，名字前缀锁定）与经官方 settings 服务的文档写入。**无任意路径写** | `profile-detect.ts` / `legacy-state.ts` / `tui-themes.ts`；`tui-themes` 只处理 `catppuccin-` 前缀文件 |
| 「C3 级」评级的回应 | 能力与声明一致，未发现隐藏行为或可利用的越权路径。该插件的"强大能力"实为：改 UI 配色 + 写 TUI 主题目录 + 读 profile 元数据 + 条件触网（全部为用户可预期功能） | 本报告 §5 各条 |

---

## 6. 各维度复核结论（含"已修复复核通过"）

### 6.1 架构合规性
- 服务端 `inject = ['webServer']`、客户端 `inject = ['slots','locale','theme']`、TUI 半区无 inject——三者均与官方形态一致；
  `Config` 导出满足 Loader 契约；settings 双 seam 由特性探测分流（`installSection` ⇒ legacy / `configure` ⇒ 新版）✓。
- 卸载清理**完整**：locale disposers（`ctx.effect`）、theme 注册 disposers、`theme/change`、`storage` 监听、
  boot/interval 定时器、MutationObserver + rAF、retry 定时器、slots 注册、`cancelDurablePersist`、DOM 还原（属性/fade/style 标签）、`setTheme` 还原。**未发现泄漏**。
- `cordis.patch.yml`：两条 insert 结构正确；`dsh-catppuccin` id 与 `state.ts` 的 `CATPPUCCIN_ENTRY_ID` 契约由测试锁定 ✓。
- 复核通过（9-22 审计项）：`NUMERIC_STORAGE_KEYS` 反查修复、`readExplicitFlavorOff` 跨窗 off、`baseRevisionTracker` 读侧保护、`hasUnpersistableOverrides` 收敛、`nextDraftId` 稳定 key、retry channel 按 call-time 解析 ✓。

### 6.2 前端渲染性能
- 组件不会因"注入面重建"而重渲染：slots 框架对 inject 工厂做 **`useMemo` 缓存**（`dsh-client-ui-renderer/lib/client.js` 的 `cached*Inject`），`injected()` 返回稳定引用 ✓。
  组件均未 `React.memo`——对当前渲染频率（主题/偏好变更触发）足够，不建议加。
- 动画/过渡：keyframes **opacity-only**；`transition: margin/border-radius 150ms`（Mica 布局切换，一次性，与宿主 rail 动画对齐）；switch knob 用 `transform`；**无 `will-change`**；
  `backdrop-filter` 面约 12 处规则、已按"是否覆盖运动内容"分档并有 `tests/glass-css.spec.ts` 双向护栏（issue #13 实测数据在案）。**无布局抖动与合成层失控证据**。
- 令牌覆盖：190+ token 的写入由官方 presenter 执行（每次 publish 全量 remove+set），发生在主题切换/重注册时而非每帧；懒注册（JJ）已把常驻注册数压到 1 个风味。成本与开关频率成正比，可接受（R4 是交互期的可优化点）。
- 残余成本记录：seam stamper 每帧最多 1 次 9 选择器全文档扫描（rAF 合批已实施；长会话下的稳态开销未单独测量）。

### 6.3 状态管理与持久化
- **`catppuccin-state.json` 现在只读**（迁移源）：不存在插件侧的并发写/部分写/损坏风险；写入统一走官方 settings 服务（原子写 + revision fence）。
  `readLegacyState` 对缺失/损坏 JSON 返回 `null`（非致命）✓。TUI 主题文件直写（`writeFileSync`）无原子保护，但 drift 时下次启动自动备份+重写，**自愈** ✓。
- 迁移幂等：`migrateLegacyStateOnce` 只在"文档无 user layer"时写入，`claimed`/`settled` 防并发（2026-09-24 实测竞态已修）✓；异常全非致命，legacy 文件保留为 rollback ✓。
- `profile-detect` 健壮性：不解析版本、纯结构探测；`catch` 全覆盖返回 `undefined`/fallback ✓（Nit 见 R11~R13）。

### 6.4 错误处理
- 更新检查：Host 侧 8s 超时 + `network.upstream`/`registry-unreachable`/`registry-http`/`no-dist-tags`/`invalid-response` 分类 + 失败不缓存 + ETag/304 复验 ✓；UI 单次 30s 重试 + manual 重置 ✓（R3 为客户端超时缺口）。
- 版本兼容：全部特性探测；旧宿主降级为"localStorage-only + 不透明菜单 + 无详情卡"，功能不静默失败 ✓。
- TUI 写入失败：**有意静默**（不拖慢 profile 启动，注释在案）。可感知性差是取舍；建议在 README 故障排查里加一句"主题未出现时检查 `~/.dsh-tui/themes/` 写权限"。

### 6.5 代码质量
- 类型：`strict: true`；**零 `any`**、零 `as any`；跨版本差异用结构化局部类型（`LegacySettings`/`LegacyScope` 等）表达，少量 `as unknown as` 均有注释，属可接受。
- locals/palettes：`zh` 为键集真源、其余字典编译期校验 + `locales.spec.ts` 锁等；`palettes.ts` 生成头 + `UPSTREAM_PIN` 审计锚点；手改边界在 `AGENTS.md` 有硬规则 ✓（注意：`migrate()` 的"文档-实现"缺口同类，见 R6）。
- 测试：4947 行、18 spec + e2e；覆盖 reentrancy（issue #10）、glass blur 预算（issue #13）、双 seam、迁移、profile 探测等高风险点；CI 另跑 boot-e2e ✓。

---

## 7. 建议补充的测试用例

| # | 用例 | 目的 |
|---|---|---|
| T1 | `glass-css.gen.ts` 一致性：`transform(glass.module.css,{minify:true}) === GLASS_CSS_TEXT` | 锁生成物同步（R14；当前测试只看源文件） |
| T2 | setTheme 包装共存：模拟"第二包装者在场"，卸载本插件后断言对方的包装仍在（采纳 R1 后应为红→绿） | 锁 R1 |
| T3 | scope 迟到窗口：boot 时 scope=`loading`，用户在 ready 前 `select(flavor)`，随后 scope 变 `ready`（含旧文档值）→ 断言用户改动最终落盘（或明确有提示），**不静默回滚** | 锁 R2（先写红再修） |
| T4 | update fetch 悬挂：mock fetch 永不 resolve + fake timers → 断言超时后 UI 回到可重试态 | 锁 R3 |
| T5 | `isRegistrySpec('npm:@scope/pkg@1.0.0')` → `'registry'`（或 `'unknown'`） | 锁 R11 |
| T6 | overrides 值含 `;` / `}` 的提交行为（拒绝 + 提示，或明确忽略策略） | 锁 R9 |
| T7 | `Knob` 数字框清空（`''`）不写值 | 锁 R10 |
| T8 | 自动检查结果到达后 UpdateRow 自动刷新（render 计数或横幅出现断言） | 锁 R8 |

> 已有测试无需重复：多窗口 revision 冲突（`client.spec.ts`）、storage 分支接线、迁移并发（`migrate-legacy.spec.ts`）、
> roving tabindex（`glass-layer.spec.ts`/`rows.spec.tsx`）等均已在 9-22 轮补齐。

---

## 8. 不确定 / 需确认项

1. **R2 的窗口时长**：`scope` 从 `loading` 到 `ready` 的实际耗时决定该缝隙的可复现性（派生自共享 mirror，通常亚秒级）。建议真机 + CDP 仪器化验证，或直接按建议加固（成本低）。
2. **`.map` 发布决策复核**（KK）：含 `sourcesContent` 的 map 让包体翻 2.7 倍，换取 stack trace 可读。是否有必要保留到"每个版本都带"可再权衡（例如仅正式版带、beta 不带）。
3. **`lib/types` 注释**：是上游模板遗留，还是"类型发布"曾在路线图上？取决于 R7 的决策方向。
4. **`t()` 缺失键返回键名本身**（`CatppuccinRow.subtitleText` 依赖它做存在性判断）：请确认这是 slots locale 的契约行为而非巧合；若是隐含行为，建议改为显式存在性查询。
5. **官方 `slots.register` 对同 id 的重复注册行为**：本插件用固定 id（`'catppuccin'` 等），卸载→重装路径下是否绝对避免 dup 抛错（当前推断安全，未实证）。
6. **`dsh.client.inject` 含 `dsh-client-connection`，源码中无任何 import**（其余 5 项均有 import：renderer/locale/theme/settings/api-remotes）。官方语义（`dsh-client-modules` 的 `WebBootEntry.inject` 注释）是"**工厂到达顺序 + entry 组合的包依赖边**"，不是 import 清单——所以它可能是有意的加载排序声明（connection 是 settings 遥测链的上游），也可能可精简。**在未验证加载时序前不建议删**；若要精简，先确认 `ctx.configForms` 在 connection 工厂缺席时的物化顺序不受影响。
7. **审查边界**：本轮为静态审查 + 上游包取证 + 配置核对，**未运行真机 e2e / boot-e2e**（CI 覆盖）；未审计 `scripts/`（4 mjs / 3 cjs / 1 py）与 `themes/*.json` 生成物内部一致性（9-22 轮已重跑生成器核对过一次）。

---

## 附：本轮复核过的"确认没问题"清单（防止未来重复排查）

- `state-sync.ts` 无 fence 写 + 读侧 guard 的组合语义（含 `stale` 收敛路径）——与注释一致，测试在案。
- `sanitizeOverrides` / `hasUnpersistableOverrides` / `settingsSectionsEqual` 的双向比较语义——正确。
- `migrate-legacy.ts` 三段时间表（0ms / document-updated / 3s）有界且 fiber-scoped——正确。
- `update-check/host.ts` 的缓存分桶（`default` ≠ `latest`）、304 无缓存不误报——正确。
- `tui-themes.ts` 的 `.bak` 单份轮转语义（第二次 sync 因 dest 已同源而不再覆盖 .bak）——自洽。
- `glass-seams.ts` 的 `disposed` 守卫防 dispose 后 rAF 回写——正确（有注释与全轮测试佐证）。
