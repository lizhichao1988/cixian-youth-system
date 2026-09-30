/**
 * =========================================================
 * 系统登录页
 * =========================================================
 *
 * 设计目标：
 *
 *     简洁、稳重、与系统主色（#1677ff）一致
 *     不依赖任何图片资源，纯 CSS 渲染
 * =========================================================
 */

import { useState } from 'react'

import {
  Alert,
  Button,
  Form,
  Input,
  Spin,
} from 'antd'

import {
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'

import {
  useAuth,
} from '../context/AuthContext'

/**
 * 演示账号提示。
 *
 * 真实使用时可删掉这一段。
 */
const DEMO_ACCOUNTS = [
  {
    label: '系统管理员',
    account: 'admin',
    password: 'admin123',
  },
  {
    label: '县级管理员',
    account: 'county1',
    password: 'county123',
  },
  {
    label: '乡镇管理员',
    account: 'guantai',
    password: 'town123',
  },
]

export function LoginPage() {
  const { login } = useAuth()

  const [account, setAccount] =
    useState('')

  const [
    password,
    setPassword,
  ] = useState('')

  const [error, setError] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  async function handleSubmit() {
    if (
      !account.trim() ||
      !password.trim()
    ) {
      setError('请输入账号和密码')
      return
    }

    setLoading(true)
    setError('')

    try {
      await login(
        account.trim(),
        password,
      )
    } catch (loginError) {
      setError(
        loginError?.message ||
          '登录失败',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight:
          '100vh',
        display:
          'flex',
        alignItems:
          'center',
        justifyContent:
          'center',
        background:
          'linear-gradient(135deg, #eef4ff 0%, #f7f9fc 45%, #eafaf3 100%)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          display: 'flex',
          background:
            '#ffffff',
          borderRadius: 16,
          overflow:
            'hidden',
          boxShadow:
            '0 18px 50px rgba(15, 45, 90, 0.12)',
        }}
      >
        {/*
         * 左侧品牌区
         */}
        <div
          style={{
            flex: 1,
            padding:
              '56px 44px',
            background:
              'linear-gradient(160deg, #1677ff 0%, #2f6fd0 60%, #1f4fa8 100%)',
            color:
              '#ffffff',
            display:
              'flex',
            flexDirection:
              'column',
            justifyContent:
              'center',
          }}
        >
          <div
            style={{
              display:
                'flex',
              alignItems:
                'center',
              gap: 14,
              marginBottom:
                28,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background:
                  'rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              磁
            </div>

            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                磁县困难青少年精准帮扶管理系统
              </div>

              <div
                style={{
                  fontSize: 14,
                  opacity: 0.85,
                  marginTop: 4,
                }}
              >
                
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 15,
              lineHeight: 2,
              opacity: 0.92,
            }}
          >
            · 一人一档，精准到人
            <br />
            · 风险排查，动态跟踪
            <br />
            · 帮扶记录，全程留痕
            <br />
            · 分级授权，数据安全
          </div>

          <div
            style={{
              marginTop: 32,
              fontSize: 13,
              opacity: 0.75,
            }}
          >
            请使用分配的账号登录
          </div>
        </div>

        {/*
         * 右侧登录表单
         */}
        <div
          style={{
            width: 400,
            padding:
              '48px 40px',
            display:
              'flex',
            flexDirection:
              'column',
            justifyContent:
              'center',
          }}
        >
          <h2
            style={{
              margin: 0,
              marginBottom: 6,
              fontSize: 22,
              color:
                '#1f2d3d',
            }}
          >
            账号登录
          </h2>

          <p
            style={{
              margin: 0,
              marginBottom: 26,
              color:
                '#8a94a6',
              fontSize: 13,
            }}
          >
            县级 / 乡镇 / 管理员分级授权
          </p>

          <Form
            layout="vertical"
            size="large"
            onFinish={
              handleSubmit
            }
          >
            <Form.Item
              label="账号"
            >
              <Input
                value={
                  account
                }
                onChange={(
                  event,
                ) =>
                  setAccount(
                    event
                      .target
                      .value,
                  )
                }
                prefix={
                  <UserOutlined
                    style={{
                      color:
                        '#b6bfcc',
                    }}
                  />
                }
                placeholder="请输入账号"
                allowClear
              />
            </Form.Item>

            <Form.Item
              label="密码"
            >
              <Input.Password
                value={
                  password
                }
                onChange={(
                  event,
                ) =>
                  setPassword(
                    event
                      .target
                      .value,
                  )
                }
                prefix={
                  <LockOutlined
                    style={{
                      color:
                        '#b6bfcc',
                    }}
                  />
                }
                placeholder="请输入密码"
                onPressEnter={
                  handleSubmit
                }
              />
            </Form.Item>

            {error ? (
              <Alert
                type="error"
                showIcon
                message={
                  error
                }
                style={{
                  marginBottom:
                    16,
                }}
              />
            ) : null}

            <Button
              type="primary"
              htmlType="submit"
              block
              loading={
                loading
              }
              style={{
                height: 44,
                fontSize: 15,
                marginTop: 4,
              }}
            >
              登录
            </Button>
          </Form>

          <div
            style={{
              marginTop: 26,
              padding: 14,
              borderRadius: 10,
              background:
                '#f6f8fb',
              fontSize: 12,
              color:
                '#6b7688',
              lineHeight: 1.9,
            }}
          >
            <div
              style={{
                display:
                  'flex',
                alignItems:
                  'center',
                gap: 6,
                marginBottom: 6,
                color:
                  '#1677ff',
                fontWeight: 600,
              }}
            >
              <SafetyCertificateOutlined />
              测试账号
            </div>

            {DEMO_ACCOUNTS.map(
              (item) => (
                <div
                  key={
                    item.account
                  }
                >
                  {item.label}：
                  <span
                    style={{
                      color:
                        '#1f2d3d',
                    }}
                  >
                    {item.account}
                  </span>
                  {' / '}
                  <span
                    style={{
                      color:
                        '#1f2d3d',
                    }}
                  >
                    {
                      item.password
                    }
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            pointerEvents:
              'none',
          }}
        >
          <Spin size="large" />
        </div>
      ) : null}
    </div>
  )
}
