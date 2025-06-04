# ---- 基础 Node 镜像阶段 (Base Stage) ----
FROM node:22-alpine AS base

# 设置工作目录，后续的命令都会在这个目录下执行。
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com && \
npm i -g pnpm && \
pnpm config set registry https://registry.npmmirror.com

# 复制根目录的 package.json 和 lockfile (pnpm-lock.yaml)。
# 这是为了利用 Docker 的层缓存机制：只要这些文件没有改变，后续的 pnpm install 步骤就可以使用缓存。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
COPY packages/common/package.json ./packages/common/


# ---- 依赖安装阶段 (Dependencies Stage) ----
FROM base AS dependencies

# 安装所有项目的依赖，包括开发依赖 (devDependencies)，因为构建过程可能需要它们。
# '--frozen-lockfile' (或 pnpm 的 '--lockfile-only' 结合 'pnpm install') 确保使用锁文件中指定的版本，保证构建的可复现性。
# pnpm 会自动处理 monorepo 中的工作区依赖。
RUN pnpm install --frozen-lockfile


# ---- 构建器阶段 (Builder Stage) ----
FROM dependencies AS builder

# 复制项目的其余所有源代码到工作目录。
# .dockerignore 文件会确保不必要的的文件 (如 node_modules, .git, 已有的 dist 目录等) 不会被复制。
COPY . .

# 定义构建时默认参数 (Build-time Argument)
# 这个参数可以在执行 'docker build' 命令时通过 '--build-arg' 传递进来。
ARG VITE_SERVER_URL_ARG=http://localhost:3001
# 将构建时参数 VITE_SERVER_URL_ARG 赋值给环境变量 VITE_SERVER_URL。
# 这样，在执行 pnpm build 命令时，Vite (或其他构建工具) 就可以读取到这个环境变量。
ENV VITE_SERVER_URL=${VITE_SERVER_URL_ARG}

RUN pnpm build && \
pnpm deploy:server


# ---- 生产镜像阶段 (Production Stage) ----
# 使用一个新的、干净的 Node.js Alpine 基础镜像，以减小最终镜像的体积。
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
# 您可以在 'docker run' 时通过 '-e PORT=xxxx' 来覆盖这个默认值。
ENV PORT=3001

# 从 'builder' 阶段复制
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/client/dist ./dist/static
COPY --from=builder /app/deploy/node_modules ./node_modules

# 声明容器在运行时会监听的端口。
# 这只是一个元数据声明，实际的端口映射需要在 'docker run' 命令中使用 '-p' 参数。
EXPOSE ${PORT}

CMD [ "node", "dist/server.mjs" ]
