// @ts-check

import { defineConfig } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import alias from '@rollup/plugin-alias'
import del from 'rollup-plugin-delete'
import { fileURLToPath } from 'node:url'
import parseJson from '@rollup/plugin-json'


const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  input: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
  output: [
    {
      file: fileURLToPath(new URL('./dist/index.js', import.meta.url)),
      format: 'esm',
      sourcemap: true,
    },
  ],
  ...(!isProduction && { external: id => id.includes('node_modules') }),
  plugins: [
    commonjs(),
    nodeResolve(),  // 开启`node_modules`查找模块功能
    parseJson(),
    typescript(),
    del({
      targets: ['dist/*'],
    }),

    alias({
      entries: [
        {
          find: '@',
          replacement: fileURLToPath(new URL('./src', import.meta.url)),
        },
      ]
    }),
  ],
})
