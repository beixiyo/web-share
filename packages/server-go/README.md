# Go 后端

Go 后端与 TypeScript 后端并存，使用相同的 WebSocket JSON 协议。项目功能、使用方法、Docker 部署与 TS 本地开发见[项目主文档](../../README.md)。本文件维护 Go 构建、协议生成、运行差异与验证步骤

## 构建和运行

下载现成部署包、多平台发布构建与 GitHub Actions 配置见[发布与部署说明](../../docs/releasing.md)

构建机需要 Node.js 22、pnpm 和 Go 1.26 或更新版本，先在仓库根目录执行 `pnpm install`

```bash
# 在仓库根目录：生成协议 → 构建 common → 构建前端 → 编译 Go
pnpm build:go

# 将 dist/web-share 复制到目标服务器即可运行，不需要 Node、Go 或 Docker
PORT=3001 ./dist/web-share
```

Vite 将前端直接构建到 `packages/server-go/web/dist/`，Go 编译时将这些静态资源嵌入二进制，不再复制前端产物。TS 后端的 Docker 构建也从该目录取得页面资源

生产环境默认连接页面同源的 WebSocket，换域名或端口无需重新构建。仍可通过构建时的 `VITE_SERVER_URL` 覆盖信令地址。更改前端后需要重新构建二进制

交叉编译示例：

```bash
GOOS=linux GOARCH=arm64 pnpm build:go
GOOS=windows GOARCH=amd64 pnpm build:go
```

构建脚本设置 `CGO_ENABLED=0`；输出分别为 `dist/web-share` 或 `dist/web-share.exe`，应在对应操作系统与架构上运行

开发模式：

```bash
pnpm dev:go
```

首次启动会生成共享协议并构建 common，然后同时运行前端、Go 服务和文件监听：

- 浏览器打开 Vite 输出的地址，默认 `http://localhost:5173`；局域网或 WireGuard 设备使用本机对应 IP，开发页面自动连接同一主机的 WebSocket 3001 端口
- 修改前端或 common 源码，Vite 热更新；修改 Go 源码、`go.mod` 或 `go.sum`，nodemon 自动重新编译并重启 Go 服务
- 修改 `protocol/` 中的 Go 定义，会自动重新生成 TS 协议，再由 common 和前端监听接续更新
- 在启动终端按 `Ctrl+C` 停止整组开发进程；只开发后端时可运行 `pnpm dev:server:go`

Go 自动重启会清空内存中的房间、邀请和恢复会话，测试双方需要重新连接。启动失败时先处理终端报错，不要同时再启动另一组相同端口的服务。仅运行 `go run ./cmd/web-share` 不带源码监听；首次完整构建前没有内嵌页面，此时使用 Vite 页面

## 协议与 common 包

- `protocol/` 包是共享协议的定义源，Go 文件按职责拆分，统一生成一个 TS 文件
- `cmd/protocolgen` 调用第三方工具 tygo 从 Go 声明生成 `../common/src/generated/protocol.ts`，包含运行时 `Action` enum、常量和 TS 类型
- common 的 `index.ts` 直接导出生成协议、手写常量和浏览器传输类型，前端和旧 TS 后端仍从 `web-share-common` 导入
- `RTCData.ts`、浏览器存储 key、`SERVER_URL`、`HEART_BEAT`、`ErrorCode` 继续由原有 TS 文件维护
- 生成结果提交到版本库，运行旧 TS 后端不需要安装 Go；生成文件不得手改

```bash
pnpm generate:protocol
pnpm check:protocol
```

类型、常量、枚举和注释转换由 tygo 负责，不再维护自写 AST 转换器。`common/src/index.ts` 仅适配 `SendData` 默认泛型参数，常量沿用 Go 生成的名称；邀请状态与失效原因直接使用 tygo 生成的枚举。协议时间戳使用 Unix 毫秒；JS 数值需处于安全整数范围，新增 `int64` 字段时不能默认认为整个取值范围均可无损传给 JS

## 环境变量

