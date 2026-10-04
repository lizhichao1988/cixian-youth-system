#!/usr/bin/env bash
# =========================================================
# 数据备份（服务器上执行）
# =========================================================
#
# 备份三样东西：
#   1. Postgres 全库（青少年、帮扶、风险、账号…全部业务数据）
#   2. NocoDB 附件（帮扶照片）
#   3. 回收站与操作日志（backend/data 里的 JSON）
#
# 用法：
#   bash deploy/backup.sh
#
# 加到每天凌晨 3 点自动执行：
#   (crontab -l 2>/dev/null; echo "0 3 * * * cd $HOME/cixian-youth-system && bash deploy/backup.sh >> $HOME/backup.log 2>&1") | crontab -
#
# 恢复：
#   见同目录 restore.sh
# =========================================================

set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/cixian-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DATE="$(date +%F-%H%M)"

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%F %T')] 开始备份 → $BACKUP_DIR"

# ---------- 0. 定位真实的 Docker 卷名 ----------
#
# 卷名会跟着 Compose 项目名走（cixian-youth_* 或 deploy_*），
# 写死会导出一个空文件却看起来“成功”，
# 所以这里直接从运行中的容器里查。
NC_VOL="$(docker inspect cixian-nocodb --format '{{range .Mounts}}{{if eq .Destination "/usr/app/data"}}{{.Name}}{{end}}{{end}}' || true)"
APP_VOL="$(docker inspect cixian-app --format '{{range .Mounts}}{{if eq .Destination "/app/backend/data"}}{{.Name}}{{end}}{{end}}' || true)"

echo "  附件卷：$NC_VOL"
echo "  日志卷：$APP_VOL"

# ---------- 1. 数据库 ----------
echo "  导出数据库..."
docker exec cixian-db \
  pg_dump -U nocodb -d nocodb --clean --if-exists \
  > "$BACKUP_DIR/db-$DATE.sql"

# ---------- 2. NocoDB 附件（帮扶照片） ----------
echo "  导出附件..."
if [ -n "$NC_VOL" ]; then
  docker run --rm \
    -v "$NC_VOL":/from:ro \
    -v "$BACKUP_DIR":/to \
    alpine \
    tar czf "/to/attachments-$DATE.tar.gz" -C /from .
else
  echo "  ⚠️  没找到附件卷，跳过（照片不会被备份）"
fi

# ---------- 3. 回收站 / 操作日志 ----------
echo "  导出回收站与操作日志..."
if [ -n "$APP_VOL" ]; then
  docker run --rm \
    -v "$APP_VOL":/from:ro \
    -v "$BACKUP_DIR":/to \
    alpine \
    tar czf "/to/app-data-$DATE.tar.gz" -C /from .
else
  echo "  ⚠️  没找到日志卷，跳过（回收站与操作日志不会被备份）"
fi

# ---------- 4. 清理旧备份 ----------
echo "  清理 $KEEP_DAYS 天前的旧备份..."
find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "[$(date '+%F %T')] 备份完成："
ls -lh "$BACKUP_DIR" | tail -6
