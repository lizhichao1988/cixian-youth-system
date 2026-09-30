/**
 * =========================================================
 * 系统管理
 * =========================================================
 *
 * 三个模块：
 *
 *     1. 账号管理    管理员可增删改账号
 *     2. 回收站      已删除数据，仅管理员可恢复
 *     3. 操作日志    登录、删除、恢复等留痕
 *
 * 权限规则：
 *
 *     管理员  全部功能
 *     县级    只能查看回收站和日志，不能恢复
 *     乡镇    只能查看日志
 * =========================================================
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd'

import {
  useAuth,
} from '../../context/AuthContext'

import {
  createAccount,
  deleteAccount,
  deleteRecycleItem,
  fetchAccounts,
  fetchOperationLogs,
  fetchRecycleBin,
  restoreRecycleItem,
  updateAccount,
} from '../../api/authApi'

const ROLE_OPTIONS = [
  {
    label: '系统管理员',
    value: 'admin',
  },
  {
    label: '县级管理员',
    value: 'county',
  },
  {
    label: '乡镇管理员',
    value: 'town',
  },
]

const ROLE_COLOR = {
  admin: 'red',
  county: 'blue',
  town: 'green',
}

/**
 * 乡镇选项。
 *
 * 与登录数据里的乡镇账号保持一致。
 */
const TOWN_OPTIONS = [
  '磁州镇',
  '讲武城镇',
  '路村营镇',
  '时村营镇',
  '白土镇',
  '岳城镇',
  '陶泉乡',
  '北贾璧乡',
  '黄沙镇',
  '观台镇',
  '都党乡',
  '社区',
].map((item) => ({
  label: item,
  value: item,
}))

