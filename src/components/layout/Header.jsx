/* =========================================================
   右侧数据显示页面头部栏区域布局
   ========================================================= */
import {
  Button,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd'

import {
  LogoutOutlined,
  MenuFoldOutlined,
  UserOutlined,
} from '@ant-design/icons'

import {
  useAuth,
} from '../../context/AuthContext'

const { Text } = Typography

/**
 * 角色标签颜色。
 */
const ROLE_COLOR = {
  admin: 'red',
  county: 'blue',
  town: 'green',
}

function Header({ onMenuClick }) {
  const { user, logout } =
    useAuth()

  return (
    <header className="top-header">
      <Space size={12}>
        {onMenuClick ? (
          <Button
            type="text"
            className="mobile-menu-btn"
            icon={
              <MenuFoldOutlined />
            }
            onClick={onMenuClick}
          />
        ) : null}

        <Text className="breadcrumb-text">
          磁县困难青少年精准帮扶管理系统
        </Text>
      </Space>

      <Space size={12}>
        {user ? (
          <>
            <UserOutlined />

            <Text>
              {user.name}
            </Text>

            <Tag
              color={
                ROLE_COLOR[
                  user.role
                ] || 'blue'
              }
            >
              {user.roleLabel}
            </Tag>

            {user.role ===
            'town' ? (
              <Text type="secondary">
                {user.town}
              </Text>
            ) : null}

            <Popconfirm
              title="退出登录"
              description="确定要退出当前账号吗？"
              okText="退出"
              cancelText="取消"
              onConfirm={
                logout
              }
            >
              <Button
                type="text"
                danger
                icon={
                  <LogoutOutlined />
                }
              >
                退出
              </Button>
            </Popconfirm>
          </>
        ) : null}
      </Space>
    </header>
  )
}

export { Header }
