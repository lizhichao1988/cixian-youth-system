/**
 * nocodb-shim
 * ------------------------------------------------------------------
 * 一个极小的 NocoDB v2 兼容接口，直接读写 Supabase Postgres。
 *
 * 目的：让 cixian-app 的后端（backend/server.js 等）继续用
 * NocoDB 的 REST API 操作数据，但底层不再依赖笨重的 NocoDB 服务，
 * 而是直接访问已经还原在 Supabase 里的业务数据。
 *
 * 这样整套系统可以跑在 Render 免费层（512MB），永久免费。
 *
 * 实现的接口（仅覆盖本应用实际用到的子集）：
 *   GET    /api/v2/tables/:tableId/records          （列表，支持 limit/offset）
 *   GET    /api/v2/tables/:tableId/records/:id      （单条，删除前快照用）
 *   POST   /api/v2/tables/:tableId/records          （新增，支持 body 内联关联）
 *   PATCH  /api/v2/tables/:tableId/records          （更新，支持数组批量）
 *   DELETE /api/v2/tables/:tableId/records          （批量删除，body=[{Id:n}]）
 *   POST   /api/v2/tables/:tableId/links/:fieldId/records/:id  （建立关联）
 *   POST   /api/v2/storage/upload                   （附件上传，存 Postgres bytea）
 *   GET    /api/v2/storage/public/:id               （附件读取）
 *   GET    /api/health                              （健康检查）
 */

const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const multer = require('multer')

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))

const PORT = process.env.PORT || 3000
const SCHEMA = 'p0c8s7fcnd9d9d7'
const SHIM_API_TOKEN = process.env.SHIM_API_TOKEN || ''

// Supabase 连接串常带 ?sslmode=require，而 pg 会把 require 当作 verify-full，
// 强制校验证书链（Supabase 池化节点可能给出自签名链），从而覆盖下面的
// rejectUnauthorized:false。这里把 sslmode 去掉，让 ssl 选项真正生效。
const RAW_DB_URL = process.env.DATABASE_URL || ''
const DB_URL = RAW_DB_URL.replace(/[?&]sslmode=[^&]*/i, '')

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

/* ===================================================================
 * 静态映射（由实测的 Supabase 结构得出）
 * =================================================================== */

// NocoDB tableId -> Supabase 物理表名
const TABLE_MAP = {
  mbmgr8u9zx2pvwg: '青少年基本信息表',
  mqmsvk541w2brim: '困难类别',
  mgz6zcrrf3d43ww: '风险排查处置表',
  msx90v3yrypspvf: '帮扶需求表',
  mcg4nw1ilc0rk7x: '结对帮扶信息表',
  ms1xje77xaep3ww: '帮扶记录表',
  m22wdvsuh1px8lw: 'system_accounts',
}

// 物理表名 -> 关联（link）定义
//   aliases : NocoDB 里该关联列的候选标题（兼容应用读取时的多种别名）
//   junction: 中间表
//   selfCol : 中间表里“本表 id”那一列
//   otherCol: 中间表里“对端表 id”那一列
const LINKS = {
  青少年基本信息表: [
    { aliases: ['困难类别', '困难类别记录', '困难类别表', '困难类别记录s'], junction: '_nc_m2m_青少年基本信息表_困难类别', selfCol: '青少年基本信息表_id', otherCol: '困难类别_id' },
    { aliases: ['风险排查处置表', '风险排查记录', '风险排查处置记录', '风险排查情况'], junction: '_nc_m2m_青少年基本信息表_风险排查处置表', selfCol: '青少年基本信息表_id', otherCol: '风险排查处置表_id' },
    { aliases: ['帮扶需求表', '帮扶需求', '帮扶需求记录'], junction: '_nc_m2m_青少年基本信息表_帮扶需求表', selfCol: '青少年基本信息表_id', otherCol: '帮扶需求表_id' },
    { aliases: ['结对帮扶信息表', '结对帮扶', '结对帮扶记录', '结对帮扶表'], junction: '_nc_m2m_青少年基本信息表_结对帮扶信息表', selfCol: '青少年基本信息表_id', otherCol: '结对帮扶信息表_id' },
    { aliases: ['帮扶记录表', '帮扶记录'], junction: '_nc_m2m_青少年基本信息表_帮扶记录表', selfCol: '青少年基本信息表_id', otherCol: '帮扶记录表_id' },
  ],
  风险排查处置表: [
    { aliases: ['青少年基本信息表'], junction: '_nc_m2m_青少年基本信息表_风险排查处置表', selfCol: '风险排查处置表_id', otherCol: '青少年基本信息表_id' },
  ],
  帮扶需求表: [
    { aliases: ['青少年基本信息表'], junction: '_nc_m2m_青少年基本信息表_帮扶需求表', selfCol: '帮扶需求表_id', otherCol: '青少年基本信息表_id' },
  ],
  结对帮扶信息表: [
    { aliases: ['青少年基本信息表'], junction: '_nc_m2m_青少年基本信息表_结对帮扶信息表', selfCol: '结对帮扶信息表_id', otherCol: '青少年基本信息表_id' },
  ],
  帮扶记录表: [
    { aliases: ['青少年基本信息表'], junction: '_nc_m2m_青少年基本信息表_帮扶记录表', selfCol: '帮扶记录表_id', otherCol: '青少年基本信息表_id' },
  ],
}

