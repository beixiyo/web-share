// 本文件发现本机 IPv4 前缀，并按最长前缀匹配计算 LAN 房间标识
package signaling

import (
	"fmt"
	"net"
	"net/netip"
	"sort"
)

// DiscoverLANPrefixes 收集当前网络接口上的 IPv4 地址前缀
// 调用方应在服务启动时调用一次，并把结果传入 Options
func DiscoverLANPrefixes() ([]netip.Prefix, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, fmt.Errorf("list network interfaces: %w", err)
	}

	prefixes := make([]netip.Prefix, 0)
	seen := make(map[netip.Prefix]struct{})
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addresses, err := iface.Addrs()
		if err != nil {
			return nil, fmt.Errorf("list addresses for interface %q: %w", iface.Name, err)
		}
		for _, address := range addresses {
			prefix, ok := ipv4Prefix(address)
			if !ok {
				continue
			}
			prefix = prefix.Masked()
			if _, exists := seen[prefix]; exists {
				continue
			}
			seen[prefix] = struct{}{}
			prefixes = append(prefixes, prefix)
		}
	}

	sort.Slice(prefixes, func(i, j int) bool {
		return prefixes[i].String() < prefixes[j].String()
	})
	return prefixes, nil
}

func normalizeLANPrefixes(prefixes []netip.Prefix) []netip.Prefix {
	normalized := make([]netip.Prefix, 0, len(prefixes))
	seen := make(map[netip.Prefix]struct{}, len(prefixes))
	for _, prefix := range prefixes {
		if !prefix.IsValid() || !prefix.Addr().Is4() {
			continue
		}
		prefix = prefix.Masked()
		if _, exists := seen[prefix]; exists {
			continue
		}
		seen[prefix] = struct{}{}
		normalized = append(normalized, prefix)
	}
	sort.Slice(normalized, func(i, j int) bool {
		return normalized[i].String() < normalized[j].String()
	})
	return normalized
}

func ipv4Prefix(address net.Addr) (netip.Prefix, bool) {
	switch value := address.(type) {
	case *net.IPNet:
		ip, ok := netip.AddrFromSlice(value.IP)
		if !ok || !ip.Unmap().Is4() {
			return netip.Prefix{}, false
		}
		bits, maskBits := value.Mask.Size()
		if maskBits != 32 || bits < 0 {
			return netip.Prefix{}, false
		}
		return netip.PrefixFrom(ip.Unmap(), bits), true
	case *net.IPAddr:
		ip, ok := netip.AddrFromSlice(value.IP)
		if !ok || !ip.Unmap().Is4() {
			return netip.Prefix{}, false
		}
		return netip.PrefixFrom(ip.Unmap(), 32), true
	default:
		prefix, err := netip.ParsePrefix(address.String())
		if err != nil || !prefix.Addr().Unmap().Is4() {
			return netip.Prefix{}, false
		}
		return netip.PrefixFrom(prefix.Addr().Unmap(), prefix.Bits()), true
	}
}
