# HTTPS 证书

发布包不包含证书或私钥，也不会自动申请或续期证书。请使用已有证书，并妥善保管私钥

一种目录布局如下：

```text
certs/
├── server.crt
└── server.key
```

将 `config.env.example` 中的两项路径取消注释并保留为以下值。两种启动脚本都支持相同的 `KEY=VALUE` 配置格式：

```dotenv
SSL_KEY_PATH=./certs/server.key
SSL_CERT_PATH=./certs/server.crt
```
