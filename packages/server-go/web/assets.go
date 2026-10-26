// Package web 将生产前端嵌入 Go 可执行文件
package web

import (
	"embed"
	"io/fs"
)

// all:dist 将 dist 目录（包括以点号开头的文件）编译进二进制；构建前需先生成前端产物
//
//go:embed all:dist
var assets embed.FS

// Assets 返回以 index.html 为根入口的内嵌前端文件系统
func Assets() fs.FS {
	// http.FileServer 等调用方只需要 fs.FS；Sub 去掉路径中的 dist 前缀
	root, err := fs.Sub(assets, "dist")
	if err != nil {
		panic(err) // go:embed 会在编译时检查该目录
	}
	return root
}
