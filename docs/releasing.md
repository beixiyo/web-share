# Go 部署包与 GitHub Release

## 本地构建

本地发布构建支持 Linux/macOS；GitHub Actions 使用 Ubuntu。安装项目依赖、Node.js 22、pnpm 9.7.1 和 Go 1.26 的最新补丁版本后，在仓库根目录执行：

```sh
pnpm release:build --version v1.0.0
```

也可以只构建一个目标：

```sh
pnpm release:build --version v1.0.0 --targets linux-amd64
```

默认目标为 Linux、macOS（darwin）和 Windows 的 amd64、arm64，共六个组合。输出写入 `release/v1.0.0/`：

- `web-share-v1.0.0-{os}-{arch}.tar.gz` 或 `.zip`：对应平台的 Go 部署包
- `SHA256SUMS`：以上发布文件的 SHA-256 校验和

Go 部署包内含对应平台的 `web-share`/`web-share.exe`、启动脚本、`config.env.example`、部署说明和 `certs/README.md`。前端静态资源已嵌入 Go 二进制，发布附件不再单独提供前端 dist，也不包含 TypeScript 后端

构建先运行 `check:protocol`，再构建 common 与 client，执行 Go 测试和 vet，最后将前端资源嵌入 Go 二进制。协议检查不会生成或改写源码；协议生成文件过期时检查会失败，应先按项目流程更新并提交生成文件。依赖版本由仓库 lock 文件固定；发布前端使用同源 WebSocket 地址，不应设置构建时 `VITE_SERVER_URL`。归档使用 Go 标准库，不要求额外安装 zip 或 tar 工具。更改前端后需重新构建部署包

[构建脚本](../scripts/release.mjs)只产出本地文件，不会创建或切换 Git 分支、创建 tag、推送或创建 GitHub Release。同版本重新构建成功后会替换该版本目录中的旧产物，构建失败时保留原有产物

## GitHub Actions

[发布工作流](../.github/workflows/release.yml)在推送 `v*` tag 后自动构建六个平台的产物，成功后创建 GitHub Release、自动生成发布说明并上传附件。例如，在要发布的提交上执行（版本号按实际修改）：

```sh
git tag v1.0.0
git push origin v1.0.0
```

工作流需已包含在该 tag 对应的提交中。包含 `-` 的版本（如 `v1.0.0-beta.1`）自动标记为预发布版本。重新运行工作流时，若 Release 已存在，则上传并覆盖同名附件

手动运行 `workflow_dispatch` 只构建并上传 Actions artifact 供验收，不会创建或发布 Release。工作流内置的 `GITHUB_TOKEN` 用于创建 Release 和上传附件，不需要另配个人 token

## 部署

Go 二进制已内嵌前端，只需下载对应平台的 Go 部署包。发布构建强制使用同源连接，不会带入构建机的 `VITE_SERVER_URL`

解压某个平台的 Go 包后，Linux/macOS 运行 `./start.sh`，Windows PowerShell 运行 `./start.ps1`。默认通过 HTTP 的 3001 端口提供页面和 WebSocket 服务。需要配置时，将 `config.env.example` 复制为 `config.env` 并编辑；直接运行二进制不会读取 `config.env`。环境变量、默认值、HTTPS 证书路径和手机信任要求见部署包内的 README

仓库中的模板可直接查看：[配置示例](../scripts/release-template/config.env.example)、[部署说明](../scripts/release-template/README.md)、[HTTPS 证书说明](../scripts/release-template/certs/README.md)
