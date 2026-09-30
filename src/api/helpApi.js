/**
 * ============================================================
 * 帮扶管理 API
 * ============================================================
 *
 * 负责三张表的增删改查：
 *
 *     pairings       结对帮扶信息
 *     help-needs     帮扶需求
 *     help-records   帮扶记录
 *
 * 所有请求统一走后端 /api/help/... 与 /api/youth/:id/:kind
 * 由后端再转发到 NocoDB。
 * ============================================================
 */

import {
  authHeaders,
  API_BASE_URL,
} from './http'

/* ============================================================
   下拉选项
   ============================================================
   这些选项是真实从 NocoDB 单选字段里探测出来的，
   不能随便改，否则写入会报 400。
   ============================================================ */

/** 帮扶需求：需求类型 */
export const HELP_NEED_TYPES = [
  '生活',
  '学业',
  '工作',
  '医疗',
  '住房',
  '心理关爱',
  '法律援助',
  '社会融入（技能培训）',
  '婚恋',
  '权益保障',
  '其他',
  '无',
]

/** 帮扶需求：是否已解决 */
export const RESOLVED_OPTIONS = [
  '未解决',
  '解决中',
  '已解决',
]

/** 结对帮扶：是否结对帮扶 */
export const PAIRED_OPTIONS = ['是', '否']

/** 结对帮扶：帮扶状态 */
export const PAIRING_STATUS_OPTIONS = [
  '进行中',
  '已结束',
  '已变更',
]

/** 帮扶记录：帮扶方式 */
export const HELP_METHOD_OPTIONS = [
  '入户走访',
  '电话联系',
  '微信联系',
  '心理疏导',
  '就业帮扶',
  '助学帮扶',
  '住房帮扶',
  '物资帮扶',
  '医疗帮扶',
  '资金帮扶',
  '政策宣传',
  '其他',
]

/* ============================================================
   显示值兼容
   ============================================================
   库里历史数据存的是“是 / 否”，
   但单选字段合法值是“已解决 / 解决中 / 未解决”。
   展示时做一次兼容，避免界面出现非法值。
   ============================================================ */
export function displayResolved(value) {
  if (value === '是') return '已解决'
  if (value === '否') return '未解决'
  return value || ''
}

/* ============================================================
   通用请求
   ============================================================ */
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })

  let data = null

  try {
    data = await response.json()
  } catch {
    throw new Error('后端返回的数据不是有效 JSON')
  }

  if (!response.ok || !data?.success) {
    throw new Error(
      data?.message || '请求失败',
    )
  }

  return data
}

/* ============================================================
   读取某名青少年的帮扶记录
   ============================================================ */
export async function fetchHelpRecords(
  youthId,
  kind,
) {
  const data = await request(
    `${API_BASE_URL}/api/youth/${encodeURIComponent(
      youthId,
    )}/${kind}`,
  )

  return Array.isArray(data.records)
    ? data.records
    : []
}

/* ============================================================
   新增
   ============================================================ */
export async function createHelpRecord(
  kind,
  payload,
) {
  return request(
    `${API_BASE_URL}/api/help/${kind}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )
}

/* ============================================================
   修改
   ============================================================ */
export async function updateHelpRecord(
  kind,
  id,
  payload,
) {
  return request(
    `${API_BASE_URL}/api/help/${kind}/${id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )
}

/* ============================================================
   删除
   ============================================================ */
export async function deleteHelpRecord(
  kind,
  id,
  extra,
) {
  /**
   * 带上所属青少年信息。
   *
   * 后端删除前会把快照写进回收站，
   * 需要知道这条记录属于谁，
   * 管理员日后才能恢复。
   */
  return request(
    `${API_BASE_URL}/api/help/${kind}/${id}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify(
        extra || {},
      ),
    },
  )
}

/* ============================================================
   上传帮扶照片
   ============================================================
   用 FormData 提交，后端原样转发给 NocoDB。
   不要手动设置 Content-Type，
   浏览器会自动带上 multipart boundary。
   ============================================================ */
export async function uploadHelpPhoto(
  recordId,
  file,
) {
  const formData = new FormData()

  formData.append('file', file)

  const response = await fetch(
    `${API_BASE_URL}/api/help/help-records/${recordId}/photo`,
    {
      method: 'POST',
      body: formData,
    },
  )

  let data = null

  try {
    data = await response.json()
  } catch {
    throw new Error('照片上传返回格式错误')
  }

  if (!response.ok || !data?.success) {
    throw new Error(
      data?.message || '照片上传失败',
    )
  }

  return data
}

/**
 * 照片访问地址（原图）。
 *
 * NocoDB 附件的真实可访问地址是 signedPath（dltemp/...），
 * path（download/...）直接请求会 404，
 * 所以必须优先用 signedPath。
 */
export function buildPhotoUrl(photo) {
  if (!photo) return ''

  if (photo.signedPath) {
    return `http://localhost:8080/${photo.signedPath}`
  }

  if (photo.path) {
    return `http://localhost:8080/${photo.path}`
  }

  return ''
}

/**
 * 照片缩略图地址。
 *
 * 优先用小图（thumbnails.small），
 * 没有就退回原图。
 */
export function buildPhotoThumbUrl(photo) {
  if (!photo) return ''

  if (photo.thumbPath) {
    return `http://localhost:8080/${photo.thumbPath}`
  }

  return buildPhotoUrl(photo)
}

/* ============================================================
   删除帮扶照片
   ============================================================
   只从记录里摘掉这张照片的引用，
   由后端写回剩余的附件数组。
   ============================================================ */
export async function removeHelpPhoto(
  recordId,
  { photoId = '', index = -1 } = {},
) {
  const response = await fetch(
    `${API_BASE_URL}/api/help/help-records/${recordId}/photo/remove`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        photoId,
        index,
      }),
    },
  )

  let data = null

  try {
    data = await response.json()
  } catch {
    throw new Error('删除照片返回格式错误')
  }

  if (!response.ok || !data?.success) {
    throw new Error(
      data?.message || '删除照片失败',
    )
  }

  return data
}
