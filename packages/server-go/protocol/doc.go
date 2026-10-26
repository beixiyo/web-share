// Package protocol 定义与 TypeScript 共用的 Web Share 通信协议，是协议类型的 Go 源文件
// 修改协议后运行 go generate（或 pnpm generate:protocol）同步生成 TypeScript 声明
package protocol

//go:generate go run ../cmd/protocolgen -out ../../common/src/generated/protocol.ts
