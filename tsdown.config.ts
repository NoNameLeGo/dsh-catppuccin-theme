import { clientBundle } from './tsdown.client.ts'

export default clientBundle(
  '@nonamelego/dsh-catppuccin',
  ['src/index.ts', 'src/tui-themes.ts'],
  {
    lib: {
      // 宿主侧会在运行时从 dsh 配置树解析 dsh-settings / schemastery / cordis，
      // 而非本地安装；保持外部（同 dsh-skins 的 stance）。
      external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-settings', 'schemastery'],
    },
  },
)
