/** 检查 Vite 直接输出的前端产物，然后编译独立可执行文件 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const embeddedDist = new URL('packages/server-go/web/dist/', root)

if (!existsSync(new URL('index.html', embeddedDist))) {
  throw new Error('Missing frontend build. Run pnpm build:go from the repository root.')
}

const extension = (process.env.GOOS || process.platform) === 'windows' || (!process.env.GOOS && process.platform === 'win32')
  ? '.exe'
  : ''

const output = fileURLToPath(new URL(`dist/web-share${extension}`, root))
mkdirSync(new URL('dist/', root), { recursive: true })

const result = spawnSync('go', ['build', '-trimpath', '-ldflags=-s -w', '-o', output, './cmd/web-share'], {
  cwd: new URL('packages/server-go/', root),
  stdio: 'inherit',
  env: { ...process.env, CGO_ENABLED: '0' },
})

if (result.error) {
  throw result.error
}

if (result.status !== 0) {
  process.exit(result.status || 1)
}

console.log(`Standalone binary: ${output}`)
