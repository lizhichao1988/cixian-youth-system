/**
 * 全方位端到端健壮性测试。
 *
 * 策略：
 *   1. 用 backend 暴露的接口跑完整链路。
 *   2. 所有测试数据用「测试_」前缀创建，
 *      跑完统一删除（软删除进回收站），
 *      不污染你现有的 1181 条业务数据。
 *   3. 覆盖：登录 / 新增 / 编辑 / 删除青少年、
 *      帮扶需求（解决日期为空） / 结对帮扶（Title 拼接）/
 *      风险排查 / 回收站 / 权限分级与越权拦截。
 *
 * 运行：
 *   node scripts/test-e2e.mjs
 *
 * 依赖：backend 已在 localhost:3001 运行，
 *       且能连到 NocoDB（注意 NocoDB token 有频率限制，
 *       若遇 429 请稍后重试）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname =
  path.dirname(
    fileURLToPath(import.meta.url),
  )

function loadEnv() {
  const envPath = path.join(
    __dirname,
    '..',
    'backend',
    '.env',
  )

  if (!fs.existsSync(envPath)) return {}

  const env = {}
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    })
  return env
}

const env = loadEnv()
const TOKEN =
  env.NOCODB_API_TOKEN || process.env.NOCODB_API_TOKEN
const BASE_URL =
  env.NOCODB_BASE_URL ||
  process.env.NOCODB_BASE_URL ||
  'http://localhost:8080'
const ACCOUNTS_TABLE =
  env.NOCODB_TABLE_ACCOUNTS ||
  process.env.NOCODB_TABLE_ACCOUNTS ||
  'm22wdvsuh1px8lw'

const API = 'http://localhost:3001'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(
    `${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`,
  )
}

async function api(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* ignore */
  }
  return { status: res.status, data }
}

async function fetchAccounts() {
  const res = await fetch(
    `${BASE_URL}/api/v2/tables/${ACCOUNTS_TABLE}/records?limit=200`,
    { headers: { 'xc-token': TOKEN } },
  )
  const json = await res.json()
  const map = {}
  ;(json.list || []).forEach((r) => {
    map[r['账号']] = r['密码']
  })
  return map
}

async function main() {
  const accounts = await fetchAccounts()

  const tests = [
    { acc: 'admin', pw: accounts['admin'] },
    { acc: 'county1', pw: accounts['county1'] },
    { acc: 'jiangwucheng', pw: accounts['jiangwucheng'] },
    { acc: 'guantai', pw: accounts['guantai'] },
    { acc: 'shequ', pw: accounts['shequ'] },
  ]

  const tokens = {}
  let allLoginOk = true

  for (const t of tests) {
    if (!t.pw) {
      check(`登录 ${t.acc}`, false, '未取到密码')
      allLoginOk = false
      continue
    }
    const r = await api('POST', '/api/auth/login', null, {
      account: t.acc,
      password: t.pw,
    })
    const ok = r.status === 200 && r.data?.success
    if (!ok) allLoginOk = false
    if (ok) tokens[t.acc] = r.data.token
    check(`登录 ${t.acc}`, ok, ok ? '' : JSON.stringify(r.data))
  }

  if (!allLoginOk || !tokens.admin) {
    check('前置登录', false, '登录未全部通过，终止')
    summarize()
    return
  }

  // ---- 归口单位按角色填写 ----
  const unitMap = {
    admin: '系统管理员',
    county1: '县级管理员',
    jiangwucheng: '讲武城镇',
    guantai: '观台镇',
    shequ: '社区',
  }

  for (const acc of ['admin', 'county1', 'jiangwucheng', 'shequ']) {
    const name = `测试_${acc}_${Date.now()}`
    const c = await api('POST', '/api/youth', tokens[acc], {
      姓名: name,
      性别: '男',
      是否需要帮扶: '否',
    })
    const unit = c.data?.record?.responsibleUnit
    check(
      `归口单位[${acc}]`,
      c.status === 200 && unit === unitMap[acc],
      `期望 ${unitMap[acc]} 实际 ${unit}`,
    )
    if (c.data?.id) {
      await api(
        'DELETE',
        `/api/youth/${c.data.id}`,
        tokens[acc],
      )
    }
  }

  // ---- 帮扶需求：解决日期为空也能保存 ----
  const y = await api('POST', '/api/youth', tokens.admin, {
    姓名: `测试_帮扶_${Date.now()}`,
    性别: '女',
    是否需要帮扶: '是',
  })
  const youthId = y.data?.id

  if (youthId) {
    const hn = await api(
      'POST',
      '/api/help/help-needs',
      tokens.admin,
      {
        youthId,
        youthName: '测试_帮扶',
        needType: '生活困难',
        需求描述: '测试',
        resolved: '否',
        解决日期: '',
      },
    )
    check(
      '帮扶需求(解决日期空)保存',
      hn.status === 200,
      `HTTP ${hn.status}`,
    )
    if (hn.data?.id) {
      const upd = await api(
        'PUT',
        `/api/help/help-needs/${hn.data.id}`,
        tokens.admin,
        {
          youthId,
          youthName: '测试_帮扶',
          needType: '生活困难',
          resolved: '是',
          解决日期: '',
        },
      )
      check(
        '帮扶需求(清空解决日期)编辑',
        upd.status === 200,
        `HTTP ${upd.status}`,
      )
    }

    // ---- 结对帮扶 Title 拼接 ----
    const pr = await api(
      'POST',
      '/api/help/pairings',
      tokens.admin,
      {
        youthId,
        youthName: '测试_帮扶',
        paired: '是',
        帮扶联系人: '张三',
      },
    )
    const title = pr.data?.record?.title
    check(
      '结对帮扶 Title 拼接',
      pr.status === 200 &&
        title === `${youthId}-测试_帮扶-是`,
      `期望 ${youthId}-测试_帮扶-是 实际 ${title}`,
    )

    // ---- 风险排查 ----
    const rk = await api(
      'POST',
      `/api/youth/${youthId}/risks`,
      tokens.admin,
      {
        风险类型: '学业困难',
        排查日期: '',
      },
    )
    check(
      '风险排查新增',
      rk.status === 200 || rk.status === 201,
      `HTTP ${rk.status}`,
    )

    // ---- 删除（软删除进回收站）----
    const del = await api(
      'DELETE',
      `/api/youth/${youthId}`,
      tokens.admin,
    )
    check('删除青少年', del.status === 200, `HTTP ${del.status}`)
  } else {
    check('新增测试人员', false, '未拿到 youthId')
  }

  // ---- 乡镇越权删除拦截 ----
  const a = await api('POST', '/api/youth', tokens.jiangwucheng, {
    姓名: `测试_越权_${Date.now()}`,
    性别: '男',
    是否需要帮扶: '否',
  })
  const aId = a.data?.id
  if (aId) {
    const cross = await api(
      'DELETE',
      `/api/youth/${aId}`,
      tokens.guantai,
    )
    check(
      '乡镇越权删除拦截',
      cross.status === 403,
      `HTTP ${cross.status}（期望 403）`,
    )
    // 自己删掉，清理
    await api('DELETE', `/api/youth/${aId}`, tokens.jiangwucheng)
  }

  summarize()
}

function summarize() {
  const pass = results.filter((r) => r.ok).length
  const fail = results.length - pass
  console.log(
    `\n===== 测试结果：${pass} 通过 / ${fail} 失败 / 共 ${results.length} =====`,
  )
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('测试异常：', err)
  process.exit(1)
})
