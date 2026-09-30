#!/usr/bin/env node
// =========================================================
// 从已上线的 NocoDB 取 xc-token（给应用后端用）
// =========================================================
//
// 用法：
//   node deploy/get-nocodb-token.mjs <NocoDB地址> <邮箱> <密码>
//
// 例：
//   node deploy/get-nocodb-token.mjs https://cixian-nocodb.onrender.com admin@cixian.com 你的密码
//
// 输出一行 TOKEN: xxxx，把它填进 Render 里 app 服务的
// NOCODB_API_TOKEN 环境变量，然后手动 Redeploy app。
// =========================================================

const [base, email, password] = process.argv.slice(2)

if (!base || !email || !password) {
  console.error('用法: node deploy/get-nocodb-token.mjs <NocoDB地址> <邮箱> <密码>')
  process.exit(1)
}

const url = base.replace(/\/+$/, '') + '/api/v1/auth/user/signin'

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})

const text = await res.text()
let data
try {
  data = JSON.parse(text)
} catch {
  console.error('登录失败，NocoDB 返回：', text.slice(0, 300))
  process.exit(1)
}

if (!data.token) {
  console.error('未拿到 token，返回：', text.slice(0, 300))
  process.exit(1)
}

console.log('TOKEN:', data.token)
