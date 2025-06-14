import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import postcssPreset from 'postcss-preset-env'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'
import { envParse } from 'vite-plugin-env-parse'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    UnoCSS(),
    envParse(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: './src/auto-imports.d.ts',
    }),
    codeInspectorPlugin({
      bundler: 'vite',
      editor: 'code',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorMaxWorkers: true,
    postcss: {
      plugins: [
        postcssPreset({
          autoprefixer: {
            grid: true,
            flexbox: true,
          },
          features: {
            'nesting-rules': true,
          },
          browsers: ['last 2 versions', '> 1%', 'IE 11'],
        }),
      ],
    },
  },
  server: {
    host: '::',
  },
})
