/**
 * ============================================================
 * 强制修改密码
 * ============================================================
 *
 * 场景：
 *
 *     账号使用的是弱口令（例如 admin123 / county123 /
 *     town123 这类），登录后系统不允许继续使用，
 *     必须先改一个强密码。
 *
 * 为什么必须做成「不可关闭」：
 *
 *     如果只是弹个提示，用户点一下关掉，
 *     照样能操作业务数据，
 *     那弱口令的风险一点没消除。
 *
 *     所以这里配合后端一起收口：
 *
 *         后端：弱口令会话除改密接口外全部返回 423
 *         前端：弹窗不能点遮罩关闭、不能按 ESC 关闭、
 *               不显示右上角叉号
 *
 *     两头都堵住，才是真正的强制。
 *
 * ============================================================
 */

import { useState } from 'react'

import {
  Alert,
  Form,
  Input,
  Modal,
  message,
} from 'antd'

import {
  LockOutlined,
} from '@ant-design/icons'

import {
  useAuth,
} from '../context/AuthContext'

export function ForceChangePasswordModal() {
  const {
    mustChangePassword,
    changePassword,
    logout,
  } = useAuth()

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [form] = Form.useForm()

  async function handleSubmit() {
    let values

    try {
      values =
        await form.validateFields()
    } catch {
      return
    }

    if (
      values.newPassword !==
      values.confirmPassword
    ) {
      form.setFields([
        {
          name: 'confirmPassword',
          errors: [
            '两次输入的新密码不一致',
          ],
        },
      ])

      return
    }

    setSubmitting(true)

    try {
      await changePassword(
        values.oldPassword,
        values.newPassword,
      )

      message.success(
        '密码修改成功，请牢记新密码',
      )

      form.resetFields()
    } catch (error) {
      message.error(
        error?.message ||
          '修改密码失败，请稍后重试',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={mustChangePassword}
      title={
        <span>
          <LockOutlined />{' '}
          请先修改密码
        </span>
      }
      /**
       * 不可绕过：
       *     不显示关闭按钮
       *     点遮罩不关闭
       *     按 ESC 不关闭
       *     没有取消按钮
       */
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      width={420}
      centered
    >
      <Alert
        type="warning"
        showIcon
        style={{
          marginBottom: 16,
        }}
        message="当前密码不符合安全要求"
        description={
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <div>
              为了保护困难青少年信息，
              请立即修改为强密码：
            </div>
            <div>
              · 至少 8 位
            </div>
            <div>
              · 同时包含字母和数字
            </div>
            <div>
              · 不能与账号相同
            </div>
            <div>
              · 不要使用 12345678
              这类简单组合
            </div>
            <div
              style={{
                marginTop: 6,
                color:
                  '#d4380d',
                fontWeight:
                  600,
              }}
            >
              在修改密码之前，
              系统不会返回任何业务数据，
              页面显示为空是正常现象。
            </div>
          </div>
        }
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={
          handleSubmit
        }
      >
        <Form.Item
          name="oldPassword"
          label="当前密码"
          rules={[
            {
              required: true,
              message:
                '请输入当前密码',
            },
          ]}
        >
          <Input.Password
            placeholder="请输入当前密码"
            autoComplete="current-password"
          />
        </Form.Item>

        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            {
              required: true,
              message:
                '请输入新密码',
            },
            {
              min: 8,
              message:
                '密码至少 8 位',
            },
            {
              pattern:
                /[A-Za-z]/,
              message:
                '必须包含字母',
            },
            {
              pattern: /\d/,
              message:
                '必须包含数字',
            },
            {
              validator:
                (_, val) => {
                  if (!val) {
                    return Promise.resolve()
                  }

                  /**
                   * 与后端保持一致：
                   * 禁止 admin123 这类
                   *「单词 + 简单数字」。
                   */
                  if (
                    /^[A-Za-z]+\d{1,4}$/.test(
                      val,
                    )
                  ) {
                    return Promise.reject(
                      new Error(
                        '不能是「英文单词 + 简单数字」，如 admin123',
                      ),
                    )
                  }

                  if (
                    /^(?:password|admin|qwerty|123456|111111|000000)/i.test(
                      val,
                    )
                  ) {
                    return Promise.reject(
                      new Error(
                        '包含常见弱口令，请换一个',
                      ),
                    )
                  }

                  return Promise.resolve()
                },
            },
          ]}
        >
          <Input.Password
            placeholder="至少 8 位，含字母和数字"
            autoComplete="new-password"
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          dependencies={[
            'newPassword',
          ]}
          rules={[
            {
              required: true,
              message:
                '请再次输入新密码',
            },
          ]}
        >
          <Input.Password
            placeholder="请再次输入新密码"
            autoComplete="new-password"
          />
        </Form.Item>

        <button
          type="submit"
          style={{
            display: 'none',
          }}
        />
      </Form>

      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          gap: 12,
          marginTop: 8,
        }}
      >
        <a
          onClick={logout}
          style={{
            fontSize: 13,
          }}
        >
          退出登录
        </a>

        <button
          type="button"
          onClick={
            handleSubmit
          }
          disabled={
            submitting
          }
          style={{
            flex: 1,
            height: 36,
            border: 'none',
            borderRadius: 6,
            background:
              submitting
                ? '#d9d9d9'
                : '#1677ff',
            color: '#fff',
            fontSize: 14,
            cursor: submitting
              ? 'not-allowed'
              : 'pointer',
          }}
        >
          {submitting
            ? '提交中…'
            : '确认修改'}
        </button>
      </div>
    </Modal>
  )
}
