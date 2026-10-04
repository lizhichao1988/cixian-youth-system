/**
 * 重置账号密码（自救后门）
 * =========================================================
 *
 * 什么时候用：
 *
 *     管理员账号因为弱口令被系统锁住（登录后
 *     所有业务接口返回 423、页面一片空白），
 *     而改密弹窗又必须填「当前密码」——
 *     如果这时候旧密码记不清、或者账号是别人留下的，
 *     就彻底进不去了。
 *
 *     这个脚本直接改数据库里的密码字段，
 *     不依赖登录态，用来把账号救回来。
 *
 * 用法：
 *
 *     node scripts/reset-password.mjs admin 'Cixian@2026#'
 *
 *     第一个参数：账号
 *     第二个参数：新密码（建议加引号，避免 ! # 被 shell 吃掉）
 *
 * 注意：
 *
 *     1. 新密码必须能通过系统强度校验
 *        （至少 8 位、含字母和数字、
 *          不能是 admin123 / 12345678 这类），
 *        否则改完登录还是会被要求改密。
 *     2. 脚本连的是 backend/.env 里配的数据源，
 *        本地默认指向线上库，执行前确认清楚。
 * =========================================================
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(
  fileURLToPath(import.meta.url),
)

const require = createRequire(import.meta.url)
const { hashPassword } = require(
  '../backend/security.js',
)

function loadEnv() {
  const envPath = path.join(
    __dirname,
    '..',
    'backend',
    '.env',
  )

  const env = {}

  if (!fs.existsSync(envPath)) {
    return env
  }

  for (const line of fs
    .readFileSync(envPath, 'utf8')
    .split('\n')) {
    const trimmed = line.trim()

    if (
      !trimmed ||
      trimmed.startsWith('#')
    ) {
      continue
    }

    const idx = trimmed.indexOf('=')

    if (idx < 0) continue

    env[trimmed.slice(0, idx).trim()] =
      trimmed.slice(idx + 1).trim()
  }

  return env
}

const env = loadEnv()

const BASE_URL =
  env.NOCODB_BASE_URL
const TOKEN =
  env.NOCODB_API_TOKEN
const ACCOUNT_TABLE =
  env.NOCODB_TABLE_ACCOUNTS ||
  'm22wdvsuh1px8lw'

const account = process.argv[2]
const newPassword = process.argv[3]

if (!account || !newPassword) {
  console.error(
    '用法：node scripts/reset-password.mjs <账号> <新密码>',
  )
  process.exit(1)
}

if (!BASE_URL || !TOKEN) {
  console.error(
    'backend/.env 里缺少 NOCODB_BASE_URL 或 NOCODB_API_TOKEN',
  )
  process.exit(1)
}

if (newPassword.length < 8) {
  console.error('新密码至少 8 位')
  process.exit(1)
}

if (
  !/[A-Za-z]/.test(newPassword) ||
  !/\d/.test(newPassword)
) {
  console.error(
    '新密码必须同时包含字母和数字',
  )
  process.exit(1)
}

const headers = {
  'xc-token': TOKEN,
  'Content-Type':
    'application/json',
}

async function main() {
  console.log(
    `数据源：${BASE_URL}`,
  )

  const res = await fetch(
    `${BASE_URL}/api/v2/tables/${ACCOUNT_TABLE}/records?limit=200`,
    { headers },
  )

  if (!res.ok) {
    console.error(
      '账号表读取失败：',
      res.status,
    )
    process.exit(1)
  }

  const data = await res.json()
  const list = data?.list || []

  const found = list.find(
    (item) =>
      String(item['账号'] || '').trim() ===
      String(account).trim(),
  )

  if (!found) {
    console.error(
      `账号不存在：${account}`,
    )
    console.error(
      '库里现有账号：' +
        list
          .map((i) => i['账号'])
          .filter(Boolean)
          .join('、'),
    )
    process.exit(1)
  }

  const patch = await fetch(
    `${BASE_URL}/api/v2/tables/${ACCOUNT_TABLE}/records`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify([
        {
          Id: Number(found['Id']),
          密码: hashPassword(
            newPassword,
          ),
        },
      ]),
    },
  )

  if (!patch.ok) {
    console.error(
      '写入失败：',
      patch.status,
      await patch.text(),
    )
    process.exit(1)
  }

  console.log('')
  console.log(
    `✅ 账号「${account}」密码已重置`,
  )
  console.log(
    `   新密码：${newPassword}`,
  )
  console.log('')
  console.log(
    '   请用新密码重新登录。',
  )
}

main().catch((error) => {
  console.error('执行失败：', error.message)
  process.exit(1)
})
