# 兼容模式误命中了别的面：取证、止血与反馈

- 适用版本：`0.5.8+`（`0.5.8` 按 issue #17 的证据收窄了最宽的三族，见下「历史」）
- 相关：`README.md` 的「兼容模式会命中哪些面」只保留命中族清单与三步索引，细节都在这里
- 相关：issue [#16](https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/16)（右侧栏残带）、
  [#17](https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/17)（三族退场）、
  [#19](https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues/19)（命令面板没有毛玻璃）

## 为什么会误命中

兼容模式靠**类名子串与语义属性**给宿主与第三方插件的悬浮面加玻璃，不需要任何插件配合。
代价是子串匹配**无法区分「面」与「面里的行级容器」**：同一个 `[class*='card']` 既能命中一张卡片，
也能命中卡片里的一行。

自 `0.5.8` 起，明确会被命中的族只剩这些（与 README 的表格一致）：

| 族 | 锚点 |
|---|---|
| 输入框卡片 | `[data-composer-card]`（宿主自己的属性；材质画在它的 `::before` 上，见 issue #19） |
| 菜单 | `[role='menu']` |
| 弹出层 | `[class*='popover']` / `[class*='dropdown']`（这两个仍是子串） |
| 模态框 | `[role='dialog'][aria-modal='true']` |
| 宿主右侧栏（仅展开态） | `[data-sidebar-right-panel][data-sidebar-right-open]` |

`0.5.8` 把最宽的三族收窄掉了（宽泛的 `card` 子串、`panel` 子串、行级 tooltip），
但**第三方插件里新出现的类名仍可能被误命中**。默认收窄要讲证据，所以遇到时走下面三步。

## 1. 取证（只读，粘进浏览器控制台）

列出当前所有被玻璃规则命中的元素、命中的规则原文与 computed 值：

```js
(() => {
  const rules = []
  for (const ss of document.styleSheets) {
    let rs; try { rs = ss.cssRules } catch { continue }
    for (const r of rs) if (r.selectorText && r.selectorText.includes('dsh-glass')) rules.push(r)
  }
  const out = []
  for (const el of document.querySelectorAll('[class*="card"],[class*="panel"],[role="tooltip"]')) {
    const hit = rules.filter(r => { try { return el.matches(r.selectorText) } catch { return false } })
    if (!hit.length) continue
    const cs = getComputedStyle(el), b = el.getBoundingClientRect()
    if (b.width < 8 || b.height < 8) continue
    out.push({ cls: String(el.className).slice(0, 48), w: Math.round(b.width), h: Math.round(b.height),
               bf: cs.backdropFilter, bg: cs.backgroundColor,
               rule: hit.map(x => x.style.cssText).join(' | ').slice(0, 60) })
  }
  console.table(out.slice(0, 40))
})()
```

输出是一张表：`cls`（类名片段）、`w`/`h`（尺寸，能一眼看出是不是「行级容器」）、
`bf`（computed `backdrop-filter`）、`bg`（背景）、`rule`（命中的规则原文）。

## 2. 临时止血

本插件**没有**「自定义 CSS」配置项：DSH 的 profile patch 层只能给**插件**写 `config`，
没有通用的用户样式入口。但**个别第三方插件自带样式入口**，例如 `dsh-better-sidebar@0.21.1`
的 `customCss`——它 gate 在自身的 `titleBarScheme: 'custom'` 上、以 `data-dsh-custom-css` 注入，
装了这类插件时也可以直接写在它的 `config` 里。

否则这一步要用外部注入——浏览器扩展（Stylus / 暴力猴）或 DevTools 的 Overrides——加一条
`!important` 规则把该族还原，例如：

```css
[class*='yourRow'] { backdrop-filter: none !important; background: none !important; outline: none !important; }
```

> ⚠️ `!important` 是临时手段。本插件**不会**为此内置覆写规则：那等于让插件接管第三方容器的结构，
> 对方一改就碎。正解是第 3 步。

## 3. 反馈

把第 1 步的表格输出连同 DSH 与插件版本贴到
[issues](https://github.com/NoNameLeGo/dsh-catppuccin-theme/issues)。

`0.5.8` 就是这么修出来的：报告人给了逐元素的 computed 对照，我们据此收窄**默认**规则——
这也是为什么没有「自定义 CSS」配置项：默认行为应该先是对的，配置项只能当补充。

## 历史

| 版本 | 变更 |
|---|---|
| `0.5.7` | compat 不再给 DSH 原生右侧栏的**布局壳**加模糊（`[class*='panel']` 曾命中 `P3OORG_panel` / `P3OORG_panelBody` 这类透明布局壳，关闭右栏后仍留 DOM，blur 继续绘制成右缘残带）；改为排除该容器整棵子树（按 `data-sidebar-right-panel`）并用 `data-sidebar-right-open` 回填展开态。issue #16 |
| `0.5.8` | 三族退场：`[class*='panel']` 与 `[role='tooltip']` 从 compat 规则里移除，`[class*='card']` 收窄到 `[data-composer-card]`。离线扫描 `0.1.7-rc.2` 全套客户端包 957 个文件里的 20 个 `*_card` 类名：18 个自绘 `background` ⇒ 我们的填充等于替换上游设计 token；2 个无任何 `background` 声明 ⇒ 规则是唯一把它们画出来的东西，正是报告人看到的灰纹与孤线。issue #17 |
| `0.5.9` | 命令面板恢复毛玻璃（浮层容器的 backdrop root 问题），详见 [`issue-19-palette-blur.md`](issue-19-palette-blur.md) |

判定手法（毛玻璃到底画没画、为什么这个浮层没有模糊）见技能 `css-backdrop-root-probe`，
以及 [`issue-19-palette-blur.md`](issue-19-palette-blur.md)。
