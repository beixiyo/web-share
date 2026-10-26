// Command web-share 启动内嵌前端和兼容的 WebSocket 信令服务器
package main

import (
	"context"
	"crypto/tls"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/beixiyo/web-share/packages/server-go/internal/config"
	"github.com/beixiyo/web-share/packages/server-go/internal/httpserver"
	"github.com/beixiyo/web-share/packages/server-go/internal/signaling"
	"github.com/beixiyo/web-share/packages/server-go/web"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	lanPrefixes := cfg.LANPrefixes
	if lanPrefixes == nil {
		lanPrefixes, err = signaling.DiscoverLANPrefixes()
		if err != nil {
			return err
		}
	}

	peers := signaling.New(signaling.Options{
		ClearTime:       cfg.ClearTime,
		DisconnectDelay: cfg.DisconnectDelay,
		RoomEmptyGrace:  cfg.RoomEmptyGrace,
		InviteTTL:       cfg.InviteTTL,
		DefaultRoomCode: cfg.DefaultRoomCode,
		LANPrefixes:     lanPrefixes,
	})
	defer peers.Close()

	server := &http.Server{
		Addr:              cfg.Address,
		Handler:           httpserver.NewHandler(web.Assets(), peers),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	// 先显式绑定端口，方便在交给 HTTP Server 前包装 TLS listener
	// listener 负责接收 TCP 连接，server.Serve 负责解析请求并调用 Handler
	listener, err := net.Listen("tcp", cfg.Address)
	if err != nil {
		return err
	}
	defer listener.Close()

	scheme := "http"
	if cfg.TLS != nil {
		listener = tls.NewListener(listener, cfg.TLS)
		scheme = "https"
	}
	// NotifyContext 把操作系统退出信号转换成 ctx.Done() 上的取消通知
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)

	defer stop()
	done := make(chan error, 1)
	// Serve 会阻塞到服务器停止，因此放入 goroutine，让 run 同时等待退出信号
	go func() { done <- server.Serve(listener) }()
	log.Printf("Web Share listening on %s://%s", scheme, listener.Addr())

	select {
	case err := <-done:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		peers.Close()
		// 给活动请求最多 5 秒完成优雅关闭，超时后 Shutdown 返回错误
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	}

	return nil
}