// NocoDB link fieldId -> 关联定义
//   selfCol : 中间表里“本表 id”那一列
//   otherCol: 中间表里“对端表 id”那一列
// 应用实际用到的关联字段：
//   风险 -> 青少年        c6ting7y677mclx   (server.js)
//   青少年 -> 困难类别     cd4skg38n743c7m  (youthWrite.js)
//   青少年 -> 帮扶需求表   c4dh6pa0l5h7r19  (youthWrite.js)
//   青少年 -> 结对帮扶信息表 cac1qz9ezx3u2hy (youthWrite.js)
const LINK_BY_FIELD_ID = {
  c6ting7y677mclx: { junction: '_nc_m2m_青少年基本信息表_风险排查处置表', selfCol: '风险排查处置表_id', otherCol: '青少年基本信息表_id' },
  cd4skg38n743c7m: { junction: '_nc_m2m_青少年基本信息表_困难类别', selfCol: '青少年基本信息表_id', otherCol: '困难类别_id' },
  c4dh6pa0l5h7r19: { junction: '_nc_m2m_青少年基本信息表_帮扶需求表', selfCol: '青少年基本信息表_id', otherCol: '帮扶需求表_id' },
  cac1qz9ezx3u2hy: { junction: '_nc_m2m_青少年基本信息表_结对帮扶信息表', selfCol: '青少年基本信息表_id', otherCol: '结对帮扶信息表_id' },
}

// NocoDB 系统列（不作为业务字段返回，也不参与写入）
const RESERVED = new Set([
  'id', 'created_at', 'updated_at', 'created_by', 'updated_by',
  'nc_order', '__nc_deleted', 'nc_row_meta',
])

/* ===================================================================
 * 工具函数
 * =================================================================== */

