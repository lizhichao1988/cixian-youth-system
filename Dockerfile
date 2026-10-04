# =========================================================
# 后端 + 前端（单容器，自包含多阶段构建）
# =========================================================
#
# 第一阶段 build：在镜像里直接构建前端 dist/
#   —— Render / 任何 Docker 平台都无需本地先 build
# 第二阶段 runtime：只装后端生产依赖 + 跑服务
#
# 一个容器对外提供全部服务，部署最简单。
# =========================================================

# ---------- 第一阶段：构建前端 ----------
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .

RUN npm run build

# ---------- 第二阶段：运行 ----------
FROM node:22-slim

WORKDIR /app

# 先装后端依赖，利用 Docker 缓存层
COPY backend/package.json backend/package-lock.json* ./backend/

RUN cd backend && npm install --omit=dev --no-audit --no-fund

# 后端源码
COPY backend/ ./backend/

# 前端构建产物（来自第一阶段）
COPY --from=build /app/dist ./dist/

# 只暴露后端端口，由平台映射到外部
EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "backend/server.js"]
