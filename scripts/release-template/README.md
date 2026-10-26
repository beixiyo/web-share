# Web Share 部署说明

本部署包包含内嵌前端页面的 Go 可执行文件，无需安装 Node.js、Go 或 Docker。请选择与操作系统和 CPU 架构对应的发布包，并完整解压后运行

## 启动

Linux/macOS：

```sh
./start.sh
```

Windows PowerShell：

```powershell
./start.ps1
```

默认监听所有网卡的 3001 端口。在本机打开 `http://localhost:3001`；其他设备打开 `http://服务器局域网IP:3001`，并确保系统防火墙允许访问该端口。按 Ctrl+C 停止服务

## 配置

将 `config.env.example` 复制为 `config.env`，修改后重新启动。启动脚本会读取配置文件，覆盖进程继承的同名环境变量；直接运行 `web-share` 或 `web-share.exe` 不会自动读取该文件

配置使用 `KEY=VALUE`，空行和以 `#` 开头的注释行会被忽略。有空格的值用引号括起来，不要添加行内注释。只加载自己信任的配置文件，Linux/macOS 启动脚本会将其作为 shell 文件读取

| 配置 | 含义 | 默认值 |
| --- | --- | --- |
| `HOST` | 监听地址，留空监听所有网卡 | 空 |
| `PORT` | HTTP/HTTPS 和 WebSocket 共用端口 | `3001` |
| `LAN_CIDRS` | 逗号分隔的 IPv4 网段，例如 `192.168.4.0/23,10.0.0.0/24` | 自动读取本机网卡网段 |
| `CLEAR_TIME` | 心跳超时及离线巡检间隔，毫秒，必须大于零 | `300000` |
| `DISCONNECT_DELAY` | 断连后保留恢复身份的时长，毫秒；非正数立即清理 | `300000` |
| `ROOM_EMPTY_GRACE_MS` | 空房邀请保留时长，毫秒；非正数立即清理 | `300000` |
| `ROOM_INVITE_TTL_MS` | 邀请有效期，毫秒；`-1` 表示不限制 | `-1` |
| `DEFAULT_ROOM_CODE` | 可公开加入固定房间的连接码 | `442385` |

同一匹配网段内的设备自动进入同一房间，重叠网段按最长前缀匹配。未匹配的 IPv4 与 IPv6 按完整地址隔离；跨网段仍可用邀请或连接码加入。容器或远程反向代理可能无法自动识别实际局域网，请显式设置 `LAN_CIDRS`。网卡或配置变化后需重启服务。不要将 `0.0.0.0/0` 当作普通局域网配置，它会合并所有非回环 IPv4 地址

## HTTPS

在 `config.env` 中同时设置 `SSL_KEY_PATH` 和 `SSL_CERT_PATH`。相对路径以部署包目录为基准；也可通过 `SSL_KEY` 和 `SSL_CERT` 环境变量传入 PEM 内容。证书配置不完整或无效时，服务会拒绝启动

证书不包含在部署包中，路径配置示例见 [certs/README.md](./certs/README.md)。使用 HTTPS 后请通过 `https://服务器地址:端口` 访问页面，证书必须匹配访问的域名或 IP。使用私有 CA 时，手机和电脑都需要信任该 CA