function q(name) {
  return '"' + String(name).replace(/"/g, '"') + '"'
}

// 表名缓存：{ cols:[业务列], types:{列:类型}, hasTitle:bool }
const SCHEMA_CACHE = {}

// NocoDB 以“字段标题(title)”为返回/接收的 key，而不是物理列名。
// 多数表 title==物理列名；只有少数例外（如 system_accounts 的
// 账号/姓名/密码/角色/乡镇/状态 -> account/name/password/role/town/status，
// 青少年基本信息表 的 归口单位 -> responsible_unit）。
// 这两张表在启动期从 NocoDB 元数据(nc_models_v2/nc_columns_v2)载入双向映射：
//   TITLE_OF[table][物理列] = title        （buildRecord 输出用）
//   COL_OF[table][title]    = 物理列       （mapFields 写入用）
const TITLE_OF = {}
const COL_OF = {}

async function loadTitleMaps() {
  try {
    const { rows } = await pool.query(
      `SELECT m.table_name AS t, c.title AS title, c.column_name AS col
         FROM public.nc_models_v2 m
         JOIN public.nc_columns_v2 c ON c.fk_model_id = m.id
        WHERE m.table_name = ANY($1)
          AND c.column_name IS NOT NULL
          AND c.uidt <> 'LinkToAnotherRecord'`,
      [Object.values(TABLE_MAP)],
    )
    const titles = {}
    const cols = {}
    for (const r of rows) {
      if (!titles[r.t]) titles[r.t] = {}
      if (!cols[r.t]) cols[r.t] = {}
      titles[r.t][r.col] = r.title
      cols[r.t][r.title] = r.col
    }
    Object.assign(TITLE_OF, titles)
    Object.assign(COL_OF, cols)
    const covered = Object.keys(titles)
    console.log('[shim] title maps loaded for:', covered.join(', ') || '(none)')
  } catch (e) {
    console.error('[shim] title map load failed (fallback to identity):', e.message)
  }
}

async function loadSchema() {
  const { rows } = await pool.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1`,
    [SCHEMA],
  )
  const byTable = {}
  for (const r of rows) {
    const t = r.table_name
    if (!byTable[t]) byTable[t] = { cols: [], types: {} }
    if (RESERVED.has(r.column_name)) continue
    byTable[t].cols.push(r.column_name)
    byTable[t].types[r.column_name] = r.data_type
  }
  for (const t of Object.keys(byTable)) {
    byTable[t].hasTitle = byTable[t].cols.includes('title')
    // 若该表没有从元数据拿到 title 映射，则退化为“title==物理列名”
    if (!TITLE_OF[t]) {
      TITLE_OF[t] = {}
      COL_OF[t] = {}
      for (const c of byTable[t].cols) {
        TITLE_OF[t][c] = c
        COL_OF[t][c] = c
      }
    }
  }
  Object.assign(SCHEMA_CACHE, byTable)
  console.log('[shim] schema loaded:', Object.keys(byTable).join(', '))
}

// 把请求 body 的字段映射到物理列（跳过未知列、跳过关联列、Title->title）
function mapFields(tableName, body) {
  const meta = SCHEMA_CACHE[tableName]
  if (!meta) return {}
  const colOf = COL_OF[tableName] || {}
  const out = {}
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'Id' || k === 'id') continue
    // 入参 key 是 NocoDB title：映射回物理列；未知 title 时退化为原值
    let col = colOf[k] || k
    if (k === 'Title' && meta.hasTitle) col = 'title'
    if (!meta.cols.includes(col)) continue
    out[col] = v
  }
  return out
}

// 把 JS 值转换成可写入 SQL 的值
function sqlVal(meta, col, v) {
  const type = (meta && meta.types[col]) || ''
  if (v === null || v === undefined) return null
  if (v === '') return null
  if (type === 'jsonb') return JSON.stringify(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

// 从（可能是）关联值里抽取 id 数组
function extractIds(raw) {
  const ids = []
  const arr = Array.isArray(raw) ? raw : [raw]
  for (const item of arr) {
    if (item === null || item === undefined) continue
    if (typeof item === 'object') {
      const idv = item.Id ?? item.id ?? item.ID
      if (idv !== undefined) ids.push(parseInt(idv, 10))
    } else {
      ids.push(parseInt(item, 10))
    }
  }
  return ids.filter((n) => !isNaN(n))
}

// 批量取关联：一次查询拿回本页所有记录在“某关联”上的对端 id
// 返回 { [selfId]: [otherId, ...] }（避免逐行查关联导致的 N+1 查询风暴）
async function getLinkedIdsBatch(link, selfIds) {
  if (!selfIds || !selfIds.length) return {}
  const { rows } = await pool.query(
    `SELECT "${link.selfCol}" AS sid, "${link.otherCol}" AS oid
       FROM ${q(SCHEMA)}.${q(link.junction)}
      WHERE "${link.selfCol}" = ANY($1)`,
    [selfIds],
  )
  const map = {}
  for (const r of rows) {
    const s = r.sid
    if (!map[s]) map[s] = []
    map[s].push(r.oid)
  }
  return map
}

// 写入/更新关联（replace=true 时先清后插）
async function applyLinkFields(tableName, recordId, body, replace) {
  const links = LINKS[tableName] || []
  for (const link of links) {
    let raw = null
    for (const alias of link.aliases) {
      if (body && body[alias] !== undefined) { raw = body[alias]; break }
    }
    if (raw === null) continue
    const ids = extractIds(raw)
    if (replace) {
      await pool.query(
        `DELETE FROM ${q(SCHEMA)}.${q(link.junction)} WHERE "${link.selfCol}" = $1`,
        [recordId],
      )
    }
    for (const id of ids) {
      await pool.query(
        `INSERT INTO ${q(SCHEMA)}.${q(link.junction)} ("${link.selfCol}", "${link.otherCol}")
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [recordId, id],
      )
    }
  }
}

