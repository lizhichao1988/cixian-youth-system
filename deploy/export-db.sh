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
echo ""
echo "下一步：把这个文件连同项目一起上传到服务器。"
