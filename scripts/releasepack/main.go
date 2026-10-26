// releasepack 将目录内容写入 ZIP 或 tar.gz 归档
package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"strings"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "releasepack:", err)
		os.Exit(1)
	}
}

// run 解析参数、检查 source，并根据 out 扩展名创建归档
func run() error {
	source := flag.String("source", "", "要归档的目录")
	out := flag.String("out", "", "输出 .zip 或 .tar.gz 文件")
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "用法: %s --source DIR --out ARCHIVE\n", os.Args[0])
		flag.PrintDefaults()
	}
	flag.Parse()

	if *source == "" || *out == "" || flag.NArg() != 0 {
		flag.Usage()
		return errors.New("必须提供 --source 和 --out，且不能有额外参数")
	}

	info, err := os.Lstat(*source)
	if err != nil {
		return fmt.Errorf("读取 source: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return errors.New("source 必须是非符号链接目录")
	}

	switch {
	case strings.HasSuffix(*out, ".zip"):
		return writeZip(*out, os.DirFS(*source))
	case strings.HasSuffix(*out, ".tar.gz"):
		return writeTarGz(*out, os.DirFS(*source))
	default:
		return errors.New("out 扩展名必须是 .zip 或 .tar.gz")
	}
}

// writeZip 用标准库遍历文件系统并写入 ZIP，返回所有归档和文件关闭错误
func writeZip(out string, source fs.FS) (err error) {
	file, err := os.Create(out)
	if err != nil {
		return fmt.Errorf("创建输出文件: %w", err)
	}
	defer func() {
		err = errors.Join(err, closeError("输出文件", file.Close()))
	}()

	archive := zip.NewWriter(file)
	defer func() {
		err = errors.Join(err, closeError("ZIP 归档", archive.Close()))
	}()

	if err := archive.AddFS(source); err != nil {
		return fmt.Errorf("写入 ZIP 归档: %w", err)
	}
	return nil
}

// writeTarGz 用标准库遍历文件系统并写入 tar.gz，按层关闭所有写入器
func writeTarGz(out string, source fs.FS) (err error) {
	file, err := os.Create(out)
	if err != nil {
		return fmt.Errorf("创建输出文件: %w", err)
	}
	defer func() {
		err = errors.Join(err, closeError("输出文件", file.Close()))
	}()

	compressed := gzip.NewWriter(file)
	defer func() {
		err = errors.Join(err, closeError("gzip 流", compressed.Close()))
	}()

	archive := tar.NewWriter(compressed)
	defer func() {
		err = errors.Join(err, closeError("tar 归档", archive.Close()))
	}()

	if err := archive.AddFS(source); err != nil {
		return fmt.Errorf("写入 tar 归档: %w", err)
	}
	return nil
}

// closeError 为资源关闭错误补充名称
func closeError(resource string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("关闭%s: %w", resource, err)
}
