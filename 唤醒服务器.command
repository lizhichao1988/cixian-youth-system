#!/bin/bash
# ============================================================
# 一键唤醒线上服务器
#
# 背景：Render 免费实例 15 分钟没人访问就会休眠，
#       下次打开要等它重新启动（约 15~40 秒）。
#
# 用法：双击本文件即可。
#       它会一直尝试访问服务器，直到服务器醒来，
#       然后自动用浏览器打开系统登录页。
#       （macOS 首次可能提示"无法打开"，
#         右键本文件 → 打开 → 确认即可）
# ============================================================

cd "$(dirname "$0")" || exit 1

APP="https://cixian-app.onrender.com"
SHIM="https://cixian-shim.onrender.com"

echo ""
echo "============================================"
echo "  正在唤醒服务器，请稍候（通常 15~40 秒）"
echo "============================================"
echo ""

for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 60 "$APP/api/health")

  if [ "$code" = "200" ]; then
    echo ""
    echo "服务器已唤醒（用时约 $((i * 3)) 秒）"
    echo "正在顺带唤醒接口服务与浏览器..."
    curl -s -o /dev/null -m 60 "$SHIM/api/health"
    open "$APP"
    echo ""
    echo "完成！浏览器已打开登录页。"
    exit 0
  fi

  printf "  第 %s 次尝试... 服务器还在启动\n" "$i"
  sleep 3
done

echo ""
echo "两分钟仍未唤醒，请检查网络后重试。"
read -p "按回车退出"
