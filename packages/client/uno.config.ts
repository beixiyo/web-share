import presetWind from '@unocss/preset-wind'
import presetLegacyCompat from '@unocss/preset-legacy-compat'
import {
  presetAttributify,
  transformerVariantGroup,
  transformerAttributifyJsx
} from 'unocss'

import { defineConfig } from 'unocss'
import { borderColor, innerBg, lightBg, lightTextColor, primaryColor } from './src/styles/variable'


const shake = `
{
  10%,
  90% {
    transform: translate3d(-3px, 0, 0);
  }

  20%,
  80% {
    transform: translate3d(4px, 0, 0);
  }

  30%,
  50%,
  70% {
    transform: translate3d(-6px, 0, 0);
  }

  40%,
  60% {
    transform: translate3d(6px, 0, 0);
  }
}
`

const float = `
{
  0%,
  100% {
    transform: translate(-12px, 10px);
  }

  50% {
    transform: translate(10px, -15px);
  }
}
`

export default defineConfig({
  presets: [
    // 使用 presetWind 插件以兼容 Tailwind CSS
    presetWind(),
    /**
     * 属性化书写样式，要配合 transformerAttributifyJsx 使用
     * <div class="m-2 rounded text-teal-400" />
     * <!-- 现在你可以这么写： -->
     * <div m-2 rounded text-teal-400 />
     */
    presetAttributify(),

    /**
     * 兼容旧版 CSS
     */
    presetLegacyCompat({
      commaStyleColorFunction: true,
      legacyColorSpace: true,
    }),
  ],

  transformers: [
    /**
     * 无值化 JSX
     * 如果没有这个转换器，JSX会将无值属性视为布尔属性
     */
    transformerAttributifyJsx(),
    /**
     * <div class="hover:bg-gray-400 hover:font-medium font-light font-mono"/>
     * <!-- 简化之后： -->
     * <div class="hover:(bg-gray-400 font-medium) font-(light mono)"/>
     */
    transformerVariantGroup(),
  ],

  // 配置主题
  theme: {
    colors: {
      lightBg, /** 背景色 */
      innerBg, /** 内部背景色 */
      primary: primaryColor, /** 主色 */
      border: borderColor, /** 边框色 */
      light: lightTextColor, /** 文字浅色 */
    },

    animation: {
      keyframes: {
        shake,
        float,
      },
      durations: {
        shake: '.4s',
        float: '5s'
      },
      timingFns: {
        shake: 'cubic-bezier(0.28, -0.44, 0.65, 1.55)',
        float: 'ease-in-out',
      },
      properties: {
        shake: { 'animation-fill-mode': 'both' },
      },
      counts: {
        shake: '2',
        float: 'infinite',
      },
    }
  },

  // 定义你的自定义工具类
  shortcuts: {
    'hide-scroll': {
      // @ts-ignore
      'scrollbar-width': 'none',
      // IE and Edge
      '-ms-overflow-style': 'none',
      // Safari and Chrome (注意这里的 &::-webkit-scrollbar 语法)
      '&::-webkit-scrollbar': {
        'display': 'none',
      },
    },
  },

  rules: [],

  // 配置内容扫描路径
  content: {
    filesystem: [
      './index.html',
      './src/**/*.{vue}',
    ],
  },
})
