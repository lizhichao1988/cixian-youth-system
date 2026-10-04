#!/bin/bash
# =========================================================
# 服务器一键部署脚本（Ubuntu 22.04 / ARM64）
# =========================================================
#
# 在 Oracle 免费云主机上执行一次：
#
#   bash deploy/setup-server.sh
#
# 它会依次完成：
#
#   1. 安装 Docker 与 Docker Compose
#   2. 安装 Node.js（用于构建前端）
#   3. 构建前端 dist/
#   4. 启动 Postgres + Redis + NocoDB + 后端
#   5. 自动还原数据库（首次启动时）
#
# =========================================================

set -e

cd "$(dirname "$0")/.."

echo "=========================================="
echo " 磁县青少年帮扶管理系统 —— 一键部署"
echo "=========================================="
echo ""

# ---------------------------------------------------------
# 1. 环境检查
# ---------------------------------------------------------
if [ ! -f deploy/.env ]; then
  echo "❌ 缺少 deploy/.env"
  echo ""
  echo "请先执行："
  echo "  cp deploy/.env.example deploy/.env"
  echo "  vi deploy/.env        # 填入密钥与公网 IP"
  exit 1
fi

if [ ! -f deploy/nocodb_dump.sql ]; then
  echo "❌ 缺少 deploy/nocodb_dump.sql"
  echo ""
  echo "请先把本机导出的数据库文件放到 deploy/ 目录下。"
  exit 1
fi

# ---------------------------------------------------------
# 2. 安装 Docker
# ---------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo ">>> 安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
  echo "Docker 安装完成"
else
  echo ">>> Docker 已安装，跳过"
fi

# ---------------------------------------------------------
# 3. 安装 Node.js 22
# ---------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo ">>> 安装 Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "Node.js 安装完成"
else
  echo ">>> Node.js 已安装：$(node -v)"
fi

# ---------------------------------------------------------
# 4. 构建前端
# ---------------------------------------------------------
echo ">>> 构建前端..."
npm install --no-audit --no-fund
npm run build

if [ ! -f dist/index.html ]; then
  echo "❌ 前端构建失败"
  exit 1
fi

echo "前端构建完成：dist/"

# ---------------------------------------------------------
# 5. 启动全部服务
# ---------------------------------------------------------
echo ">>> 启动服务（首次会自动还原数据库，请耐心等待 2~3 分钟）..."

cd deploy
docker compose up -d --build

echo ""
echo ">>> 等待 NocoDB 就绪..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8080/api/v1/health >/dev/null 2>&1; then
    echo "NocoDB 已就绪"
    break
  fi
  sleep 5
done

echo ""
echo ">>> 等待后端就绪..."
for i in $(seq 1 30); do
  if curl -sf http://localhost/api/health >/dev/null 2>&1; then
    echo "后端已就绪"
    break
  fi
  sleep 3
done

# ---------------------------------------------------------
# 6. 还原附件（帮扶照片）
# ---------------------------------------------------------
#
# 数据库里只有照片的路径引用，
# 图片文件本身要单独放进 NocoDB 的数据卷，
# 否则页面上所有照片都是裂图。
if [ -f nocodb_attachments.tar.gz ]; then
  echo ">>> 还原附件（帮扶照片）..."

  NC_VOL=$(docker inspect cixian-nocodb --format '{{range .Mounts}}{{if eq .Destination "/usr/app/data"}}{{.Name}}{{end}}{{end}}')

  if [ -z "$NC_VOL" ]; then
    echo "⚠️  没找到 NocoDB 数据卷，跳过附件还原"
  else
    docker run --rm \
      -v "$NC_VOL":/to \
      -v "$PWD":/from:ro \
      alpine \
      sh -c "mkdir -p /to/nc && tar xzf /from/nocodb_attachments.tar.gz -C /to"

    echo ">>> 重启 NocoDB 让附件生效..."
    docker compose restart nocodb nocodb-worker >/dev/null 2>&1 || true
    echo "附件还原完成"
  fi
else
  echo ">>> 没有找到 nocodb_attachments.tar.gz，跳过附件还原"
fi

echo ""
echo "=========================================="
echo " 部署完成"
echo "=========================================="
echo ""
echo "请确认服务器的防火墙 / Oracle 安全列表已放行："
echo "   80    管理系统（你访问的地址）"
echo "   8080  附件服务（照片显示需要）"
echo ""
echo "然后浏览器打开："
echo "   http://$(curl -s ifconfig.me 2>/dev/null || echo '你的公网IP')"
echo ""
echo "常用命令："
echo "   看日志：  cd deploy && docker compose logs -f app"
echo "   重启：    cd deploy && docker compose restart"
echo "   停止：    cd deploy && docker compose down"
echo ""
