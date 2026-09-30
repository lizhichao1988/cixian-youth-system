/* =========================================================
   显示每条困难青少年信息的数据列表
   ========================================================= */
import {
  Button,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'

import {
  getCategoryGroup,
  getCategoryValue,
} from '../../utils/categoryUtils'

import {
  getRiskFilterStatus,
} from '../../utils/riskUtils'

import {
  normalizePairingStatus,
} from '../../utils/pairingUtils'

const { Text } = Typography


function YouthTable({
  selectedRowKeys,
  setSelectedRowKeys,
  tableData,
  loading,
  currentPage,
  pageSize,
  filteredData,
  setCurrentPage,
  setPageSize,
  openDetail,
  openEdit,
  deleteYouth,
}) {
  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      width: 100,
      fixed: 'left',

      render: (
        value,
        record,
      ) => (
        <Button
          type="link"
          className="name-link"
          onClick={() =>
            openDetail(record)
          }
        >
          {value || '—'}
        </Button>
      ),
    },

    {
      title: '性别',
      dataIndex: 'gender',
      width: 70,
    },

    {
      title: '出生年月',
      dataIndex: 'birthday',
      width: 100,

      render: (value) => {
        if (!value) {
          return (
            <Text type="secondary">
              —
            </Text>
          )
        }

        const birthday = String(value)

        return birthday.length >= 7
          ? birthday.slice(0, 7)
          : birthday
      },
    },

    {
      title: '政治面貌',
      dataIndex: 'political',
      width: 110,
    },

    {
      title: '户籍地址',
      dataIndex: 'household',
      width: 180,
      ellipsis: true,
    },

    {
      title: '常住地址',
      dataIndex: 'residence',
      width: 180,
      ellipsis: true,
    },

    {
      title: '个人基本情况',
      dataIndex: 'basic',
      width: 260,
      ellipsis: true,
    },

    {
      title: '联系方式',
      dataIndex: 'phone',
      width: 130,
    },

    {
      title: '监护人姓名',
      dataIndex: 'guardian',
      width: 110,
    },

    {
      title: '监护人联系方式',
      dataIndex:
        'guardianPhone',
      width: 140,
    },

    {
      title: '困难大类',
      key: 'bigCategory',
      width: 140,

      render: (
        _,
        record,
      ) => {
        const groups =
          getCategoryGroup(
            record.categories,
            record.bigCategory,
          )

        return (
          <Space
            wrap
            size={[4, 4]}
          >
            {groups.length >
            0 ? (
              groups.map(
                (group) => (
                  <Tag
                    key={group}
                  >
                    {group}
                  </Tag>
                ),
              )
            ) : (
              <Text type="secondary">
                暂无
              </Text>
            )}
          </Space>
        )
      },
    },

    {
      title: '困难小类',
      key: 'smallCategory',
      width: 330,

      render: (
        _,
        record,
      ) => {
        const category =
          getCategoryValue(
            record.categories,
          )

        return category ? (
          <Tag>
            {category}
          </Tag>
        ) : (
          <Text type="secondary">
            暂无
          </Text>
        )
      },
    },

    {
      title: '风险排查',
      width: 320,

      render: (
        _,
        record,
      ) => {
        /*
         * =====================================================
         * 风险排查显示规则
         * =====================================================
         *
         * 主列表只显示：
         *
         * “最近一次风险排查”的风险隐患描述。
         *
         * 后端 server.js 已经统一计算：
         *
         * record.latestRiskDescription
         *
         * 因此这里不再调用 getRiskDescriptions()
         * 拼接多次风险排查记录。
         *
         * 这样即使一个青少年有：
         *
         * 排查记录1
         * 排查记录2
         * 排查记录3
         * 排查记录4
         *
         * 主列表也只显示最新的一条。
         */
        const riskStatus =
          getRiskFilterStatus(
            record,
          )

        const latestRisk =
          Array.isArray(record.risks) &&
          record.risks.length > 0
            ? record.risks[0]
            : null

        const description =
          String(latestRisk?.description || '').trim()

        return (
          <Space
            direction="vertical"
            size={2}
            style={{
              width: '100%',
            }}
          >
            {riskStatus ===
              '有风险' && (
              <Tag color="error">
                有风险
              </Tag>
            )}

            {riskStatus ===
              '无风险' && (
              <Tag color="success">
                无风险
              </Tag>
            )}

            {riskStatus ===
              '未排查' && (
              <Tag>
                未排查
              </Tag>
            )}

            {description ? (
              <Text
                ellipsis={{
                  tooltip:
                    description,
                }}
                style={{
                  display: 'block',
                  maxWidth: 290,
                }}
              >
                {description}
              </Text>
            ) : (
              <Text type="secondary">
                {riskStatus ===
                '未排查'
                  ? '暂无风险排查记录'
                  : '无风险隐患描述'}
              </Text>
            )}
          </Space>
        )
      },
    },

    {
      title: '帮扶需求',
      dataIndex: 'helpNeed',
      width: 260,
      ellipsis: true,

      render: (value) =>
        value &&
        value !== '暂无' ? (
          <Text
            ellipsis
            title={value}
          >
            {value}
          </Text>
        ) : (
          <Text type="secondary">
            暂无
          </Text>
        ),
    },

    {
      title: '是否需要结对帮扶',
      dataIndex: 'pairing',
      width: 140,

      render: (value) =>
        normalizePairingStatus(
          value,
        ) === '是' ? (
          <Tag color="processing">
            是
          </Tag>
        ) : (
          <Tag>
            否
          </Tag>
        ),
    },

    {
      title: '帮扶联系人',
      dataIndex:
        'pairingContact',
      width: 130,

      render: (value) =>
        value || (
          <Text type="secondary">
            —
          </Text>
        ),
    },

    {
      title: '联系电话',
      dataIndex:
        'pairingPhone',
      width: 130,

      render: (value) =>
        value || (
          <Text type="secondary">
            —
          </Text>
        ),
    },

    {
      title: '工作单位',
      dataIndex:
        'pairingUnit',
      width: 180,
      ellipsis: true,

      render: (value) =>
        value || (
          <Text type="secondary">
            —
          </Text>
        ),
    },

    {
      title: '帮扶记录',
      dataIndex: 'helpRecords',
      width: 100,

      render: (value) =>
        `${Number(value) || 0}条`,
    },

    {
      title: '备注',
      dataIndex: 'remark',
      width: 150,
      ellipsis: true,
    },

    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',

      render: (
        _,
        record,
      ) => (
        <Space>
          <Button
            type="link"
            onClick={() =>
              openDetail(record)
            }
          >
            查看
          </Button>

          <Button
            type="link"
            onClick={() =>
              openEdit(record)
            }
          >
            编辑
          </Button>

          <Popconfirm
            title="确定删除该人员数据吗？"
            description="删除后可在「系统管理 → 回收站」由管理员恢复。"
            okText="确定删除"
            cancelText="取消"
            okButtonProps={{
              danger: true,
            }}
            onConfirm={() =>
              deleteYouth &&
              deleteYouth(record.key)
            }
          >
            <Button
              type="link"
              danger
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const rowSelection = {
    selectedRowKeys,

    onChange: (keys) => {
      setSelectedRowKeys(keys)
    },
  }

  return (
    <Table
      rowKey="key"
      className="app-table"
      rowSelection={
        rowSelection
      }
      columns={columns}
      dataSource={
        tableData
      }
      loading={
        loading
      }
      locale={{
        emptyText:
          loading
            ? '正在读取数据……'
            : '当前筛选条件下暂无数据',
      }}
      scroll={{
        x: 3600,
      }}
      pagination={{
        current:
          currentPage,

        pageSize,

        total:
          filteredData.length,

        showSizeChanger:
          true,

        showQuickJumper:
          true,

        showTotal:
          (total) =>
            `共 ${total} 条数据`,

        onChange: (
          page,
          size,
        ) => {
          setSelectedRowKeys(
            [],
          )

          if (
            size !==
            pageSize
          ) {
            setPageSize(
              size,
            )

            setCurrentPage(
              1,
            )
          } else {
            setCurrentPage(
              page,
            )
          }
        },
      }}
      onRow={(
        record,
      ) => ({
        onDoubleClick:
          () =>
            openDetail(
              record,
            ),
      })}
    />
  )
}

export { YouthTable }