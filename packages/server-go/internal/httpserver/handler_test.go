// 本文件测试 SPA 深层链接、缺失的 worker 资源，以及 HTTP/WS 共用路由
package httpserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func Test前端与WebSocket路由(t *testing.T) {
	assets := fstest.MapFS{
		"index.html":    &fstest.MapFile{Data: []byte("<html>embedded app</html>")},
		"assets/app.js": &fstest.MapFile{Data: []byte("export const app = true")},
	}

	handler := NewHandler(assets, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusSwitchingProtocols)
	}))
	for _, tc := range []struct {
		name                          string
		method, path, accept, upgrade string
		status                        int
		body                          string
	}{
		{
			"根路径返回前端页面",
			"GET",
			"/",
			"text/html",
			"",
			200,
			"embedded app",
		},
		{
			"前端深层路径回退到页面入口",
			"GET",
			"/fileTransfer/",
			"text/html",
			"",
			200,
			"embedded app",
		},
		{
			"存在的脚本资源正常提供",
			"GET",
			"/assets/app.js",
			"*/*",
			"",
			200,
			"export const app",
		},
		{
			"缺失的脚本资源返回404",
			"GET",
			"/assets/missing.js",
			"text/html",
			"",
			404,
			"404",
		},
		{
			"缺失的非HTML导航返回404",
			"GET",
			"/missing",
			"application/json",
			"",
			404,
			"404",
		},
		{
			"HEAD请求不返回响应体",
			"HEAD",
			"/fileTransfer/",
			"text/html",
			"",
			200,
			"",
		},
		{
			"不支持的方法返回405",
			"POST",
			"/",
			"text/html",
			"",
			405,
			"",
		},
		{
			"WebSocket升级请求转交信令处理器",
			"GET",
			"/?__web-share__peerId=example",
			"",
			"websocket",
			101,
			"",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			req.Header.Set("Accept", tc.accept)
			req.Header.Set("Upgrade", tc.upgrade)
			result := httptest.NewRecorder()

			handler.ServeHTTP(result, req)

			if result.Code != tc.status || !strings.Contains(result.Body.String(), tc.body) {
				t.Fatalf("状态码=%d 响应体=%q，期望状态码=%d 且包含 %q", result.Code, result.Body.String(), tc.status, tc.body)
			}
			if tc.method == "HEAD" && result.Body.Len() != 0 {
				t.Fatalf("HEAD 请求返回了响应体")
			}
		})
	}
}
