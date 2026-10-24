/** 在主机上运行协议生成器，避免 GOOS/GOARCH 交叉编译时受目标平台影响 */
import { spawnSync } from 'node:child_process'

const env = { ...process.env }
delete env.GOOS
delete env.GOARCH
delete env.GOARM
delete env.GOAMD64

const result = spawnSync('go', ['run', './cmd/protocolgen', ...process.argv.slice(2)], {
  cwd: new URL('../packages/server-go/', import.meta.url),
  stdio: 'inherit',
  env,
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
