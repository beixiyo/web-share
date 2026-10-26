// Package config 在进程边界解析部署配置
package config

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

// Config 保存从环境变量归一化得到的 HTTP/TLS 设置和信令策略
type Config struct {
	Address         string
	ClearTime       time.Duration
	DisconnectDelay time.Duration
	RoomEmptyGrace  time.Duration
	InviteTTL       time.Duration
	DefaultRoomCode string
	LANPrefixes     []netip.Prefix
	TLS             *tls.Config
}

// Load 读取现有 TS 服务器使用的环境变量，时长单位为毫秒
// 默认值：PORT=3001，超时=300000，ROOM_INVITE_TTL_MS=-1，DEFAULT_ROOM_CODE=442385
// 配置值无效或 TLS 配置不完整时会导致启动失败，不会因此关闭 HTTPS
func Load(getenv func(string) string) (Config, error) {
	var c Config
	port := strings.TrimSpace(getenv("PORT"))
	if port == "" {
		port = "3001"
	}

	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return c, fmt.Errorf("PORT must be an integer from 1 to 65535")
	}
	c.Address = net.JoinHostPort(strings.TrimSpace(getenv("HOST")), port)

	settings := []struct {
		name             string
		fallback         int64
		target           *time.Duration
		allowNonPositive bool
	}{
		{
			"CLEAR_TIME", 300000, &c.ClearTime, false,
		},
		{
			"DISCONNECT_DELAY", 300000, &c.DisconnectDelay, true,
		},
		{
			"ROOM_EMPTY_GRACE_MS", 300000, &c.RoomEmptyGrace, true,
		},
		{
			"ROOM_INVITE_TTL_MS", -1, &c.InviteTTL, true,
		},
	}

	for _, setting := range settings {
		value := strings.TrimSpace(getenv(setting.name))
		ms := setting.fallback
		if value != "" {
			ms, err = strconv.ParseInt(value, 10, 64)
			if err != nil {
				return c, fmt.Errorf("%s must be an integer in milliseconds", setting.name)
			}
		}
		if (!setting.allowNonPositive && ms <= 0) || ms > int64((1<<63-1)/time.Millisecond) || ms < int64((-1<<63)/time.Millisecond) {
			return c, fmt.Errorf("%s is outside the supported duration range", setting.name)
		}
		*setting.target = time.Duration(ms) * time.Millisecond
	}

	c.DefaultRoomCode = strings.TrimSpace(getenv("DEFAULT_ROOM_CODE"))
	if c.DefaultRoomCode == "" {
		c.DefaultRoomCode = "442385"
	}
	c.LANPrefixes, err = parseLANPrefixes(getenv("LAN_CIDRS"))
	if err != nil {
		return c, err
	}

	c.TLS, err = loadTLS(getenv)
	return c, err
}

func parseLANPrefixes(value string) ([]netip.Prefix, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}

	values := strings.Split(value, ",")
	prefixes := make([]netip.Prefix, 0, len(values))
	for _, item := range values {
		item = strings.TrimSpace(item)
		prefix, err := netip.ParsePrefix(item)
		if err != nil {
			return nil, fmt.Errorf("LAN_CIDRS contains invalid CIDR %q: %w", item, err)
		}
		if !prefix.Addr().Is4() {
			return nil, fmt.Errorf("LAN_CIDRS CIDR %q must be IPv4", item)
		}
		prefixes = append(prefixes, prefix.Masked())
	}
	return prefixes, nil
}

func loadTLS(getenv func(string) string) (*tls.Config, error) {
	keyPath, certPath := getenv("SSL_KEY_PATH"), getenv("SSL_CERT_PATH")
	key, cert := getenv("SSL_KEY"), getenv("SSL_CERT")
	var pair tls.Certificate
	var err error

	if keyPath != "" || certPath != "" {
		// 只要设置了文件路径，就要求路径成对出现
		if keyPath == "" || certPath == "" {
			return nil, fmt.Errorf("SSL_KEY_PATH and SSL_CERT_PATH must be configured together")
		}
		pair, err = tls.LoadX509KeyPair(certPath, keyPath)
	} else if key != "" || cert != "" {
		if key == "" || cert == "" {
			return nil, fmt.Errorf("SSL_KEY and SSL_CERT must be configured together")
		}
		pair, err = tls.X509KeyPair([]byte(cert), []byte(key))
	} else {
		return nil, nil
	}

	if err != nil {
		return nil, fmt.Errorf("load HTTPS certificate: %w", err)
	}

	return &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{pair}}, nil
}
