# 磁县青少年帮扶管理系统 · 部署到 Render + Supabase（免信用卡 · 永久免费）

> 适用前提：**你目前没有 Visa / 外币信用卡**，无法注册 Oracle。
> 本方案零成本、永久免费，缺点是两个服务 15 分钟无访问会休眠
> （用文末「保活」一步即可做到 24 小时随时访问）。

整体架构：

```
浏览器
  │
  ▼
Render「cixian-app」免费服务   ← 我们的后端 + 前端（一个容器）
  │  调用
  ▼
Render「cixian-nocodb」免费服务 ← NocoDB 中间件
  │  读写
  ▼
Supabase 免费 Postgres   ← 数据库，24 小时在线、不休眠（数据永远在）
```

---

## 第 0 步：把项目推到 GitHub

Render 只能从 Git 仓库拉代码（不能直接传本地文件夹）。

1. 注册 GitHub（https://github.com ，免费）。
2. 新建一个**私有**仓库，比如 `cixian-youth-system`。
3. 在本机项目目录执行：

```bash
cd ~/Documents/cixian-youth-system
git init
git remote add origin https://github.com/你的用户名/cixian-youth-system.git
git add .
git commit -m "init"
git branch -M main
git push -u origin main
```

> 注意：`deploy/.env` 里含密钥，已被 `.gitignore` 忽略，不会上传。
> `deploy/nocodb_dump.sql` 也已忽略，不会上传（数据我们单独还原）。

---

## 第 1 步：创建 Supabase 数据库（免费）

1. 打开 https://supabase.com ，用邮箱注册（**不需要信用卡**）。
2. 新建 Project：
   - Name：随便（如 `cixian`）
   - Database Password：记下来（后面要用）
   - Region：选 **Northeast Asia (Tokyo)** 或 **Singapore**（离国内近）
   - 免费层直接创建。
3. 进入 Project → **Settings → Database**：
   - 复制 **Connection string** 里的 **URI**（形如
     `postgresql://postgres:密码@db.xxxx.supabase.co:5432/postgres`）。
   - 注意用 **5432**（直连），**不要**用 6543 那个连接池地址。

---

## 第 2 步：把本机数据还原进 Supabase

在本机执行（需要 Docker 在跑）：

```bash
cd ~/Documents/cixian-youth-system
bash deploy/restore-to-supabase.sh "刚才复制的URI"
```

脚本会过滤掉本地的角色/权限语句，把 1181 条数据和全部表关联原样写进 Supabase。
完成后去 Supabase 后台 **Table Editor** 看一眼，应有 `nc_*` 系列表。

> 这一步**只做一次**（首次上线）。以后数据都在 Supabase，换服务器也不丢。

---

## 第 3 步：创建 Render 服务（免费）

1. 打开 https://render.com ，用 GitHub 注册登录（**不需要信用卡**）。
2. 右上角 **New → Blueprint**。
3. 连接你的 GitHub 仓库，选 `cixian-youth-system`，上传 `deploy/render.yaml`。
4. Render 会识别出两个服务：`cixian-nocodb` 和 `cixian-app`，都是 **Free**。
5. 在部署前/后填写下面这些变量（标了 `sync:false` 的）：

### cixian-nocodb 服务
| 变量 | 值 |
|---|---|
| `NC_DB` | `pg://db.xxxx.supabase.co:5432?u=postgres&p=你的密码&d=postgres&ssl=1`（把 URI 的 `postgresql://` 换成 `pg://`，`5432/postgres` 改成 `?u=postgres&p=密码&d=postgres&ssl=1`）|
| `NC_SITE_URL` | 先空着，部署完拿到地址再回来填 `https://cixian-nocodb.onrender.com` |

> `NC_AUTH_JWT_SECRET` 已经在 render.yaml 里设成 `generateValue: true`，
> Render 会自动生成一个固定值并记住，不用你管。

### cixian-app 服务
| 变量 | 值 |
|---|---|
| `NOCODB_BASE_URL` | 部署完拿到地址后填 `https://cixian-nocodb.onrender.com` |
| `NOCODB_API_TOKEN` | 见第 5 步生成后填 |
| `PAYLOAD_ENC_KEY` | 复制你本机 `backend/.env` 里的 `PAYLOAD_ENC_KEY` |
| `DATA_ENC_KEY` | 复制你本机 `backend/.env` 里的 `DATA_ENC_KEY` |

6. 点 **Apply / Deploy**。两个服务开始构建（首次约 5~10 分钟）。

---

## 第 4 步：配置 NocoDB 公网地址

1. 等 `cixian-nocodb` 变成 **Live**，打开 `https://cixian-nocodb.onrender.com`。
2. 首次会让你创建**超级管理员**（邮箱 + 密码），记住它。
3. 回到 Render 后台 `cixian-nocodb` 的 Environment，把
   `NC_SITE_URL` 填成 `https://cixian-nocodb.onrender.com`，Save（会自动重启）。

---

## 第 5 步：生成 NOCODB_API_TOKEN 并填回 app

在本机执行：

```bash
cd ~/Documents/cixian-youth-system
node deploy/get-nocodb-token.mjs https://cixian-nocodb.onrender.com 你第4步的邮箱 你第4步的密码
```

输出一行 `TOKEN: xxxx`。复制它，到 Render 后台 `cixian-app` 的 Environment，
把 `NOCODB_API_TOKEN` 填上，**Save → 手动 Redeploy**（右上角）。

---

## 第 6 步：拿到访问地址，验收

`cixian-app` 变成 Live 后，打开 `https://cixian-app.onrender.com`
（具体名字以 Render 给你为准），用 `admin / admin123` 登录即可。

验收：
- 青少年信息页能看到 1181 条数据 ✅
- 新增人员 → 切到帮扶管理能立即看到 ✅
- 统计页饼图显示男女人数 ✅

---

## 第 7 步（重要）：免费层保活，做到 24 小时访问

免费 Web 服务 15 分钟无访问会休眠，首次打开要等 30~60 秒唤醒。
用免费监控每 5 分钟 ping 一次，就能一直在线：

1. 打开 https://uptimerobot.com （免费，邮箱注册）。
2. 新建 Monitor：
   - Type: HTTP(s)
   - URL: `https://cixian-app.onrender.com/api/health`
   - 再加一个，URL: `https://cixian-nocodb.onrender.com/api/v1/health`
   - Interval: 5 minutes
3. 保存。之后两个服务每 5 分钟被访问一次，不再休眠。

> 这样你得到的就是「永久免费 + 24 小时随时公网访问」的管理系统。

---

## 常见问题

**Q：NC_DB 怎么从 URI 改写？**
URI：`postgresql://postgres:abc@db.xxx.supabase.co:5432/postgres`
改成：`pg://db.xxx.supabase.co:5432?u=postgres&p=abc&d=postgres&ssl=1`

**Q：应用打开报 500 / 调不动数据？**
多半是 `NOCODB_API_TOKEN` 没填对或 NocoDB 还没 Live。先确认
`https://cixian-nocodb.onrender.com/api/v1/health` 返回 `ok`，再核对 token。

**Q：Supabase 还原时报扩展错误？**
忽略即可（脚本已 `ON_ERROR_STOP=0`），核心表 `nc_*` 会正常写入。

**Q：以后要换服务器 / 重装？**
数据在 Supabase，永远在。只需重新部署 Render 两个服务、重填第 3~5 步变量。

**Q：免费额度够用吗？**
Supabase 免费 500MB / 2 亿行请求；当前 1181 条数据占用极小，长期够用。
Render 免费 750 小时/月（单服务足够 24 小时运行）。
