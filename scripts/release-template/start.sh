#!/usr/bin/env sh
# 在发布包目录加载可选配置并启动 Web Share Go 服务

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if [ -f ./config.env ]; then
  # 配置文件中的值覆盖启动进程继承的同名环境变量
  set -a
  # shellcheck disable=SC1091
  . ./config.env
  set +a
fi

if [ ! -x ./web-share ]; then
  echo "找不到可执行文件 ./web-share" >&2
  exit 1
fi

exec ./web-share
