#!/bin/bash
# =========================================================
# 导出本机 NocoDB 数据库
# =========================================================
#
# 在本机（Mac）上执行一次，
# 把数据原样导出成 deploy/nocodb_dump.sql，
# 之后上传到服务器即可完整还原
# （表结构、Id、关联、附件引用全部保留）。
#
# 用法：
#
#   bash deploy/export-db.sh
#
# =========================================================

set -e

cd "$(dirname "$0")/.."

echo "正在导出 NocoDB 数据库..."

docker exec nocodb-db-1 \
  pg_dump -U nocodb -d nocodb --clean --if-exists \
  > deploy/nocodb_dump.sql

SIZE=$(du -h deploy/nocodb_dump.sql | awk '{print $1}')

echo "导出完成：deploy/nocodb_dump.sql （${SIZE}）"

# ---------------------------------------------------------
# 2. 导出附件（帮扶照片）
# ---------------------------------------------------------
#
# 只导数据库是不够的：
#
#   数据库里存的只是照片的**引用**（文件路径），
#   真正的图片文件在 NocoDB 的数据卷里。
#
#   以前没有这一步，
#   服务器上还原完数据，照片全是裂图。
#
# 只打 nc/ 目录（上传的文件），
# 不打 db.json——它会带着本机的数据库密码覆盖服务器配置。
echo ""
echo "正在导出附件（帮扶照片）..."

docker run --rm \
  -v nocodb_nocodb_data:/from:ro \
  -v "$PWD/deploy":/to \
  alpine \
  tar czf /to/nocodb_attachments.tar.gz -C /from nc 2>/dev/null || {
    echo "⚠️  附件导出失败（可能本机没有照片），继续执行"
  }

if [ -f deploy/nocodb_attachments.tar.gz ]; then
  ASIZE=$(du -h deploy/nocodb_attachments.tar.gz | awk '{print $1}')
  echo "导出完成：deploy/nocodb_attachments.tar.gz （${ASIZE}）"
fi

echo ""
echo "下一步：把这两个文件连同项目一起上传到服务器。"
