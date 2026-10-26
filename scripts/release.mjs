/** 构建内嵌前端的跨平台 Go 部署包，供本地验收或 GitHub Release 上传 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const goDirectory = join(root, 'packages/server-go')
const templateDirectory = join(root, 'scripts/release-template')
const supportedTargets = ['linux-amd64', 'linux-arm64', 'darwin-amd64', 'darwin-arm64', 'windows-amd64', 'windows-arm64']
const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    targets: { type: 'string', default: supportedTargets.join(',') },
  },
})

const version = values.version || `v${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}`
if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('版本必须为 v1.0.0 或 v1.0.0-beta.1 这样的格式')
}

const targets = [...new Set(values.targets.split(',').map(target => target.trim()))]
if (targets.some(target => !supportedTargets.includes(target))) {
  throw new Error(`目标仅支持：${supportedTargets.join(', ')}`)
}

/** 生成器与归档工具在主机执行；前端必须使用同源地址，不带入本机部署配置 */
const hostEnv = { ...process.env, VITE_SERVER_URL: '' }
for (const name of ['GOOS', 'GOARCH', 'GOARM', 'GOAMD64']) {
  delete hostEnv[name]
}

/** 执行构建工具，并在任何一步失败时停止发布打包 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env: hostEnv, stdio: 'inherit', ...options })
  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 执行失败：${result.status ?? result.signal}`)
  }
}

/** 使用 Go 标准库归档，避免发布机额外安装 zip 或 tar 工具 */
function archive(source, output) {
  run('go', ['run', join(root, 'scripts/releasepack/main.go'), '--source', source, '--out', output])
}

run('pnpm', ['check:protocol'])
run('pnpm', ['build:common'])
run('pnpm', ['build:client'])
run('go', ['mod', 'verify'], { cwd: goDirectory })
run('go', ['test', './...'], { cwd: goDirectory })
run('go', ['vet', './...'], { cwd: goDirectory })

const temporary = mkdtempSync(join(tmpdir(), 'web-share-release-'))
const artifacts = join(temporary, 'artifacts')
mkdirSync(artifacts)

try {
  for (const target of targets) {
    console.log(`编译部署包：${target}`)
    const [os, arch] = target.split('-')
    const staging = join(temporary, target)
    const windows = os === 'windows'
    mkdirSync(staging)

    for (const name of ['README.md', 'config.env.example', 'certs']) {
      cpSync(join(templateDirectory, name), join(staging, name), { recursive: true })
    }
    copyFileSync(join(root, 'LICENSE'), join(staging, 'LICENSE'))

    const launcher = windows
      ? 'start.ps1'
      : 'start.sh'
    if (windows) {
      /** UTF-8 BOM 兼容 Windows PowerShell 5.1 的脚本编码识别 */
      writeFileSync(join(staging, launcher), `\uFEFF${readFileSync(join(templateDirectory, launcher), 'utf8')}`)
    }
    else {
      copyFileSync(join(templateDirectory, launcher), join(staging, launcher))
      chmodSync(join(staging, launcher), 0o755)
    }

    const binary = join(staging, windows
      ? 'web-share.exe'
      : 'web-share')
    run('go', ['build', '-mod=readonly', '-trimpath', '-buildvcs=false', '-ldflags=-s -w', '-o', binary, './cmd/web-share'], {
      cwd: goDirectory,
      env: { ...hostEnv, CGO_ENABLED: '0', GOOS: os, GOARCH: arch },
    })
    if (!windows) {
      chmodSync(binary, 0o755)
    }

    archive(staging, join(artifacts, `web-share-${version}-${target}.${windows
      ? 'zip'
      : 'tar.gz'}`))
  }

  const checksums = readdirSync(artifacts).sort().map((name) => {
    const hash = createHash('sha256').update(readFileSync(join(artifacts, name))).digest('hex')
    return `${hash}  ${name}`
  })
  writeFileSync(join(artifacts, 'SHA256SUMS'), `${checksums.join('\n')}\n`)

  /** 全部构建成功后才替换同版本的产物，不留下可被误上传的半成品 */
  const output = join(root, 'release', version)
  mkdirSync(output, { recursive: true })
  for (const name of readdirSync(output)) {
    rmSync(join(output, name), { recursive: true, force: true })
  }
  for (const name of readdirSync(artifacts)) {
    copyFileSync(join(artifacts, name), join(output, name))
  }
  console.log(`发布产物：${output}`)
}
finally {
  rmSync(temporary, { recursive: true, force: true })
}
