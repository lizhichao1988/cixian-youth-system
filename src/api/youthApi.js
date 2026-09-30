/**
 * ============================================================
 * 青少年数据 API
 * ============================================================
 *
 * 这个文件只负责：
 *
 * 1. 读取青少年数据
 * 2. 刷新并读取青少年数据
 * 3. 更新青少年主表记录
 * 4. 判断后端请求是否成功
 * 5. 提取后端返回的数据
 *
 * 这个文件不负责：
 *
 * - 数据标准化
 * - 困难类别判断
 * - 风险判断
 * - 帮扶判断
 * - 结对帮扶判断
 * - 筛选
 * - 统计
 * - 页面展示
 *
 * 页面和业务逻辑不直接接触 fetch。
 * 所有青少年主表 API 请求统一经过这里。
 * ============================================================
 */

import {
  authHeaders,
  API_BASE_URL,
} from './http'

import {
  extractRecordsFromResult,
} from '../utils/youthUtils'

const YOUTH_API_URL =
  API_BASE_URL + '/api/youth'

/**
 * ============================================================
 * 读取青少年原始数据
 * ============================================================
 */

async function fetchYouthRecords() {
  /**
   * 带上登录态。
   *
   * 乡镇账号登录后，
   * 后端只会返回本乡镇的数据。
   */
  const response =
    await fetch(
      YOUTH_API_URL,
      {
        headers:
          authHeaders(),
      },
    )

  let result

  try {
    result =
      await response.json()
  } catch {
    throw new Error(
      '后端返回的数据不是有效的 JSON',
    )
  }

  if (
    !response.ok ||
    !result?.success
  ) {
    throw new Error(
      result?.message ||
        '读取青少年数据失败',
    )
  }

  const records =
    extractRecordsFromResult(
      result,
    )

  return {
    records,
    result,
  }
}

/**
 * ============================================================
 * 强制刷新后重新读取青少年数据
 * ============================================================
 */

async function refreshYouthRecords() {
  const response =
    await fetch(
      `${YOUTH_API_URL}?refresh=1`,
    )

  let result

  try {
    result =
      await response.json()
  } catch {
    throw new Error(
      '后端返回的数据不是有效的 JSON',
    )
  }

  if (
    !response.ok ||
    !result?.success
  ) {
    throw new Error(
      result?.message ||
        '刷新并读取青少年数据失败',
    )
  }

  const records =
    extractRecordsFromResult(
      result,
    )

  return {
    records,
    result,
  }
}

/**
 * ============================================================
 * 更新青少年主表记录
 * ============================================================
 *
 * 这个函数负责：
 *
 *     前端
 *       ↓
 *     PUT /api/youth/:id
 *       ↓
 *     server.js
 *       ↓
 *     NocoDB 青少年基本信息表
 *
 * 注意：
 *
 * 这里只负责“发送数据”。
 *
 * 不负责：
 *
 * - 判断姓名是否为空
 * - 判断是否需要帮扶
 * - 清空结对帮扶信息
 * - 数据标准化
 *
 * 这些业务规则仍然由 useYouthEditor.js 负责。
 *
 * 参数：
 *
 * id
 *     NocoDB 青少年主记录 ID
 *
 * fields
 *     要保存的字段对象
 *
 * 返回：
 *
 * {
 *   id,
 *   fields,
 *   record,
 *   result
 * }
 *
 * ============================================================
 */