// 把多行物理记录批量组装成 NocoDB 风格的记录对象
// 关键性能修复：关联字段不再逐行查询（N+1），而是按“每个关联一次 IN 查询”批量取回。
async function buildRecords(tableName, rows) {
  const meta = SCHEMA_CACHE[tableName]
  const titleOf = TITLE_OF[tableName] || {}
  const list = rows.map((row) => {
    const obj = { Id: row.id }
    for (const col of meta.cols) {
      let val = row[col]
      if (typeof val === 'string' && (val[0] === '[' || val[0] === '{') && (val.slice(-1) === ']' || val.slice(-1) === '}')) {
        try { val = JSON.parse(val) } catch (_) { /* 保持原字符串 */ }
      }
      // 以 NocoDB title 作为返回 key（多数情况 title==物理列名）
      obj[titleOf[col] || col] = val
    }
    return obj
  })
  const links = LINKS[tableName] || []
  if (links.length && rows.length) {
    const ids = rows.map((r) => r.id)
    for (const link of links) {
      const linked = await getLinkedIdsBatch(link, ids)
      list.forEach((obj, idx) => {
        const oids = linked[rows[idx].id] || []
        const arr = oids.map((id) => ({ Id: id }))
        for (const alias of link.aliases) obj[alias] = arr
      })
    }
  }
  return list
}

// 单条记录的便捷封装（内部同样走批量路径，N=1 时等效）
async function buildRecord(tableName, row) {
  const [obj] = await buildRecords(tableName, [row])
  return obj
}

const ah = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('[shim] error:', e)
  res.status(500).json({ message: String(e && e.message ? e.message : e) })
})

/* ===================================================================
 * 鉴权：校验 xc-token（与应用的 NOCODB_API_TOKEN 一致）
 * =================================================================== */
function auth(req, res, next) {
  if (!SHIM_API_TOKEN) return next()
  const headerToken = req.headers['xc-token']
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (headerToken === SHIM_API_TOKEN || bearer === SHIM_API_TOKEN) return next()
  return res.status(401).json({ message: 'unauthorized' })
}

/* ===================================================================
 * 路由
 * =================================================================== */

app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'nocodb-shim', time: new Date().toISOString() })
})

app.get('/', (req, res) => res.json({ ok: true, service: 'nocodb-shim' }))

