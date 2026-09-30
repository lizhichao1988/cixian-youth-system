/**
 * ============================================================
 * 回填「结对帮扶信息表 / 帮扶需求表」的 Title
 * ============================================================
 *
 * 目的：让青少年基本信息表里的
 *        结对帮扶记录 / 帮扶需求记录
 *      链接字段有可读的文字，而不是空白。
 *
 * 拼接格式（按业务要求，使用「序号」而不是 NocoDB 的 Id）：
 *
 *   结对帮扶记录：  {序号}-{姓名}-{是|否}   例  1183-王海-是
 *   帮扶需求记录：  {序号}{姓名}的需求      例  1183王海的需求
 *
 * 用法：
 *   node scripts/backfill-help-titles.mjs          # 真正写入
 *   node scripts/backfill-help-titles.mjs --dry    # 只打印，不写入
 *
 * 说明：
 *   - 只更新 Title 一个字段，不动其它数据，安全可重复执行。
 *   - 已在脚本内对「和现值相同」的行跳过。
 * ============================================================
 */

import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')

const ENV_PATH = path.resolve(
  process.cwd(),
  'backend/.env',
)

const env = {}

if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(
        /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/,
      )

      if (m) {
        env[m[1]] = m[2].replace(
          /^["']|["']$/g,
          '',
        )
      }
    })
}

const BASE =
  env.NOCODB_BASE_URL ||
  'http://localhost:8080'

const TOKEN = env.NOCODB_API_TOKEN

const T = {
  youth:
    env.NOCODB_TABLE_YOUTH ||
    'mbmgr8u9zx2pvwg',
  pairings:
    env.NOCODB_TABLE_PAIRINGS ||
    'mcg4nw1ilc0rk7x',
  helpNeeds:
    env.NOCODB_TABLE_HELP_NEEDS ||
    'msx90v3yrypspvf',
}

if (!TOKEN) {
  console.error('缺少 NOCODB_API_TOKEN')
  process.exit(1)
}

const HEADERS = {
  'xc-token': TOKEN,
  'Content-Type': 'application/json',
}

async function fetchAll(tableId) {
  const all = []

  let offset = 0

  while (true) {
    const res = await fetch(
      `${BASE}/api/v2/tables/${tableId}/records?limit=200&offset=${offset}`,
      { headers: HEADERS },
    )

    const text = await res.text()

    if (!res.ok) {
      throw new Error(
        `读取失败 ${res.status} ${text.slice(0, 200)}`,
      )
    }

    const data = JSON.parse(text)

    const list = data?.list ?? []

    all.push(...list)

    const total =
      data?.pageInfo?.totalRows ?? 0

    if (
      list.length === 0 ||
      all.length >= total
    ) {
      break
    }

    offset += list.length
  }

  return all
}

async function patchBatch(tableId, rows) {
  const res = await fetch(
    `${BASE}/api/v2/tables/${tableId}/records`,
    {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(rows),
    },
  )

  const text = await res.text()

  if (!res.ok) {
    throw new Error(
      `写入失败 ${res.status} ${text.slice(0, 300)}`,
    )
  }

  return text
}

/**
 * 从一条帮扶记录的链接字段里取出青少年 Id。
 */
function getLinkedYouthId(row) {
  const link = row['青少年基本信息表']

  if (!link) {
    return ''
  }

  const first = Array.isArray(link)
    ? link[0]
    : link

  return String(first?.Id ?? '')
}

function run(title, tableId, buildTitleFn) {
  return async function () {
    const youthRows = await fetchAll(T.youth)

    const seqById = new Map()

    youthRows.forEach((y) => {
      seqById.set(String(y.Id), {
        seq: String(y['序号'] ?? '').trim(),
        name: String(y['姓名'] ?? '').trim(),
      })
    })

    const rows = await fetchAll(tableId)

    const updates = []
    let skipped = 0
    let orphan = 0

    rows.forEach((row) => {
      const youthId = getLinkedYouthId(row)

      const info = seqById.get(youthId)

      if (!info) {
        orphan += 1
        return
      }

      const next = buildTitleFn(row, info)

      const current = String(
        row.Title ?? '',
      ).trim()

      if (current === next) {
        skipped += 1
        return
      }

      updates.push({
        Id: row.Id,
        Title: next,
      })
    })

    console.log(
      `${title}: 共 ${rows.length} 行，需更新 ${updates.length}，已正确跳过 ${skipped}，无关联 ${orphan}`,
    )

    if (DRY) {
      updates
        .slice(0, 5)
        .forEach((u) =>
          console.log('   例:', u.Id, '->', u.Title),
        )
      return
    }

    const SIZE = 100

    for (
      let i = 0;
      i < updates.length;
      i += SIZE
    ) {
      const batch = updates.slice(
        i,
        i + SIZE,
      )

      await patchBatch(tableId, batch)

      console.log(
        `  已写入 ${Math.min(
          i + SIZE,
          updates.length,
        )} / ${updates.length}`,
      )
    }
  }
}

async function main() {
  console.log(
    DRY
      ? '== 试运行（不写入）=='
      : '== 开始回填 Title ==',
  )

  // 结对帮扶记录：{序号}-{姓名}-{是|否}
  await run(
    '结对帮扶信息表',
    T.pairings,
    (row, info) => {
      const flag =
        String(
          row['是否结对帮扶'] ?? '',
        ).trim() === '否'
          ? '否'
          : '是'

      return `${info.seq}-${info.name}-${flag}`
    },
  )()

  // 帮扶需求记录：{序号}{姓名}的需求
  await run(
    '帮扶需求表',
    T.helpNeeds,
    (_row, info) =>
      `${info.seq}${info.name}的需求`,
  )()

  console.log('== 完成 ==')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
