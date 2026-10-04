#!/usr/bin/env bash
# =========================================================
# 数据恢复（服务器上执行，务必先停服务）
# =========================================================
#
# 用法：
#   bash deploy/restore.sh 2026-10-04-0300
#
# 参数就是备份文件名中间那段时间戳，
# 不带参数会列出可恢复的备份。
# =========================================================

set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/cixian-backups}"
STAMP="${1:-}"

if [ -z "$STAMP" ]; then
  echo "可用备份："
  ls -1 "$BACKUP_DIR"/db-*.sql 2>/dev/null | sed 's#.*/db-##; s#\.sql##' || echo "（没有找到备份）"
  echo
  echo "用法：bash deploy/restore.sh <时间戳>"
  exit 1
fi

DB_FILE="$BACKUP_DIR/db-$STAMP.sql"
ATT_FILE="$BACKUP_DIR/attachments-$STAMP.tar.gz"
APP_FILE="$BACKUP_DIR/app-data-$STAMP.tar.gz"

[ -f "$DB_FILE" ] || { echo "❌ 找不到 $DB_FILE"; exit 1; }

echo "即将从 $STAMP 恢复数据"
echo "⚠️  这会覆盖当前数据库中的同名数据"
read -r -p "确认请输入 yes： " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "已取消"; exit 0; }

echo ">>> 停止业务服务（保留数据库容器）..."
docker compose -f deploy/docker-compose.yml stop app nocodb nocodb-worker || true

echo ">>> 恢复数据库..."
docker exec -i cixian-db psql -U nocodb -d nocodb < "$DB_FILE"

if [ -f "$ATT_FILE" ]; then
  echo ">>> 恢复附件..."
  docker run --rm \
    -v cixian-youth_nocodb_data:/to \
    -v "$BACKUP_DIR":/from:ro \
    alpine \
    sh -c "rm -rf /to/* && tar xzf /from/$(basename "$ATT_FILE") -C /to"
fi

if [ -f "$APP_FILE" ]; then
  echo ">>> 恢复回收站与操作日志..."
  docker run --rm \
    -v cixian-youth_app_data:/to \
    -v "$BACKUP_DIR":/from:ro \
    alpine \
    sh -c "rm -rf /to/* && tar xzf /from/$(basename "$APP_FILE") -C /to"
fi

echo ">>> 重新启动服务..."
docker compose -f deploy/docker-compose.yml up -d

echo
echo "✅ 恢复完成"
