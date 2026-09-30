/**
 * ============================================================
 * 统一请求层
 * ============================================================
 *
 * 目的：
 *
 *     1. 后端地址只写一处
 *     2. 登录 token 自动带到每一个请求里
 *     3. 统一处理“未登录 / 无权限”与错误提示
 *
 * 以前 youthApi.js / helpApi.js 各写一份 fetch，
 * 既重复又容易漏带 token，
 * 现在统一收敛到这里。
 * ============================================================
 */

/**
 * 后端地址。
 *
 * 部署规则：
 *
 *     1. 默认空字符串 "" —— 走“同源”模式。
 *        前端构建后由后端一起托管，
 *        /api 请求打到同源地址即可，
 *        无需任何配置（Render / 自有服务器单服务部署首选）。
 *
 *     2. 本地开发：Vite 已配置 /api 代理到 localhost:3001，
 *        所以默认空字符串在开发环境也能直接用。
 *
 *     3. 前后端分离部署（如前端 Vercel、
 *        后端 Render）时，设置环境变量：
 *
 *        VITE_API_BASE_URL=https://your-backend.onrender.com
 *
 *        构建时会把这个地址写死进前端包，
 *        所有 /api 请求都打到该后端。
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || ''

/**
 * 传输加密。
 *
 * 构建时配置 VITE_PAYLOAD_ENC_KEY 后，
 * 请求体 / 响应体会自动加解密，
 * 抓包只能看到密文。
 *
 * 未配置时完全走明文，行为与原来一致。
 */
import {
  TRANSPORT_ENCRYPTION_ENABLED,
  encryptRequestBody,
  decryptResponseData,
} from '../utils/crypto'

const TOKEN_KEY = 'cixian_youth_auth_token'

/**
 * 登录成功后写入，
 * 退出登录时清除。
 */
export function getToken() {
  try {
    return (
      window.localStorage.getItem(
        TOKEN_KEY,
      ) || ''
    )
  } catch {
    return ''
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(
      TOKEN_KEY,
      token || '',
    )
  } catch {
    /* 忽略隐私模式下的写入失败 */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(
      TOKEN_KEY,
    )
  } catch {
    /* 忽略 */
  }
}

/**
 * 每个请求都要带上的登录头。
 */
export function authHeaders() {
  const token = getToken()

  if (!token) {
    return {}
  }

  return {
    'x-auth-token': token,
  }
}

/**
 * 统一的 JSON 请求。
 *
 * 约定后端返回：
 *
 *     { success: true, ... }
 *     { success: false, message: '...' }
 */
export async function requestJson(
  path,
  options = {},
) {
  const url =
    path.startsWith('http')
      ? path
      : API_BASE_URL + path

  const headers = {
    ...authHeaders(),
    ...(options.headers || {}),
  }

  let body = options.body

  /**
   * 请求体加密。
   *
   * FormData（照片上传）不加密，
   * 否则 multipart 边界会被破坏。
   */
  if (
    TRANSPORT_ENCRYPTION_ENABLED &&
    typeof body === 'string'
  ) {
    body = await encryptRequestBody(body)

    headers['x-enc'] = '1'
    headers['Content-Type'] =
      'application/json'
  }

  const response = await fetch(url, {
    ...options,
    headers,
    ...(body !== undefined
      ? { body }
      : {}),
  })

  let data = null

  try {
    data = await response.json()

    /**
     * 后端开了加密时，
     * data 会是一个密文字符串，
     * 这里还原成真正的对象。
     */
    if (
      TRANSPORT_ENCRYPTION_ENABLED &&
      typeof data === 'string'
    ) {
      data = await decryptResponseData(
        data,
      )
    }
  } catch {
    throw new Error(
      '后端返回的数据不是有效的 JSON',
    )
  }

  /**
   * 登录态失效时统一提示，
   * 由调用方决定是否跳回登录页。
   */
  if (response.status === 401) {
    const error = new Error(
      data?.message || '登录已失效，请重新登录',
    )

    error.code = 401

    throw error
  }

  if (
    !response.ok ||
    data?.success === false
  ) {
    const error = new Error(
      data?.message ||
        '请求失败（' +
        response.status +
        '）',
    )

    error.code = response.status

    throw error
  }

  return data
}
