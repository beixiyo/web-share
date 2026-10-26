// Package httpserver 提供 SPA，并将 WebSocket 升级请求转交给 signaling
package httpserver

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// NewHandler 从与 WebSocket 相同的源提供前端资源和 SPA 导航
// 缺失的资源 URL 返回 404；只有 HTML 导航会回退到 index.html
func NewHandler(assets fs.FS, signaling http.Handler) http.Handler {
	// FileServer 负责静态文件响应（包括 MIME 类型和 HEAD 行为）；这里仅做路由分流
	files := http.FileServer(http.FS(assets))

	// HandlerFunc 让普通函数适配 http.Handler 接口。HTTP server 可并发调用该 handler，
	// 因此每次请求的数据都放在闭包调用内；共享状态由 signaling 自己负责并发安全
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			// 升级请求交给信令 handler，由它完成 WebSocket 握手和后续连接处理
			signaling.ServeHTTP(w, r)
			return
		}

		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		// 规范化 URL 路径并去掉开头的斜杠，以便作为 fs.FS 内的相对路径查询
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}

		info, err := fs.Stat(assets, name)
		if err == nil && !info.IsDir() {
			if name == "index.html" || strings.HasSuffix(name, ".js") {
				// Worker 脚本必须能在不同版本间更新
				w.Header().Set("Cache-Control", "no-cache")
			}
			files.ServeHTTP(w, r)
			return
		}

		// SPA 的前端路由通常没有文件扩展名；只有浏览器请求 HTML 导航时才回退，
		// 避免把缺失的脚本、图片等资源错误地返回成 index.html
		if strings.Contains(r.Header.Get("Accept"), "text/html") && path.Ext(name) == "" {
			index, readErr := fs.ReadFile(assets, "index.html")
			if readErr == nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Header().Set("Cache-Control", "no-cache")
				if r.Method == http.MethodHead {
					// HEAD 与 GET 使用相同响应头，但按 HTTP 语义不写响应体
					return
				}
				_, _ = w.Write(index)
				return
			}
		}

		if _, err := fs.Stat(assets, "index.html"); err != nil && name == "index.html" {
			http.Error(w, "Frontend is not embedded. Run pnpm build:go, or use the Vite development server.", http.StatusServiceUnavailable)
			return
		}
		http.NotFound(w, r)
	})
}
