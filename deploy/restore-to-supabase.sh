#!/usr/bin/env bash
# =========================================================
# 把本机 NocoDB 数据库还原到 Supabase（免费 Postgres）
# =========================================================
#
# 用法：
#   bash deploy/restore-to-supabase.sh "postgresql://postgres:你的密码@db.xxxx.supabase.co:5432/postgres"
#
# 说明：
#   - 连接串在 Supabase 后台 Project Settings → Database →
#     Connection string → URI 里复制（用 5432 直连，不是 6543）
#   - 脚本会先过滤掉 OWNER/GRANT 等语句（Supabase 里没有 nocodb 这个角色），
#     其余表结构 + 数据原样写入，Id 和表关联全部保留。
#   - 只需要运行一次（首次上线）。
# =========================================================
set -e

URL="$1"
if [ -z "$URL" ]; then
  echo "缺少参数：Supabase 连接串"
  echo "用法: bash deploy/restore-to-supabase.sh \"postgresql://postgres:密码@db.xxxx.supabase.co:5432/postgres\""
  exit 1
fi

DUMP="deploy/nocodb_dump.sql"
if [ ! -f "$DUMP" ]; then
  echo "找不到 $DUMP，请先在本机执行导出（见文档）。"
  exit 1
fi

FILTERED="$(mktemp)"
# 去掉与本地角色 nocodb 相关的语句，避免 Supabase 报角色不存在
grep -vE 'OWNER TO nocodb|GRANT .* TO nocodb|REVOKE .* FROM nocodb|nocodb;' "$DUMP" > "$FILTERED"

# 优先用本机已缓存的精确 tag，避免联网拉镜像失败
if docker image inspect postgres:17.10 >/dev/null 2>&1; then
  PGIMAGE=postgres:17.10
elif docker image inspect postgres:17 >/dev/null 2>&1; then
  PGIMAGE=postgres:17
else
  PGIMAGE=postgres:17-alpine
fi
echo ">>> 使用镜像 $PGIMAGE"

echo ">>> 开始还原到 Supabase（忽略个别扩展/权限警告属正常）..."
docker run -i --rm "$PGIMAGE" psql "$URL" -v ON_ERROR_STOP=0 -f - < "$FILTERED" 2>&1 | tail -40
echo ">>> psql 退出码: ${PIPESTATUS[0]} (0=全部成功；非0通常是个别扩展/权限语句报警，稍后核对数据即可)"

rm -f "$FILTERED"
echo ">>> 还原完成。到 Supabase 后台 Tables 里看一眼，应出现 nc_* 系列表。"
