import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindcss from 'tailwindcss'
import postcssPreset from 'postcss-preset-env'
import vueDevTools from 'vite-plugin-vue-devtools'
import { envParse } from 'vite-plugin-env-parse'
import genCompName from 'unplugin-generate-component-name/vite'
import AutoImport from 'unplugin-auto-import/vite'


export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    genCompName(),
    envParse(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: './src/auto-imports.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  css: {
    preprocessorMaxWorkers: true,
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/scss/index.scss" as *;`,
      },
    },
    postcss: {
      plugins: [
        tailwindcss(),

        postcssPreset({
          autoprefixer: {
            grid: true,
            flexbox: true,
          },
          features: {
            'nesting-rules': true
          },
          browsers: ['last 2 versions', '> 1%', 'IE 11'],
        }),
      ]
    }
  },
  server: {
    host: '::'
  }
})