export function SystemManagePage({
  messageApi,
}) {
  const {
    user,
    canRestore,
    hasRole,
  } = useAuth()

  const notify =
    messageApi || message

  /**
   * 当前登录用户不是管理员时，
   * 账号管理不允许进入。
   */
  const isAdmin =
    hasRole('admin')

  /* ==================================================
     账号管理
     ================================================== */
  const [
    accounts,
    setAccounts,
  ] = useState([])

  const [
    accountLoading,
    setAccountLoading,
  ] = useState(false)

  const [
    accountModalOpen,
    setAccountModalOpen,
  ] = useState(false)

  const [
    editingAccount,
    setEditingAccount,
  ] = useState(null)

  const [form] =
    Form.useForm()

  const loadAccounts =
    useCallback(async () => {
      if (!isAdmin) {
        return
      }

      setAccountLoading(true)

      try {
        const data =
          await fetchAccounts()

        setAccounts(
          data.records || [],
        )
      } catch (error) {
        notify.error(
          error?.message ||
            '账号读取失败',
        )
      } finally {
        setAccountLoading(
          false,
        )
      }
    }, [
      isAdmin,
      notify,
    ])

  /* ==================================================
     回收站
     ================================================== */
  const [
    recycle,
    setRecycle,
  ] = useState([])

  const [
    recycleLoading,
    setRecycleLoading,
  ] = useState(false)

  const loadRecycle =
    useCallback(
      async () => {
        setRecycleLoading(
          true,
        )

        try {
          const data =
            await fetchRecycleBin()

          setRecycle(
            data.records || [],
          )
        } catch (error) {
          notify.error(
            error?.message ||
              '回收站读取失败',
          )
        } finally {
          setRecycleLoading(
            false,
          )
        }
      },
      [notify],
    )

  /* ==================================================
     操作日志
     ================================================== */
  const [logs, setLogs] =
    useState([])

  const [
    logLoading,
    setLogLoading,
  ] = useState(false)

  const loadLogs =
    useCallback(
      async () => {
        setLogLoading(
          true,
        )

        try {
          const data =
            await fetchOperationLogs()

          setLogs(
            data.records || [],
          )
        } catch (error) {
          notify.error(
            error?.message ||
              '日志读取失败',
          )
        } finally {
          setLogLoading(
            false,
          )
        }
      },
      [notify],
    )

  useEffect(() => {
    loadAccounts()
    loadRecycle()
    loadLogs()
  }, [
    loadAccounts,
    loadRecycle,
    loadLogs,
  ])

  /* ==================================================
     账号：新增 / 编辑
     ================================================== */
  function openCreateAccount() {
    setEditingAccount(null)

    form.setFieldsValue({
      account: '',
      name: '',
      password: '',
      role: 'town',
      town: undefined,
      status: '启用',
    })

    setAccountModalOpen(true)
  }

  function openEditAccount(
    record,
  ) {
    setEditingAccount(record)

    form.setFieldsValue({
      account:
        record.account,
      name: record.name,
      password:
        record.password,
      role: record.role,
      town:
        record.town || undefined,
      status:
        record.status ||
        '启用',
    })

    setAccountModalOpen(true)
  }

  async function handleSubmitAccount() {
    const values =
      await form.validateFields()

    try {
      if (
        editingAccount
      ) {
        await updateAccount(
          editingAccount.id,
          values,
        )

        notify.success(
          '账号修改成功',
        )
      } else {
        await createAccount(
          values,
        )

        notify.success(
          '账号新增成功',
        )
      }

      setAccountModalOpen(
        false,
      )

      loadAccounts()
    } catch (error) {
      notify.error(
        error?.message ||
          '保存失败',
      )
    }
  }

  async function handleDeleteAccount(
    record,
  ) {
    try {
      await deleteAccount(
        record.id,
      )

      notify.success(
        '账号删除成功',
      )

      loadAccounts()
    } catch (error) {
      notify.error(
        error?.message ||
          '删除失败',
      )
    }
  }

  /* ==================================================
     回收站：恢复 / 彻底删除
     ================================================== */
  async function handleRestore(
    record,
  ) {
    try {
      await restoreRecycleItem(
        record.id,
      )

      notify.success(
        '数据已恢复',
      )

      loadRecycle()
    } catch (error) {
      notify.error(
        error?.message ||
          '恢复失败',
      )
    }
  }

  async function handleDeleteForever(
    record,
  ) {
    try {
      await deleteRecycleItem(
        record.id,
      )

      notify.success(
        '已彻底删除',
      )

      loadRecycle()
    } catch (error) {
      notify.error(
        error?.message ||
          '删除失败',
      )
    }
  }

  /* ==================================================
     表格列
     ================================================== */
  const accountColumns =
    [
      {
        title: '账号',
        dataIndex:
          'account',
        width: 120,
      },
      {
        title: '姓名',
        dataIndex: 'name',
        width: 140,
      },
      {
        title: '角色',
        dataIndex: 'role',
        width: 120,
        render:
          (
            role,
            record,
          ) => (
            <Tag
              color={
                ROLE_COLOR[
                  role
                ] ||
                'blue'
              }
            >
              {
                record.roleLabel ||
                  role
              }
            </Tag>
          ),
      },
      {
        title: '乡镇',
        dataIndex:
          'town',
        width: 120,
      },
      {
        title: '状态',
        dataIndex:
          'status',
        width: 90,
      },
      {
        title:
          '操作',
        width: 140,
        render:
          (
            _,
            record,
          ) => (
            <Space>
              <Button
                type="link"
                size="small"
                onClick={() =>
                  openEditAccount(
                    record,
                  )
                }
              >
                编辑
              </Button>

              <Popconfirm
                title="删除账号"
                description={`确定删除账号「${record.account}」吗？`}
                okText="确定删除"
                cancelText="取消"
                okButtonProps={{
                  danger:
                    true,
                }}
                onConfirm={() =>
                  handleDeleteAccount(
                    record,
                  )
                }
              >
                <Button
                  type="link"
                  size="small"
                  danger
                >
                  删除
                </Button>
              </Popconfirm>
            </Space>
          ),
      },
    ]

  const recycleColumns =
    [
      {
        title:
          '数据类型',
        dataIndex:
          'kindLabel',
        width: 130,
      },
      {
        title:
          '记录ID',
        dataIndex:
          'recordId',
        width: 90,
      },
      {
        title:
          '所属青少年',
        dataIndex:
          'youthName',
        width: 120,
      },
      {
        title:
          '删除人',
        dataIndex:
          'deletedByName',
        width: 120,
      },
      {
        title:
          '删除时间',
        dataIndex:
          'deletedAt',
        render:
          (value) =>
            value
              ? String(
                  value,
                ).slice(
                  0,
                  19,
                )
              : '',
      },
      {
        title:
          '操作',
        width: 160,
        render:
          (
            _,
            record,
          ) => (
            <Space>
              <Popconfirm
                title="恢复数据"
                description="确定恢复这条已删除的数据吗？"
                okText="确定恢复"
                cancelText="取消"
                disabled={
                  !canRestore
                }
                onConfirm={() =>
                  handleRestore(
                    record,
                  )
                }
              >
                <Button
                  type="link"
                  size="small"
                  disabled={
                    !canRestore
                  }
                >
                  恢复
                </Button>
              </Popconfirm>

              <Popconfirm
                title="彻底删除"
                description="彻底删除后将无法恢复，确定吗？"
                okText="确定删除"
                cancelText="取消"
                okButtonProps={{
                  danger:
                    true,
                }}
                disabled={
                  !canRestore
                }
                onConfirm={() =>
                  handleDeleteForever(
                    record,
                  )
                }
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled={
                    !canRestore
                  }
                >
                  彻底删除
                </Button>
              </Popconfirm>
            </Space>
          ),
      },
    ]

  const logColumns = [
    {
      title: '时间',
      dataIndex:
        'time',
      width: 180,
      render:
        (value) =>
          value
            ? String(
                value,
              ).slice(
                0,
                19,
              )
            : '',
    },
    {
      title: '账号',
      dataIndex:
        'user',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex:
        'name',
      width: 140,
    },
    {
      title:
        '操作',
      dataIndex:
        'action',
      width: 110,
    },
    {
      title:
        '对象',
      dataIndex:
        'target',
    },
  ]

  /**
   * 分页统一中文。
   */
  const paginationConfig =
    {
      size: 'small',
      showSizeChanger:
        true,
      pageSizeOptions: [
        10,
        20,
        50,
      ],
      showTotal:
        (total) =>
          `共 ${total} 条`,
    }

  const items = [
    {
      key: 'accounts',
      label: '账号管理',
      children: isAdmin ? (
        <Card
          size="small"
          title={`账号列表（${accounts.length} 个）`}
          extra={
            <Button
              type="primary"
              onClick={
                openCreateAccount
              }
            >
              新增账号
            </Button>
          }
        >
          <Table
            rowKey="id"
            size="small"
            loading={
              accountLoading
            }
            columns={
              accountColumns
            }
            dataSource={
              accounts
            }
            pagination={
              paginationConfig
            }
          />
        </Card>
      ) : (
        <Empty description="只有系统管理员可以管理账号" />
      ),
    },
    {
      key: 'recycle',
      label: '回收站',
      children: (
        <Card
          size="small"
          title={`已删除数据（${recycle.length} 条）`}
        >
          {!canRestore ? (
            <div
              style={{
                marginBottom: 12,
                color:
                  '#fa8c16',
                fontSize: 13,
              }}
            >
              当前账号为「
              {
                user?.roleLabel
              }
              」，只能查看，
              恢复已删除数据需要系统管理员权限
            </div>
          ) : null}

          <Table
            rowKey="id"
            size="small"
            loading={
              recycleLoading
            }
            columns={
              recycleColumns
            }
            dataSource={
              recycle
            }
            pagination={
              paginationConfig
            }
          />
        </Card>
      ),
    },
    {
      key: 'logs',
      label: '操作日志',
      children: (
        <Card
          size="small"
          title={`操作记录（${logs.length} 条）`}
        >
          <Table
            rowKey="time"
            size="small"
            loading={
              logLoading
            }
            columns={
              logColumns
            }
            dataSource={
              logs
            }
            pagination={
              paginationConfig
            }
          />
        </Card>
      ),
    },
  ]

  return (
    <div
      style={{
        padding: 20,
        height:
          '100%',
        overflowY:
          'auto',
      }}
    >
      <Tabs
        items={items}
        defaultActiveKey="accounts"
      />

      <Modal
        title={
          editingAccount
            ? '编辑账号'
            : '新增账号'
        }
        open={
          accountModalOpen
        }
        onCancel={() =>
          setAccountModalOpen(
            false,
          )
        }
        onOk={
          handleSubmitAccount
        }
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            label="账号"
            name="account"
            rules={[
              {
                required:
                  true,
                message:
                  '请输入账号',
              },
            ]}
          >
            <Input
              disabled={!!editingAccount}
              placeholder="登录账号"
            />
          </Form.Item>

          <Form.Item
            label="姓名"
            name="name"
          >
            <Input placeholder="显示名称" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              {
                required:
                  true,
                message:
                  '请输入密码',
              },
            ]}
          >
            <Input placeholder="登录密码" />
          </Form.Item>

          <Form.Item
            label="角色"
            name="role"
          >
            <Select
              options={
                ROLE_OPTIONS
              }
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate
          >
            {() =>
              form.getFieldValue(
                'role',
              ) === 'town' ? (
                <Form.Item
                  label="所属乡镇"
                  name="town"
                  rules={[
                    {
                      required:
                        true,
                      message:
                        '请选择乡镇',
                    },
                  ]}
                >
                  <Select
                    options={
                      TOWN_OPTIONS
                    }
                    placeholder="请选择乡镇"
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item
            label="状态"
            name="status"
          >
            <Select
              options={[
                {
                  label:
                    '启用',
                  value:
                    '启用',
                },
                {
                  label:
                    '停用',
                  value:
                    '停用',
                },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
