/* =========================================================
   左侧菜单栏页面布局
   ========================================================= */
import { Layout } from 'antd'

import {
  AppMenu,
} from './AppMenu'

const { Sider } = Layout

function Sidebar({
  activePage,
  onPageChange,
  onClearSelection,
}) {
  return (
    <Sider
      width={240}
      className="sidebar"
    >
      <div className="system-logo">
        <div className="logo-mark">
          磁
        </div>

        <div>
          <div className="logo-title">
            困难青少年
          </div>

          <div className="logo-subtitle">
            精准帮扶管理系统
          </div>
        </div>
      </div>

      <AppMenu
        activePage={activePage}
        onPageChange={onPageChange}
        onClearSelection={onClearSelection}
      />

      <div className="sidebar-bottom">
        <div>磁县</div>

        <div>
          精准帮扶工作平台
        </div>
      </div>
    </Sider>
  )
}

export { Sidebar }
