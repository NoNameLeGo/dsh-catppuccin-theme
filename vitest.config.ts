import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths({
    projects: [
      './tsconfig.vitest.json',
    ],
  })],
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    // 默认 10s 在本机满载时不够用：`tests/tui-themes.spec.ts` 的 `afterAll` 清临时目录
    // 偶发超时会把整轮 `pnpm test` 的退出码弄成非零（用例本身全绿，见 CHANGELOG 0.5.9「其他」）。
    hookTimeout: 60_000,
  },
})
