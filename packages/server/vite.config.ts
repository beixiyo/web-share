import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

import { builtinModules } from 'node:module' // 用于获取 Node.js 内置模块
import pkg from './package.json' assert { type: 'json' }

/**
 * 构建需要外部化的模块列表
 */
const nodeBuiltins = builtinModules.flatMap(m => [m, `node:${m}`]) // 如 'fs', 'node:fs'
const externalPackages = [
  ...nodeBuiltins,
  ...Object.keys(pkg.dependencies || {}),
  // @ts-ignore
  ...Object.keys(pkg.peerDependencies || {}),
].filter((item) => item !== 'web-share-common')

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },

  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`, // 输出 index.mjs (推荐) 或 index.js
      formats: ['es']
    },
    rollupOptions: {
      // 关键：将所有 Node.js 内置模块和 package.json 中的依赖声明为外部的
      external: externalPackages,
    },
    minify: false,
  },
})