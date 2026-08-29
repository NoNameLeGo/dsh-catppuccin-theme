#!/usr/bin/env node
/**
 * CHANGELOG 草稿生成器（零依赖，Node 内置 child_process）。
 *
 * 从 git 历史按 conventional commits 分组，生成中文 Keep a Changelog 风格
 * 草稿。双语支持：commit 正文里放一行 `EN: <英文摘要>` 时，该条输出为
 * `- **中文标题**（EN: 英文）`；没有 EN 行则只输出中文。
 *
 * 用法：
 *   pnpm changelog:gen                 # 打印 上一 tag..HEAD 的草稿
 *   pnpm changelog:gen -- --from vX --to vY   # 指定区间（默认 from=最近 tag, to=HEAD）
 *   pnpm changelog:gen -- --write      # 草稿写入 CHANGELOG.md 的 [Unreleased] 节
 *
 * 生成的只是草稿，发版前仍需人工润色（补日期、合并条目、删噪音）。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** 跑 git（execFileSync 不经 shell，避免 Windows cmd 展开 `%s%` 等 format 占位符）。 */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

/** conventional type → 中文分组标题（顺序即输出顺序）。 */
const GROUPS = [
  ['feat', '新增'],
  ['fix', '修复'],
  ['perf', '性能'],
  ['refactor', '重构'],
  ['docs', '文档'],
  ['test', '测试'],
  ['style', '样式'],
  ['ci', 'CI/构建'],
  ['build', '构建'],
  ['chore', '其他'],
  ['revert', '回滚'],
]

/** 解析 `type(scope): subject` 形式的 conventional 标题。 */
function parseSubject(subject) {
  const m = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$/.exec(subject.trim())
  if (!m) return null
  const [, type, scope, text] = m
  return { type: type.toLowerCase(), scope, text: text.trim() }
}

/** 从 commit 正文提取 `EN: xxx` 一行（大小写不敏感，取第一行）。 */
function extractEn(body) {
  if (!body) return null
  const m = /(?:^|\n)\s*EN:\s*(.+?)(?:\n|$)/im.exec(body)
  return m ? m[1].trim() : null
}

/** 取当前 git 目录下的最近发布 tag（排除 HEAD 自身所在 tag）。 */
function lastTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0', 'HEAD~1']).trim()
  } catch {
    try {
      return git(['describe', '--tags', '--abbrev=0', 'HEAD']).trim()
    } catch {
      return null
    }
  }
}

/** 收集 from..to 区间内的 commits（subject + body）。 */
function collectCommits(from, to) {
  if (!from) return []
  const out = git(['log', `${from}..${to}`, '--format=%s%x00%b%x00'])
  const commits = []
  for (const chunk of out.split('\x00')) {
    const clean = chunk.trim()
    if (!clean) continue
    // git 的 %b 会带出分隔换行（%s 与正文之间的空行），整体 trim 后再拆
    const [subject = '', body = ''] = clean.split('\n', 2)
    const trimmed = subject.trim()
    if (!trimmed) continue
    const parsed = parseSubject(trimmed)
    if (!parsed) continue // 跳过非 conventional 提交（merge、乱格式）
    if (parsed.type === 'chore' && parsed.scope === 'release') continue // 发布提交本身不是变更
    commits.push({ ...parsed, subject: trimmed, body: body.trim() })
  }
  return commits
}

/** 生成 markdown 草稿。 */
function render(commits, rangeLabel) {
  const byType = new Map()
  for (const c of commits) {
    if (!byType.has(c.type)) byType.set(c.type, [])
    byType.get(c.type).push(c)
  }
  const lines = []
  // 无可用分组时提示空
  let any = false
  for (const [type, title] of GROUPS) {
    const list = byType.get(type)
    if (!list?.length) continue
    any = true
    lines.push(`### ${title}`)
    lines.push('')
    for (const c of list) {
      const en = extractEn(c.body)
      const scope = c.scope ? `\`${c.scope}\`` : ''
      const core = en ? `- **${c.text}**（EN: ${en}）` : `- ${c.text}`
      lines.push(scope ? `${scope} ${core}` : core)
    }
    lines.push('')
  }
  if (!any) {
    lines.push('- 无（区间内没有可归类的 conventional 提交）')
    lines.push('')
  }
  return lines.join('\n').trim() + '\n'
}

/** 把草稿写入 CHANGELOG.md 的 [Unreleased] 节（替换其现有内容）。 */
function writeUnreleased(draft) {
  const file = path.resolve(process.cwd(), 'CHANGELOG.md')
  let content = fs.readFileSync(file, 'utf8')
  const re = /(## \[Unreleased\]\n\n)[\s\S]*?(?=\n## \[)/m
  if (!re.test(content)) {
    console.error('CHANGELOG.md 中找不到 [Unreleased] 节，中止')
    process.exit(1)
  }
  content = content.replace(re, `$1${draft}\n`)
  fs.writeFileSync(file, content)
  console.log(`已写入 CHANGELOG.md 的 [Unreleased] 节：`)
  console.log(draft)
}

const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const from = arg('--from') ?? lastTag()
const to = arg('--to') ?? 'HEAD'
const write = args.includes('--write')

if (!from) {
  console.error('没有可用的起始 tag（--from）')
  process.exit(1)
}

const commits = collectCommits(from, to)
const rangeLabel = `${from}..${to}`
console.error(`[gen-changelog] 区间 ${rangeLabel}，解析 ${commits.length} 条 conventional 提交`)
const draft = render(commits, rangeLabel)

if (write) writeUnreleased(draft)
else console.log(`<!-- 草稿 ${rangeLabel}，发版前人工润色后放入版本节 -->\n\n${draft}`)