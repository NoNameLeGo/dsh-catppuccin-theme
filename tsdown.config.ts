import { clientBundle } from './tsdown.client.ts'

export default clientBundle(
  '@nonamelego/dsh-catppuccin',
  ['src/index.ts', 'src/tui-themes.ts'],
  {
    lib: {
      // 宿主侧会在运行时从 dsh 配置树解析 dsh-settings / schemastery / cordis，
      // 而非本地安装；保持外部（同 dsh-skins 的 stance）。注意 schemastery
      // 的包名是 @deepseek-ai/schemastery（0.5.0 起 host 半区真实值导入它来
      // 构造 settings schema，external 必须用全名否则会被打进 bundle）。
      external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-settings', '@deepseek-ai/schemastery'],
    },
  },
)