// 公开附件读取（无需鉴权，供浏览器 <img> 直链；必须注册在 auth 中间件之前）
app.get('/api/v2/storage/public/:id', ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT data, mimetype FROM ${q(SCHEMA)}.cixian_attachments WHERE id = $1::uuid`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).send('not found')
  res.set('Content-Type', rows[0].mimetype || 'application/octet-stream')
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Cache-Control', 'public, max-age=31536000')
  res.send(rows[0].data)
}))

app.use('/api/v2', auth)

// 列表
app.get('/api/v2/tables/:tableId/records', ah(async (req, res) => {
  const tableName = TABLE_MAP[req.params.tableId]
  if (!tableName) return res.status(404).json({ message: 'table not found' })
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 2000)
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
  const { rows } = await pool.query(
    `SELECT *
       FROM ${q(SCHEMA)}.${q(tableName)}
      WHERE __nc_deleted IS NOT TRUE
      ORDER BY nc_order NULLS LAST, id
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  const list = await buildRecords(tableName, rows)
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM ${q(SCHEMA)}.${q(tableName)} WHERE __nc_deleted IS NOT TRUE`,
  )
  const total = countRows[0].c
  res.json({
    list,
    pageInfo: {
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      isFirstPage: offset === 0,
      isLastPage: offset + rows.length >= total,
    },
  })
}))

// 单条（删除前快照）
app.get('/api/v2/tables/:tableId/records/:id', ah(async (req, res) => {
  const tableName = TABLE_MAP[req.params.tableId]
  if (!tableName) return res.status(404).json({ message: 'table not found' })
  const { rows } = await pool.query(
    `SELECT * FROM ${q(SCHEMA)}.${q(tableName)} WHERE id = $1`,
    [parseInt(req.params.id, 10)],
  )
  if (!rows.length) return res.status(404).json({ message: 'not found' })
  res.json(await buildRecord(tableName, rows[0]))
}))

// 新增
app.post('/api/v2/tables/:tableId/records', ah(async (req, res) => {
  const tableName = TABLE_MAP[req.params.tableId]
  if (!tableName) return res.status(404).json({ message: 'table not found' })
  const meta = SCHEMA_CACHE[tableName]
  const mapped = mapFields(tableName, req.body || {})
  const cols = []
  const ph = []
  const params = []
  let i = 1
  for (const [col, v] of Object.entries(mapped)) {
    cols.push(q(col))
    ph.push('$' + i)
    params.push(sqlVal(meta, col, v))
    i++
  }
  cols.push('created_at')
  ph.push('now()')
  cols.push('updated_at')
  ph.push('now()')
  const sql = `INSERT INTO ${q(SCHEMA)}.${q(tableName)} (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING id`
  const { rows } = await pool.query(sql, params)
  const newId = rows[0].id
  await applyLinkFields(tableName, newId, req.body || {}, true)
  const rec = (await pool.query(`SELECT * FROM ${q(SCHEMA)}.${q(tableName)} WHERE id = $1`, [newId])).rows[0]
  res.json(await buildRecord(tableName, rec))
}))

// 更新（body 可为单对象或数组）
app.patch('/api/v2/tables/:tableId/records', ah(async (req, res) => {
  const tableName = TABLE_MAP[req.params.tableId]
  if (!tableName) return res.status(404).json({ message: 'table not found' })
  const meta = SCHEMA_CACHE[tableName]
  const bodies = Array.isArray(req.body) ? req.body : [req.body]
  const updated = []
  for (const b of bodies) {
    const id = parseInt((b && (b.Id ?? b.id)), 10)
    if (isNaN(id)) continue
    const mapped = mapFields(tableName, b)
    const sets = []
    const params = []
    let i = 1
    for (const [col, v] of Object.entries(mapped)) {
      sets.push(`${q(col)} = $${i}`)
      params.push(sqlVal(meta, col, v))
      i++
    }
    sets.push('updated_at = now()')
    if (sets.length > 0) {
      params.push(id)
      await pool.query(
        `UPDATE ${q(SCHEMA)}.${q(tableName)} SET ${sets.join(', ')} WHERE id = $${i}`,
        params,
      )
    }
    await applyLinkFields(tableName, id, b, true)
    const rec = (await pool.query(`SELECT * FROM ${q(SCHEMA)}.${q(tableName)} WHERE id = $1`, [id])).rows[0]
    updated.push(rec ? await buildRecord(tableName, rec) : { Id: id })
  }
  res.json(Array.isArray(req.body) ? updated : (updated[0] || {}))
}))

// 批量删除（NocoDB v2 风格：body=[{Id:n}]）
app.delete('/api/v2/tables/:tableId/records', ah(async (req, res) => {
  const tableName = TABLE_MAP[req.params.tableId]
  if (!tableName) return res.status(404).json({ message: 'table not found' })
  const arr = Array.isArray(req.body)
    ? req.body
    : (req.body && req.body.Id !== undefined ? [req.body] : [])
  for (const item of arr) {
    const id = parseInt((item && (item.Id ?? item.id)), 10)
    if (isNaN(id)) continue
    await pool.query(`DELETE FROM ${q(SCHEMA)}.${q(tableName)} WHERE id = $1`, [id])
    for (const link of (LINKS[tableName] || [])) {
      await pool.query(
        `DELETE FROM ${q(SCHEMA)}.${q(link.junction)} WHERE "${link.selfCol}" = $1 OR "${link.otherCol}" = $1`,
        [id],
      )
    }
  }
  res.json({ message: 'deleted', count: arr.length })
}))

// 建立关联（显式 link API，风险->青少年 用到）
app.post('/api/v2/tables/:tableId/links/:linkFieldId/records/:recordId', ah(async (req, res) => {
  const tableName = TABLE_MAP[req.params.tableId]
  if (!tableName) return res.status(404).json({ message: 'table not found' })
  const cfg = LINK_BY_FIELD_ID[req.params.linkFieldId]
  if (!cfg) return res.status(404).json({ message: 'link field not found' })
  const recordId = parseInt(req.params.recordId, 10)
  const otherId = parseInt((req.body && (req.body.Id ?? req.body.id)), 10)
  if (isNaN(recordId) || isNaN(otherId)) return res.status(400).json({ message: 'bad id' })
  await pool.query(
    `INSERT INTO ${q(SCHEMA)}.${q(cfg.junction)} ("${cfg.selfCol}", "${cfg.otherCol}")
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [recordId, otherId],
  )
  res.json({ message: 'linked', Id: recordId })
}))

