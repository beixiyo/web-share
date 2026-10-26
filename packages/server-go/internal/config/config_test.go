// 本文件验证部署边界的零值时长语义
package config

import (
	"net/netip"
	"testing"
	"time"
)

func Test时长零值保留(t *testing.T) {
	values := map[string]string{"DISCONNECT_DELAY": "0", "ROOM_EMPTY_GRACE_MS": "0", "ROOM_INVITE_TTL_MS": "0"}
	cfg, err := Load(func(key string) string { return values[key] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DisconnectDelay != 0 || cfg.RoomEmptyGrace != 0 || cfg.InviteTTL != 0 || cfg.ClearTime != 5*time.Minute {
		t.Fatalf("配置语义错误：%#v", cfg)
	}
}

func TestLAN_CIDRs覆盖与空白自动发现语义(t *testing.T) {
	values := map[string]string{"LAN_CIDRS": " 192.168.4.129/23,10.1.2.3/16 "}
	cfg, err := Load(func(key string) string { return values[key] })
	if err != nil {
		t.Fatal(err)
	}
	want := []netip.Prefix{netip.MustParsePrefix("192.168.4.0/23"), netip.MustParsePrefix("10.1.0.0/16")}
	if len(cfg.LANPrefixes) != len(want) {
		t.Fatalf("CIDR 数量错误：%v", cfg.LANPrefixes)
	}
	for index, prefix := range want {
		if cfg.LANPrefixes[index] != prefix {
			t.Fatalf("CIDR[%d]=%s，期望%s", index, cfg.LANPrefixes[index], prefix)
		}
	}

	cfg, err = Load(func(key string) string {
		if key == "LAN_CIDRS" {
			return "  "
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.LANPrefixes != nil {
		t.Fatalf("空白 LAN_CIDRS 应保留自动发现语义，得到 %v", cfg.LANPrefixes)
	}
}

func TestLAN_CIDRs拒绝非法和IPv6前缀(t *testing.T) {
	for _, value := range []string{"192.168.4.0/33", "2001:db8::/32", "192.168.0.0/16,,10.0.0.0/8"} {
		t.Run(value, func(t *testing.T) {
			values := map[string]string{"LAN_CIDRS": value}
			if _, err := Load(func(key string) string { return values[key] }); err == nil {
				t.Fatalf("LAN_CIDRS=%q 应启动失败", value)
			}
		})
	}
}