公共变量、默认值与时长单位统一见[主文档：服务端环境变量](../../README.md#服务端环境变量)。本包只补充 Go 特有的配置和边界行为：

- `HOST` 默认为空，监听所有网卡；设为 `127.0.0.1` 可限制为本机访问
- `LAN_CIDRS` 可用逗号分隔的 IPv4 CIDR 显式指定局域网网段；未设置或为空时启动时枚举本机网络接口前缀，按最长前缀匹配分房。非法 CIDR 或 IPv6 前缀会导致启动失败
- `CLEAR_TIME` 必须大于 0；`ROOM_EMPTY_GRACE_MS` 非正数表示立即清理，`ROOM_INVITE_TTL_MS` 非正数表示不过期
- 环境变量格式无效时启动失败。TLS 的文件路径配置优先于直接传入的 PEM 内容
- 地址识别无需额外配置，依次读取 `CF-Connecting-IP`、`X-Forwarded-For` 和直连地址；转发头取逗号第一项，非法候选顺次回退，IPv4 映射地址和 IPv6 地址统一规范化
- IPv6 除回环地址外使用规范化后的完整地址分房，跨地址连接使用邀请或房间码
- 局域网房间 ID 由匹配到的网络地址和掩码长度组成，例如 `192.168.4.0/23` 为 `lan_192_168_4_0_23`；未匹配的 IPv4 按完整地址隔离

HTTPS 启动示例：

```bash
PORT=8443 \
SSL_KEY_PATH=/path/to/key.pem \
SSL_CERT_PATH=/path/to/fullchain.pem \
./dist/web-share
```

TLS 配置不完整或证书无法读取时启动失败，不会悄悄降级为 HTTP。证书作为外部配置管理，不打进二进制。移动端使用 Service Worker、剪贴板等能力仍需可信 HTTPS，Go 后端不会绕过浏览器的安全上下文限制

服务端生成 peer ID 和私有恢复令牌，令牌仅通过 `NotifyUserInfo.resumeToken` 返回给当前连接。握手携带 `__web-share__resumeToken` 才能恢复原身份和房间；客户端传入的 peer ID、IP 和浏览器信息均不能认领已有会话。无效令牌创建新身份，成员列表和广播永远不包含令牌

相同令牌重连会以状态码 `4001` 关闭被替换的旧 WebSocket；客户端应停止旧连接的自动重连。旧连接立即失去发送权限，其关闭回调不会删除新会话。普通断连立即从在线名单移除并广播离开；`DISCONNECT_DELAY` 只保留恢复身份、房间和令牌，宽限内重连可以恢复，宽限结束后令牌失效。空房邀请宽限从实际离线开始计算。显式离房或开放连接心跳超时则立即关闭连接并清理会话

`JoinRoom` 只确认握手确定的当前房间，传其他 roomId 会返回 `Error` 和当前身份。跨房加入必须使用真实邀请或房间码；旧的 roomId/peerId 二维码入口返回邀请失效。固定默认房间码仍可公开加入 `default`，该房间生成的分享邀请使用独立凭据，刷新会撤销旧邀请

响应按状态提交顺序进入每连接独立发送队列。每连接最多排队 64 条消息、16 MiB 数据；目标连接过慢导致队列溢出时关闭该连接，正常断连宽限期仍适用

Go 使用 uap-go 识别设备；与 TS 的 ua-parser-js 版本不同，设备名称可能有差别。展示名按 peerId 稳定生成，其词表与 TS 后端不完全相同；消息字段和协议值保持一致。后端状态在内存中，切换后端或重启会丢失现有房间和邀请，不支持两个后端进程共享会话

## 代码执行关系

信令业务使用一把共享的 `Server.shared.mu` 保护房间、会话、邀请、连接索引和清理任务。不同连接的 handler 可以并发运行；业务操作在持锁期间检查并修改共享状态，带 `Locked` 后缀的方法要求调用方已经持有这把锁。服务状态统一归入 `s.shared`；peer 中由同一把锁保护的房间、恢复令牌和排队字节数归入 `p.shared`，peer 不新增锁

- `internal/signaling/server.go`：HTTP 接入、reader、连接登记和同步关闭入口
- `internal/signaling/messages.go`：消息解析与业务处理、响应入队、每连接独立的 writer；网络写入在服务锁外执行
- `internal/signaling/rooms.go`、`invites.go`：由调用方持锁后组合执行的房间与邀请规则
- `internal/signaling/lifecycle.go`：断连、空房定时任务和定期维护；后台任务访问共享业务状态时同样使用服务锁
- `internal/signaling/state.go`：`serverSharedState` 与 `peerSharedState` 明确列出受服务锁保护的字段
- `internal/signaling/peer.go`：每连接的身份、设备信息、WebSocket `ws` 与发送队列；心跳和传输标记使用原子读写

接入后在 handler 中运行 reader，另启动 writer 消费该连接的发送队列。状态修改与响应入队在同一临界区按序完成；断连先更新在线状态，再停止并等待 writer。关闭时先持锁禁止接入、通知后台和连接停止，解锁后关闭 socket，再等待后台任务及连接收尾。等待不能持有服务锁，否则可能阻塞仍需拿锁的收尾流程。`New`、`ServeHTTP`、`Close` 和 WebSocket 协议保持原有调用方式

## 验证

```bash
pnpm check:protocol
pnpm test:go
pnpm build:go
```

跨后端兼容测试需要启动两个隔离端口的服务。仓库根目录分别在两个终端运行：

```bash
pnpm build:common && pnpm build:server
PORT=18787 DISCONNECT_DELAY=250 ROOM_EMPTY_GRACE_MS=0 CLEAR_TIME=60000 \
  node packages/server/dist/server.mjs
```

```bash
PORT=18788 DISCONNECT_DELAY=250 ROOM_EMPTY_GRACE_MS=0 CLEAR_TIME=60000 \
  ./dist/web-share
```

然后运行（需要 Bun）：

```bash
TS_WS_URL=ws://127.0.0.1:18787 GO_WS_URL=ws://127.0.0.1:18788 pnpm test:backends
```

该 Bun 测试使用生成的 TS `Action` 连接真实后端，验证房间广播、心跳、转发隔离与发送者身份、邀请刷新、房间码和快速重连。可以通过 `TS_WS_URL` / `GO_WS_URL` 指定其他测试地址。请使用隔离测试实例，脚本会创建连接、房间和邀请
