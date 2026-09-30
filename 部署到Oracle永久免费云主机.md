# 部署到 Oracle 永久免费云主机

> 目标：拿到一个**永久免费、24 小时不关机**的公网地址，直接打开就能用这套系统。
>
> Oracle Cloud 的「Always Free」是业界少有的**真·永久免费**（不是试用 30 天，也不是 12 个月后失效），
> 给的是 **4 核 ARM CPU + 24GB 内存 + 200GB 磁盘**，跑这套系统绰绰有余。
> 注册时要填信用卡，但**只是做身份验证，不会扣费**（不开通付费服务就永远不收费）。

预计耗时：**约 20 分钟**（其中大部分是等 Oracle 创建主机）。

---

## 第 1 步：注册 Oracle Cloud 账号（约 5 分钟）

1. 打开 https://www.oracle.com/cloud/free/
2. 点 **Start for free**
3. 国家/地区选 **China**（或你实际所在地），填邮箱，收验证码
4. 账单信息里填信用卡（仅验证身份，不扣费；可以填借记卡，多数情况也能通过）
5. 注册完成后选择 **主区域（Home Region）**：
   - 推荐 **Japan Central (Osaka)** 或 **Singapore**，离国内近、速度快
   - ⚠️ 主区域选完**不能改**，Always Free 额度只在主区域生效

---

## 第 2 步：创建免费云主机（约 5 分钟）

登录 Oracle 控制台 → 左上角菜单 → **计算（Compute）** → **实例（Instances）** → **创建实例**

| 项目 | 填什么 |
|---|---|
| 名称 | `cixian-youth`（随便起） |
|  compartment | 默认即可 |
| 映像（Image） | **Canonical Ubuntu 22.04** ，架构选 **AArch64（ARM）** |
| 配置（Shape） | 点「编辑」→ 选 **Ampere** → **VM.Standard.A1.Flex** |
| OCPU | **4** |
| 内存 | **24576 MB（24GB）** |
|  | ⚠️ 页面上必须显示「**始终免费（Always Free）**」字样，否则会收费 |
| 网络 | 新建 / 选默认的 VCN 与子网（用默认的即可） |
| SSH 密钥 | 选「**生成新的密钥对**」，**把私钥下载下来保存好**（后面要用它登录） |

点 **创建**，等 1~2 分钟变成「运行中」。
记下页面上的 **公共 IP 地址**（后面统称 `你的IP`）。

---

## 第 3 步：开放端口（很关键，很多人卡在这一步）

Oracle 有两层防火墙，**两层都要开**：

### 3.1 控制台的安全列表

实例详情页 → 点子网 → **安全列表** → **入站规则** → 添加两条：

| 源 CIDR | 协议 | 目标端口 |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `8080` |

### 3.2 系统内部的 iptables

Oracle 的 Ubuntu 镜像默认自带严格 iptables，必须手动放行：

```bash
ssh -i 你下载的私钥.key ubuntu@你的IP

sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save
```

> 如果提示 `netfilter-persistent` 不存在，先执行：
> `sudo apt-get update && sudo apt-get install -y iptables-persistent`

---

## 第 4 步：把项目上传到服务器

在**你自己的 Mac** 上执行（新开一个终端窗口）：

```bash
rsync -avz \
  --exclude node_modules --exclude .git --exclude dist \
  -e "ssh -i 你下载的私钥.key" \
  ~/Documents/cixian-youth-system/ \
  ubuntu@你的IP:~/cixian-youth-system/
```

> 数据库文件 `deploy/nocodb_dump.sql`（约 28MB）会一起传上去，
> 里面是全部 1181 条青少年数据和所有关联表，**原样还原，Id 和关联都不会变**。

---

## 第 5 步：填写线上配置

```bash
ssh -i 你下载的私钥.key ubuntu@你的IP
cd ~/cixian-youth-system
cp deploy/.env.example deploy/.env
vi deploy/.env
```

需要填的只有三项（其余保持默认）：

```
NOCODB_API_TOKEN=   ← 复制本机 backend/.env 里的同一行
PAYLOAD_ENC_KEY=    ← 复制本机 backend/.env 里的同一行
DATA_ENC_KEY=       ← 复制本机 backend/.env 里的同一行
PUBLIC_BASE_URL=http://你的IP:8080
```

> ⚠️ 两个 ENC_KEY **必须和本机完全一致**，
> 否则前端加密后的报文后端解不开，会提示「请求解密失败」。
> 查看本机值：`cat ~/Documents/cixian-youth-system/backend/.env`

---

## 第 6 步：一键部署

```bash
bash deploy/setup-server.sh
```

脚本会自动：装 Docker → 装 Node → 构建前端 → 还原数据库 → 启动 4 个容器。

首次启动要还原 28MB 数据，**约 2~3 分钟**，请耐心等它跑完。

---

## 第 7 步：打开系统

浏览器访问：

```
http://你的IP
```

用原来的账号登录（admin / 原密码）。

---

## 常用运维命令

```bash
cd ~/cixian-youth-system/deploy

docker compose ps              # 看各容器状态
docker compose logs -f app     # 看后端日志
docker compose restart app     # 重启后端
docker compose down            # 停止全部
docker compose up -d           # 再次启动
```

数据全部存在 Docker 数据卷里，**重启服务器也不会丢**。
建议每月做一次备份：

```bash
docker exec cixian-db pg_dump -U nocodb nocodb > backup_$(date +%F).sql
```

---

## 安全建议（可选但推荐）

1. **只放行必要端口**：NocoDB 的 8080 是给照片附件用的，
   如果你不用照片功能，可以在安全列表里关掉 8080。
2. **绑定域名 + HTTPS**：有域名后，把 `FORCE_HTTPS=1`、
   `ALLOWED_ORIGIN=https://你的域名` 写进 `deploy/.env`，
   然后 `docker compose up -d` 重启即可。
3. 服务器上的 8080 不建议对全网开放太久。

---

## 出问题怎么办

| 现象 | 排查 |
|---|---|
| 打不开 http://你的IP | 检查第 3 步的两层防火墙是否都开了 |
| 能打开但登录报「请求解密失败」 | `deploy/.env` 里的 `PAYLOAD_ENC_KEY` 和本机不一致 |
| 页面能开但没数据 | `docker compose logs nocodb` 看 NocoDB 是否还在还原；等几分钟再试 |
| 照片不显示 | `PUBLIC_BASE_URL` 填错，或 8080 端口没放行 |

查看全部容器状态：`docker compose ps`
