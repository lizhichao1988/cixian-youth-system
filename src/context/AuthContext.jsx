/**
 * ============================================================
 * 登录状态
 * ============================================================
 *
 * 整个应用只需要一个“当前登录用户”，
 * 因此放在 Context 里，
 * 页面不需要层层传 props。
 *
 * 权限判断也统一放在这里，
 * 页面只问“我能不能做”，
 * 不需要知道角色是怎么比较的。
 * ============================================================
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  clearToken,
  getToken,
  setToken,
} from '../api/http'

import {
  fetchSession,
  login as loginRequest,
  logout as logoutRequest,
} from '../api/authApi'

const AuthContext =
  createContext(null)

/**
 * 角色权限级别。
 *
 * 与后端保持一致。
 */
const ROLE_LEVEL = {
  town: 1,
  county: 2,
  admin: 3,
}

export function AuthProvider({
  children,
}) {
  const [user, setUser] =
    useState(null)

  const [
    checking,
    setChecking,
  ] = useState(true)

  /**
   * 刷新页面后，
   * 用本地保存的 token 换回用户信息。
   */
  useEffect(() => {
    let alive = true

    async function restore() {
      const token = getToken()

      if (!token) {
        if (alive) {
          setChecking(false)
        }

        return
      }

      try {
        const data =
          await fetchSession()

        if (alive) {
          setUser(data.user)
        }
      } catch {
        clearToken()

        if (alive) {
          setUser(null)
        }
      } finally {
        if (alive) {
          setChecking(false)
        }
      }
    }

    restore()

    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(
    async (
      account,
      password,
    ) => {
      const data =
        await loginRequest(
          account,
          password,
        )

      setToken(data.token)
      setUser(data.user)

      return data.user
    },
    [],
  )

  const logout = useCallback(
    async () => {
      try {
        await logoutRequest()
      } catch {
        /* 退出失败也要清理本地登录态 */
      }

      clearToken()
      setUser(null)
    },
    [],
  )

  /**
   * 是否拥有某个角色及以上权限。
   */
  const hasRole =
    useCallback(
      (role) => {
        if (!user) {
          return false
        }

        const need =
          ROLE_LEVEL[role] || 0

        const has =
          ROLE_LEVEL[user.role] ||
          0

        return has >= need
      },
      [user],
    )

  /**
   * 只有管理员能恢复已删除数据。
   */
  const canRestore =
    user?.role === 'admin'

  /**
   * 乡镇账号只能看本乡镇数据。
   */
  const town =
    user?.role === 'town'
      ? user.town
      : ''

  const value = useMemo(
    () => ({
      user,
      checking,
      login,
      logout,
      hasRole,
      canRestore,
      town,
    }),
    [
      user,
      checking,
      login,
      logout,
      hasRole,
      canRestore,
      town,
    ],
  )

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context =
    useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth 必须在 AuthProvider 内部使用',
    )
  }

  return context
}
