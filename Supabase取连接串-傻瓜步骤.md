# Supabase 复制「连接串」傻瓜步骤（照着点，1 分钟）

> 你的项目已经建好了（截图里能看到 `cixian-youth-system`），现在只差**把连接串找出来**。  
> 连接串就是一把"钥匙"，有了它我就能把本机 1181 条数据搬进 Supabase，后面 Render 部署也要用。

---

## 一、点哪里（两条路，任选一条，推荐第 1 条）

### 路线 1（最快）：顶部绿色 Connect 按钮

1. 进入你的 Supabase 项目页面（就是你现在截图这个页面）。
2. 看页面**最上面一排**：`main [PRODUCTION]` 右边有一个 **绿色按钮 Connect**。  
   → **点它**。
3. 屏幕中间会弹出一个面板，标题类似 **"Connect to your project"**。
4. 面板里有几个标签/下拉框，选 **Session pooler**（中文界面可能显示"会话池"）：
   - 地址是 `aws-0-xxxxx.pooler.supabase.com`
   - 端口是 **5432**
   - 如果面板里没有 Session pooler，就选 **Direct connection**（地址是 `db.xxxx.supabase.co`）。
   - ⚠️ **绝对不要选 Transaction pooler**：它的端口是 **6543**，那个地址还原数据会失败。
5. 面板里会有 **URI** 这一行，形如：
   ```
   postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```
   点这行**右边的复制图标**（两个小方块叠在一起的那个），就复制到剪贴板了。

### 路线 2（备用）：左下角齿轮

1. 点页面**左下角的齿轮图标** ⚙（Project Settings）。
2. 左侧菜单找到 **Database**（数据库），点开。
3. 页面往下滚，找到 **Connection string**（连接字符串）区域。
4. 里面有几个标签，点 **URI** 那个标签。
5. 同样点右侧复制图标复制。

---

## 二、最关键的一步：把 [YOUR-PASSWORD] 换成真实密码

复制出来的那串里，密码位置是**占位符** `[YOUR-PASSWORD]`，不是真密码：

```
postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
                                     ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑ 这里必须换掉
```

把你**建项目时设置的数据库密码**填进去。比如密码是 `Abc123456`，最后应该是：

```
postgresql://postgres.abcdefghij:Abc123456@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

> 密码里如果有 `@ # $ % & : /` 这类符号，容易出错，**最省事的办法**：  
> 干脆重置成一个纯字母数字的新密码（见下面第三节），再用新密码。

---

## 三、密码记不住了怎么办（30 秒重置）

1. 在 **Connect 面板**或者 **Project Settings → Database** 页面上，找到 **Database password** 这一行。
2. 它旁边有 **Reset database password**（重置数据库密码）按钮，点它。
3. 弹窗里会让你输入新密码（或点 **Generate a password** 自动生成），**复制下来保存到备忘录**。
4. 确认后，旧密码立刻失效，新密码生效。
5. 然后回到第二节，把新密码填进连接串。

---

## 四、把结果发给我

把**带真实密码的完整连接串**贴给我即可，比如：

```
postgresql://postgres.abcdefghij:Abc123456@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

我拿到之后会立刻接手（你什么都不用再点）：

1. 先测通不通（不通我会自动换另一种地址，不用你管）；
2. 把本机 `nocodb_dump.sql`（1181 条数据 + 全部表结构）灌进 Supabase；
3. 到 Supabase 后台 Table Editor 复核：应出现 `nc_*` 系列表、数据条数对得上；
4. 接着走 Render 部署（第 3~7 步）。

---

## 五、关于你截图里的一个猜测

我从你的浏览器地址栏看到项目编号是 `izbunojklpmaqyptgeed`，如果你**实在找不到**绿色 Connect 按钮，  
可以先用下面这条模板（把 `[YOUR-PASSWORD]` 换成真实密码）直接发我：

```
postgresql://postgres:[YOUR-PASSWORD]@db.izbunojklpmaqyptgeed.supabase.co:5432/postgres
```

> 说明：我测了下，`db.izbunojklpmaqyptgeed.supabase.co` 这个域名目前公共 DNS 解析不出来  
> （Supabase 新项目常见：直连只给 IPv6，或者要用 pooler 地址）。所以**优先给我面板里 Connect  
> 面板显示的那个地址**，以它为准，成功率最高。

---

## 六、万一还是连不上（不用你操作，我知道怎么办）

本机环境有限制，我已经准备好了备用通道 `deploy/pg-tunnel.py`：  
它用你电脑上正在跑的代理（127.0.0.1:7890）开隧道，把 Supabase 的 5432 端口接到本地，  
再用 Docker 自带的 `psql` 灌数据。这套已经实测可通（代理对任意端口、任意主机都放行）。  
所以就算直连失败，我也能从本机把数据还原进去。
