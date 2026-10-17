import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/**
 * Runtime alias for the official UI atom package.
 *
 * The real entry loads its whole atom set at module scope (katex / shiki langs /
 * mdast / anser / diff), none of which this repo depends on — the browser
 * resolves that module from the host's seed table instead. The stub keeps only
 * the DOM contract the rows are tested against; the TYPE surface still comes
 * from the real package, so `pnpm typecheck` keeps our usage honest.
 * See tests/stubs/primitives.tsx.
 */
const PRIMITIVES_STUB = fileURLToPath(new URL('./tests/stubs/primitives.tsx', import.meta.url))

export default defineConfig({
  plugins: [tsconfigPaths({
    projects: [
      './tsconfig.vitest.json',
    ],
  })],
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': PRIMITIVES_STUB,
    },
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    // 默认 10s 在本机满载时不够用：`tests/tui-themes.spec.ts` 的 `afterAll` 清临时目录
    // 偶发超时会把整轮 `pnpm test` 的退出码弄成非零（用例本身全绿，见 CHANGELOG 0.5.9「其他」）。
    hookTimeout: 60_000,
  },
})
