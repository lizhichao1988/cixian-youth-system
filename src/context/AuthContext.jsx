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
  changePassword as changePasswordRequest,
} from '../api/authApi'

import {
  clearYouthCache,
} from '../store/youthCache'

/**
 * 清掉“跟着人走”的界面记忆。
 *
 * 这些值存在 sessionStorage 里，本来是为了
 * 刷新页面不跳页、帮扶页记住上次看的人。
 *
 * 但它们不属于任何一个账号：
 * 换个乡镇账号登录后，帮扶页会照着
 * 上一个账号选中的人去取数，
 * 那人是别的乡镇的，后端直接 403，
 * 屏幕上就糊一片“只能查看本乡镇数据”。
 *
 * 所以换账号时一并清掉。
 */
function clearSessionUiState() {
  try {
    window.sessionStorage.removeItem(
      'cixian_help_selected',
    )

    window.sessionStorage.removeItem(
      'cixian_active_page',
    )
  } catch {
    /* 隐私模式下失败不影响主流程 */
  }
}

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
   * 是否处于「弱口令、必须先改密」状态。
   *
   * 后端在登录 / 查会话时返回。
   *
   * 为 true 时：
   *     后端除改密接口外全部返回 423，
   *     前端弹出不可关闭的改密窗口。
   */
  const [
    mustChangePassword,
    setMustChangePassword,
  ] = useState(false)

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

          setMustChangePassword(
            Boolean(
              data.mustChangePassword,
            ),
          )
        }
      } catch {
        clearToken()

        if (alive) {
          setUser(null)
          setMustChangePassword(
            false,
          )
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

      /**
       * 换人登录时先清掉内存里的青少年缓存。
       *
       * 不清的话，
       * 上一个人看过的全县数据会留到下一个账号的页面上。
       */
      clearYouthCache()
      clearSessionUiState()

      setToken(data.token)
      setUser(data.user)

      setMustChangePassword(
        Boolean(
          data.mustChangePassword,
        ),
      )

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

      /**
       * 退出登录必须清掉青少年缓存，
       * 否则下一个人登录时能看到上一个人的数据。
       */
      clearYouthCache()
      clearSessionUiState()

      setUser(null)
      setMustChangePassword(false)
    },
    [],
  )

  /**
   * 改密成功后的收尾：
   *
   *     解除前端锁定标记，
   *     用户不用重新登录就能继续用。
   */
  const finishPasswordChange =
    useCallback(() => {
      setMustChangePassword(
        false,
      )

      setUser((current) =>
        current
          ? {
              ...current,
              mustChangePassword:
                false,
            }
          : current,
      )
    }, [])

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

  const changePassword =
    useCallback(
      async (
        oldPassword,
        newPassword,
      ) => {
        const data =
          await changePasswordRequest(
            oldPassword,
            newPassword,
          )

        finishPasswordChange()

        return data
      },
      [finishPasswordChange],
    )

  const value = useMemo(
    () => ({
      user,
      checking,
      login,
      logout,
      hasRole,
      canRestore,
      town,
      mustChangePassword,
      changePassword,
    }),
    [
      user,
      checking,
      login,
      logout,
      hasRole,
      canRestore,
      town,
      mustChangePassword,
      changePassword,
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