async function updateYouthRecord(
  id,
  fields,
) {
  const youthId =
    String(
      id ?? '',
    ).trim()

  if (!youthId) {
    throw new Error(
      '缺少青少年记录ID',
    )
  }

  const updateFields =
    fields &&
    typeof fields === 'object'
      ? fields
      : {}

  if (
    Object.keys(
      updateFields,
    ).length === 0
  ) {
    throw new Error(
      '没有可保存的字段',
    )
  }

  const response =
    await fetch(
      `${YOUTH_API_URL}/${encodeURIComponent(
        youthId,
      )}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type':
            'application/json',
          ...authHeaders(),
        },
        body:
          JSON.stringify(
            updateFields,
          ),
      },
    )

  let result

  try {
    result =
      await response.json()
  } catch {
    throw new Error(
      '后端返回的数据不是有效的 JSON',
    )
  }

  if (
    !response.ok ||
    !result?.success
  ) {
    throw new Error(
      result?.message ||
        '保存青少年数据失败',
    )
  }

  return {
    id:
      result.id ||
      youthId,

    fields:
      result.fields ||
      updateFields,

    record:
      result.record ||
      null,

    result,
  }
}

/**
 * ============================================================
 * 新增青少年
 * ============================================================
 *
 *     POST /api/youth
 *
 * 后端会：
 *
 *     1. 创建青少年主记录
 *     2. 建立困难类别关联
 *     3. 写入帮扶需求
 *     4. 写入结对帮扶
 *     5. 返回标准化后的新记录
 *
 * 参数：
 *
 * fields
 *     中文字段名对象，例如：
 *     { '姓名': '张三', '性别': '男' }
 *
 * extra
 *     关联表数据：
 *     { categories, bigCategory, helpNeed,
 *       pairing, pairingContact, pairingPhone, pairingUnit }
 * ============================================================
 */
export async function createYouthRecord(
  fields,
  extra = {},
) {
  const response =
    await fetch(YOUTH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        ...fields,
        ...extra,
      }),
    })

  const result =
    await response.json()

  if (
    !response.ok ||
    !result?.success
  ) {
    throw new Error(
      result?.message ||
        '新增人员保存失败',
    )
  }

  return {
    id: result.id,
    record: result.record || null,
    result,
  }
}

// ============================================================
// 风险排查记录：新增
// 一个青少年可以对应多条风险排查记录
// ============================================================
export async function createRiskRecord(youthId, risk) {
  const response = await fetch(
    `${API_BASE_URL}/api/youth/${youthId}/risks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        date: risk?.date || '',
        hasRisk: risk?.hasRisk || risk?.status || '否',
        status: risk?.status || risk?.hasRisk || '否',
        description: risk?.description || '',
        handling: risk?.handling || '',
        inspector: risk?.inspector || '',
        remark: risk?.remark || '',
      }),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      data?.message || '新增风险排查记录失败'
    )
  }

  return data
}


// ============================================================
// 风险排查记录：修改
// ============================================================
export async function updateRiskRecord(riskId, risk) {
  const response = await fetch(
    `${API_BASE_URL}/api/risks/${riskId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        date: risk?.date || '',
        hasRisk: risk?.hasRisk || risk?.status || '否',
        status: risk?.status || risk?.hasRisk || '否',
        description: risk?.description || '',
        handling: risk?.handling || '',
        inspector: risk?.inspector || '',
        remark: risk?.remark || '',
      }),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      data?.message || '修改风险排查记录失败'
    )
  }

  return data
}


// ============================================================
// 风险排查记录：删除
// ============================================================
export async function deleteRiskRecord(riskId) {
  const response = await fetch(
    `${API_BASE_URL}/api/risks/${riskId}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeaders(),
      },
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      data?.message || '删除风险排查记录失败'
    )
  }

  return data
}


// ============================================================
// 青少年基本信息：删除
// ============================================================
export async function deleteYouthRecord(youthId) {
  const id = String(youthId ?? '').trim()

  if (!id) {
    throw new Error('缺少青少年记录ID')
  }

  const response = await fetch(
    `${YOUTH_API_URL}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeaders(),
      },
    }
  )

  const data = await response.json()

  if (!response.ok || !data?.success) {
    throw new Error(
      data?.message || '删除青少年数据失败'
    )
  }

  return data
}


/**
 * ============================================================
 * 导出
 * ============================================================
 */

export {
  YOUTH_API_URL,
  fetchYouthRecords,
  refreshYouthRecords,
  updateYouthRecord,
}