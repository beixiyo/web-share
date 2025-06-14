import antfu from '@antfu/eslint-config'
import {
  docComment,
  forceTernary,
  reactVIf,
} from '@jl-org/eslint-plugins'

export default antfu({
  /**
   * Style
   */
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: false,

    overrides: {
      'no-console': 'warn', // 使用 console 时发出警告
      'no-empty': 'warn', // 空代码块时发出警告
      'unused-imports/no-unused-vars': 'warn', // 未使用的变量或导入时发出警告

      'no-async-promise-executor': 'off', // 允许在 Promise 构造函数中使用 async 函数
      'node/prefer-global/process': 'off', // 不强制使用全局的 process 对象
      'eqeqeq': 'off', // 不强制使用 === 和 !==
      'no-sequences': 'off', // 允许使用逗号操作符
      'no-extend-native': 'off', // 允许扩展原生对象的原型

      'ts/ban-ts-comment': 'off', // 允许使用 @ts-ignore 等 TypeScript 注释
      'unicorn/no-new-array': 'off', // 允许使用 new Array()
      'ts/no-unsafe-function-type': 'off', // 允许不安全的函数类型
      'eslint-comments/no-unlimited-disable': 'off', // 允许无限禁用 ESLint 规则
      'prefer-promise-reject-errors': 'off', // 允许 Promise.reject() 不传参数

      'no-useless-return': 'off', // 允许无用的 return 语句
      'style/no-mixed-operators': 'off', // 允许混合使用不同的操作符
      'operator-linebreak': ['off', 'after', { /** 操作符换行时放在行尾 */
        overrides: {
          '||': 'after', // 逻辑或操作符放在行尾
          '&&': 'after', // 逻辑与操作符放在行尾
          '?': 'before', // 三元操作符的问号放在行首
          ':': 'before', // 三元操作符的冒号放在行首
        },
      }],
      'ts/no-use-before-define': 'off', // 允许在定义前使用变量
      'ts/consistent-type-definitions': 'off', // 允许使用 interface 和 type 定义类型
      'no-new': 'off',

      'style/max-statements-per-line': 'off', // 允许每行语句数量不超过 1
      'no-case-declarations': 'off', // 允许 switch case 语句中出现变量声明
      'accessor-pairs': 'off', // 允许在 getter 和 setter 中使用 accessor pairs
      'no-alert': 'off', // 允许使用 alert()

      /**
       * 这个配置没用，还是删除换行，几十年了也不修复
       * 给个错误的配置关掉它
       */
      /**
       * 'no-multiple-empty-lines': ['error', { max: 3, maxBOF: 0, maxEOF: 0 }],
       * 'no-multiple-empty-lines': {},
       */
    },
  },

  /**
   * Language config
   */
  jsonc: false,
  regexp: false,
  unocss: true,
  typescript: true,

  // Vue 相关的配置
  vue: {
    overrides: {
      'vue/block-order': [ // Vue 文件中块的顺序
        'error',
        {
          order: ['template', 'script', 'style'], // 顺序为 template -> script -> style
        },
      ],

      'vue/no-reserved-component-names': 'off', // 允许使用保留字作为组件名
    },
  },

  ignores: [
    'dist',
    'packages/**/public/*',
    'node_modules',
    '**/*.json',
    '**/*.jsonc',
    '**/*.json5',
    '**/*.d.ts',
  ],

  /**
   * 自定义插件
   */
  plugins: {
    forceTernary, // 自定义插件：三目运算分为三行
    docComment, // 自定义插件：将注释转换为文档注释
    reactVIf, // 自定义插件：v-if 转 JSX
  },

  /**
   * 自定义规则
   */
  rules: {
    'forceTernary/forceTernary': 'warn', // 三目运算分为三行
    /** 将 中文 或者 NOTE: 开头的注释转换为文档注释 */
    'docComment/docComment': ['warn', { pattern: '^(?:[\\u4E00-\\u9FA5\\u3000-\\u303F\\uFF00-\\uFFEF]|NOTE:)' }],
    'reactVIf/reactVIf': 'error', // v-if 转 JSX
  },
})
