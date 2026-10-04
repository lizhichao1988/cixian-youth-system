# 轻量 NocoDB 兼容接口（直接读 Supabase Postgres）
# 内存极小，可运行在 Render 免费层（512MB）。
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
