// Command protocolgen 调用 tygo 生成共享协议，并提供只读同步检查
package main

import (
	"bytes"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gzuidhof/tygo/tygo"
)

func main() {
	// flag 包解析命令行选项；默认输出路径相对于 packages/server-go
	output := flag.String("out", "../common/src/generated/protocol.ts", "生成的 TypeScript 文件")
	check := flag.Bool("check", false, "只检查生成文件是否同步")
	flag.Parse()

	if err := run(*output, *check); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// run 先在临时目录生成，确保检查模式不会改写共享文件
func run(outputPath string, check bool) error {
	// 先写入临时目录：检查模式只比较内容，不会碰仓库里的生成文件
	directory, err := os.MkdirTemp("", "web-share-protocol-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(directory)

	generatedPath := filepath.Join(directory, "protocol.ts")
	generator := tygo.New(&tygo.Config{
		Packages: []*tygo.PackageConfig{{
			Path:             "github.com/beixiyo/web-share/packages/server-go/protocol",
			OutputPath:       generatedPath,
			EnumStyle:        "enum",
			PreserveComments: "types",
		}},
	})

	if err := generator.Generate(); err != nil {
		return fmt.Errorf("生成协议失败：%w", err)
	}

	generated, err := os.ReadFile(generatedPath)
	if err != nil {
		return err
	}

	if check {
		current, err := os.ReadFile(outputPath)
		if err != nil {
			return err
		}

		if !bytes.Equal(current, generated) {
			return fmt.Errorf("%s 已过期，请运行 pnpm generate:protocol", outputPath)
		}

		return nil
	}

	// 正常生成时才创建目标目录并覆盖生成文件
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return err
	}

	return os.WriteFile(outputPath, generated, 0o644)
}
