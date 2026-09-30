/* =========================================================
   左侧菜单（侧边栏与移动端抽屉共用）
   =========================================================
   把菜单抽成独立组件，
   桌面端放在 Sider 里，
   移动端放在 Drawer 里，
   逻辑只写一份，避免重复。
   ========================================================= */
import { Menu } from 'antd'

import {
  useAuth,
} from '../../context/AuthContext'

function AppMenu({
  activePage,
  onPageChange,
  onClearSelection,
}) {
  const { user } = useAuth()

  const isAdmin =
    user?.role === 'admin'

  const menuItems = [
    {
      key: 'dashboard',
      label: '首页工作台',
    },
    {
      key: 'youth',
      label: '青少年信息',
    },
    {
      key: 'help',
      label: '需帮扶人员信息',
    },
    {
      key: 'risk',
      label: '风险排查',
    },
    {
      key: 'helpManage',
      label: '帮扶管理',
    },
    {
      key: 'statistics',
      label: '数据统计',
    },
    ...(isAdmin
      ? [
          {
            key: 'system',
            label: '系统管理',
          },
        ]
      : []),
  ]

  function handleMenuClick({ key }) {
    onPageChange(key)

    if (onClearSelection) {
      onClearSelection()
    }
  }

  return (
    <Menu
      mode="inline"
      selectedKeys={[activePage]}
      onClick={handleMenuClick}
      items={menuItems}
      style={{
        borderInlineEnd: 'none',
      }}
    />
  )
}

export { AppMenu }
