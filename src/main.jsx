import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import {
  ConfigProvider,
} from 'antd'

import zhCN from 'antd/locale/zh_CN'

import './index.css'
import App from './App.jsx'

import {
  AuthProvider,
} from './context/AuthContext'

/**
 * ============================================================
 * 全局中文
 * ============================================================
 *
 * ConfigProvider locale=zhCN 之后，
 * antd 内置的分页、日期选择、空状态等
 * 全部变成中文。
 *
 * 登录状态放在 AuthProvider 里，
 * 所有页面都能直接取到当前用户。
 * ============================================================
 */
createRoot(
  document.getElementById('root'),
).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary:
            '#1677ff',
          borderRadius: 8,
        },
      }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </ConfigProvider>
  </StrictMode>,
)
