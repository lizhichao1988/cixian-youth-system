/**
 * ============================================================
 * 登录 / 账号 / 回收站 / 日志 API
 * ============================================================
 */

import {
  requestJson,
} from './http'

/* ============================================================
   登录
   ============================================================ */
export async function login(
  account,
  password,
) {
  return requestJson(
    '/api/auth/login',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify({
        account,
        password,
      }),
    },
  )
}

export async function logout() {
  return requestJson(
    '/api/auth/logout',
    { method: 'POST' },
  )
}

export async function fetchSession() {
  return requestJson(
    '/api/auth/session',
  )
}

/* ============================================================
   账号管理（管理员）
   ============================================================ */
export async function fetchAccounts() {
  return requestJson(
    '/api/auth/accounts',
  )
}

export async function createAccount(
  payload,
) {
  return requestJson(
    '/api/auth/accounts',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify(payload),
    },
  )
}

export async function updateAccount(
  id,
  payload,
) {
  return requestJson(
    `/api/auth/accounts/${id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify(payload),
    },
  )
}

export async function deleteAccount(
  id,
) {
  return requestJson(
    `/api/auth/accounts/${id}`,
    { method: 'DELETE' },
  )
}

/* ============================================================
   回收站
   ============================================================ */
export async function fetchRecycleBin() {
  return requestJson(
    '/api/system/recycle',
  )
}

export async function restoreRecycleItem(
  id,
) {
  return requestJson(
    `/api/system/recycle/${id}/restore`,
    { method: 'POST' },
  )
}

export async function deleteRecycleItem(
  id,
) {
  return requestJson(
    `/api/system/recycle/${id}`,
    { method: 'DELETE' },
  )
}

export async function clearRecycleBin() {
  return requestJson(
    '/api/system/recycle',
    { method: 'DELETE' },
  )
}

/* ============================================================
   操作日志
   ============================================================ */
export async function fetchOperationLogs() {
  return requestJson(
    '/api/system/logs',
  )
}
