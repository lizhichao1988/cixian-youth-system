#!/bin/bash
# ============================================================
# 一键启动（终端版）
#
# 用法：在本项目目录下执行
#
#     bash 启动.sh
#
# 会依次完成：安装依赖 → 启动后端 → 启动前端
# ============================================================

cd "$(dirname "$0")" || exit 1

if [ ! -d "node_modules" ]; then
  echo "[1/3] 安装前端依赖..."
  npm install || exit 1
fi

if [ ! -d "backend/node_modules" ]; then
  echo "[2/3] 安装后端依赖..."
  (cd backend && npm install) || exit 1
fi

echo "[3/3] 启动服务..."
(cd backend && nohup node server.js > backend.log 2>&1 &)

sleep 4
npm run dev
