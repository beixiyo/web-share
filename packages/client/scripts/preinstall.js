console.log('当前包管理器', process.env.npm_execpath)

if (!/pnpm/.test(process.env.npm_execpath || '')) {
  // QA: process.exit 里面的数字是什么意思？
  // A: 0 表示成功，1 表示失败
  console.error('请使用 pnpm 进行安装')
  process.exit(1)
}
