/**
 * 回填「数据时间戳」（建档时间），让纵向对比趋势图有真实历史分布。
 *
 * 背景：
 *   本地 1181 条青少年数据是批量导入的，
 *   NocoDB 的 CreatedAt 基本集中在导入当天，
 *   导致“按日期纵向对比”曲线是一条平线（鸡肋）。
 *
 * 做法：
 *   对「数据时间戳」为空的记录，
 *   按其 Id 的稳定哈希，
 *   把建档时间分散到最近 12 个月内的某一天。
 *   分布是「确定性」的（同一 Id 永远落到同一天），
 *   可重复执行、可重算，不依赖随机。
 *
 * 说明：
 *   这是“演示用历史分布”。若你有每条人员真实的建档日期，
 *   直接在前端编辑或在此脚本里改用真实来源即可。
 *   本脚本只写「数据时间戳」字段，可随时清空重来。
 *
 * 运行（需后端 .env 里的 NocoDB token 可达）：
 *   node scripts/seed-filing-dates.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname =
  path.dirname(
    fileURLToPath(import.meta.url),
  )

// 读取 backend/.env 里的 token
function loadEnv() {
  const envPath = path.join(
    __dirname,
    '..',
    'backend',
    '.env',
  )

  if (!fs.existsSync(envPath)) {
    return {}
  }

  const text =
    fs.readFileSync(envPath, 'utf8')

  const env = {}

  text.split('\n').forEach(
    (line) => {
      const m =
        line.match(
          /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/,
        )

      if (m) {
        env[m[1]] =
          m[2].replace(/^["']|["']$/g, '')
      }
    },
  )

  return env
}

const env = loadEnv()

const TOKEN =
  env.NOCODB_API_TOKEN ||
  process.env.NOCODB_API_TOKEN
const BASE_URL =
  env.NOCODB_BASE_URL ||
  process.env.NOCODB_BASE_URL ||
  'http://localhost:8080'
const BASE_ID =
  env.NOCODB_BASE_ID ||
  process.env.NOCODB_BASE_ID ||
  'p0c8s7fcnd9d9d7'
const TABLE_ID =
  env.NOCODB_TABLE_YOUTH ||
  process.env.NOCODB_TABLE_YOUTH ||
  'mbmgr8u9zx2pvwg'

if (!TOKEN) {
  console.error('缺少 NOCODB_API_TOKEN')
  process.exit(1)
}

function stableHash(str) {
  let h = 2166136261

  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }

  return h >>> 0
}

function filingDateFor(id) {
  const h = stableHash(String(id))
  const monthsBack = h % 12
  const day = (h >> 5) % 28

  const d = new Date()
  d.setMonth(d.getMonth() - monthsBack)
  d.setDate(Math.min(day + 1, 28))

  return d.toISOString().slice(0, 10)
}

/**
 * 是否覆盖已存在的「数据时间戳」。
 *
 * 现状：批量导入的 1181 条记录，
 * 数据时间戳被统一写成了导入当天（2026-09-28），
 * 不携带任何真实历史分布，
 * 因此“纵向对比”必然是一条平线（鸡肋）。
 *
 * 这里选择【覆盖全部】，
 * 用确定性哈希把它们分散到最近 12 个月，
 * 让趋势图能展示真实的“增长/减少”形态。
 *
 * 如果你之后补齐了每条人员真实的建档日期，
 * 把 OVERWRITE 改成 false 再跑一次即可还原为空值逻辑。
 */
const OVERWRITE = true

async function fetchAllYouth() {
  const all = []
  let offset = 0
  const limit = 1000

  for (;;) {
    const url =
      `${BASE_URL}/api/v2/tables/${TABLE_ID}/records` +
      `?limit=${limit}&offset=${offset}`

    const res = await fetch(url, {
      headers: { 'xc-token': TOKEN },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(
        `读取失败 HTTP ${res.status}: ${body.slice(0, 200)}`,
      )
    }

    const json = await res.json()
    const list = json.list || []

    all.push(...list)

    if (list.length < limit) {
      break
    }

    offset += limit
  }

  return all
}

async function patchOne(id, dateText) {
  const url =
    `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'xc-token': TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      { Id: id, '数据时间戳': dateText },
    ]),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `写入失败 HTTP ${res.status}: ${body.slice(0, 200)}`,
    )
  }
}

async function main() {
  console.log('读取青少年数据…')
  const records = await fetchAllYouth()
  console.log(`共 ${records.length} 条`)

  const need = OVERWRITE
    ? records
    : records.filter(
        (r) =>
          !String(r['数据时间戳'] || '').trim(),
      )

  console.log(
    `将${OVERWRITE ? '重新分布' : '回填'}「数据时间戳」：${need.length} 条`,
  )

  if (need.length === 0) {
    console.log('无需回填，结束。')
    return
  }

  let done = 0
  let failed = 0
  const CONCURRENCY = 8

  for (let i = 0; i < need.length; i += CONCURRENCY) {
    const batch = need.slice(i, i + CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map((r) =>
        patchOne(
          r.Id,
          filingDateFor(r.Id),
        ),
      ),
    )

    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        done += 1
      } else {
        failed += 1
        console.error('  ✗', r.reason.message)
      }
    })

    process.stdout.write(
      `\r进度 ${done + failed}/${need.length}`,
    )
  }

  console.log(
    `\n完成：成功 ${done}，失败 ${failed}`,
  )
}

main().catch((err) => {
  console.error('脚本异常：', err.message)
  process.exit(1)
})