// 解除关联（显式 link API，youthWrite.js 解绑用到）
// body 可为 {Id:n} 或 [{Id:n}]
app.delete('/api/v2/tables/:tableId/links/:linkFieldId/records/:recordId', ah(async (req, res) => {
  const tableName = TABLE_MAP[req.params.tableId]
  if (!tableName) return res.status(404).json({ message: 'table not found' })
  const cfg = LINK_BY_FIELD_ID[req.params.linkFieldId]
  if (!cfg) return res.status(404).json({ message: 'link field not found' })
  const recordId = parseInt(req.params.recordId, 10)
  const arr = Array.isArray(req.body)
    ? req.body
    : (req.body && req.body.Id !== undefined ? [req.body] : [])
  for (const item of arr) {
    const otherId = parseInt((item && (item.Id ?? item.id)), 10)
    if (isNaN(otherId) || isNaN(recordId)) continue
    await pool.query(
      `DELETE FROM ${q(SCHEMA)}.${q(cfg.junction)} WHERE "${cfg.selfCol}" = $1 AND "${cfg.otherCol}" = $2`,
      [recordId, otherId],
    )
  }
  res.json({ message: 'unlinked', Id: recordId })
}))

/* ===================================================================
 * 附件上传 / 读取（自托管，存 Postgres bytea，免外部密钥）
 * =================================================================== */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

async function ensureAttachTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${q(SCHEMA)}.cixian_attachments (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       name text,
       mimetype text,
       size int,
       data bytea,
       created_at timestamptz DEFAULT now()
     )`,
  )
}

app.post('/api/v2/storage/upload', upload.any(), ah(async (req, res) => {
  await ensureAttachTable()
  const files = req.files || []
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https'
  const baseUrl = `${proto}://${req.get('host')}`
  const out = []
  for (const f of files) {
    const { rows } = await pool.query(
      `INSERT INTO ${q(SCHEMA)}.cixian_attachments (name, mimetype, size, data)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [f.originalname, f.mimetype, f.size, f.buffer],
    )
    out.push({
      url: `${baseUrl}/api/v2/storage/public/${rows[0].id}`,
      title: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    })
  }
  res.json(out)
}))

// JSON 解析错误兜底
app.use((err, req, res, next) => {
  if (err) {
    console.error('[shim] middleware error:', err)
    return res.status(400).json({ message: 'bad request: ' + (err.message || err) })
  }
  next()
})

/* ===================================================================
 * 启动
 * =================================================================== */
async function start() {
  // 先监听端口：保证 /api/health 通过，Render 健康检查不会把服务判为失败。
  app.listen(PORT, () => {
    console.log(`[shim] listening on :${PORT}`)
  })
  // 数据库可能在冷启动时暂时不可达：循环重试，直到 schema 加载成功。
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1')
      await loadTitleMaps()
      await loadSchema()
      console.log(`[shim] schema ready (attempt ${attempt})`)
      break
    } catch (e) {
      console.error(`[shim] schema load attempt ${attempt} failed: ${e.message}; retrying in 5s`)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

start().catch((e) => {
  console.error('[shim] fatal startup error:', e)
})

module.exports = app
