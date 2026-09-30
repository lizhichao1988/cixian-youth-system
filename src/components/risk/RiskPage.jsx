import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Button,
  Card,
  Empty,
  Input,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'

import {
  createRiskRecord,
  deleteRiskRecord,
  updateRiskRecord,
} from '../../api/youthApi'

import {
  getRiskFilterStatus,
  normalizeRiskRecord,
  sortRisksLatestFirst,
} from '../../utils/riskUtils'

import {
  RiskRecordForm,
} from './RiskRecordForm'

const { Text } = Typography

/*
 * ============================================================
 * 风险排查页面
 * ============================================================
 *
 * 本页面不自己保存一份风险排查数据。
 *
 * 唯一数据来源：
 *
 *     App.jsx
 *        ↓
 *     allYouthData
 *        ↓
 *     RiskPage
 *
 * 新增风险记录时：
 *
 *     RiskRecordForm
 *          ↓
 *     createRiskRecord()
 *          ↓
 *     Express
 *          ↓
 *     NocoDB
 *          ↓
 *     返回刚刚创建成功的完整风险记录
 *          ↓
 *     onUpdateYouthRisks()
 *          ↓
 *     useYouthData
 *          ↓
 *     allYouthData
 *          ↓
 *     RiskPage 自动重新渲染
 *
 * 注意：
 *
 * 成功以后不重新 GET 青少年数据。
 *
 * 因为服务器已经把刚刚保存成功的最终记录返回来了。
 *
 * ============================================================
 */


/*
 * ============================================================
 * 规范化风险排查页面中的青少年数据
 * ============================================================
 */
function normalizeRiskPageYouth(record) {
  if (!record) {
    return null
  }

  const youthId =
    record.key ||
    record.id ||
    record.Id ||
    ''

  return {
    ...record,

    key: String(youthId),

    id: String(youthId),

    risks:
      Array.isArray(record.risks)
        ? record.risks
        : [],
  }
}


/*
 * ============================================================
 * RiskPage
 * ============================================================
 */
export function RiskPage({
  /*
   * App.jsx 统一维护的全部青少年数据。
   */
  allYouthData = [],

  /*
   * App.jsx 的全局提示实例。
   *
   * 有就优先用它，
   * 没有就退回 antd 静态 message。
   */
  messageApi = null,

  /*
   * 系统统一的数据加载状态。
   */
  loading: externalLoading = false,

  /*
   * 从某名青少年中移除一条风险排查记录。
   *
   * 删除成功后用它同步 allYouthData，
   * 避免重新请求 1181 条数据。
   */
  onRemoveYouthRisk,

  /*
   * 兼容旧代码保留。
   *
   * 本版本新增/修改风险记录以后不使用重新读取。
   */
  onRefreshYouthData,

  /*
   * 统一更新某一名青少年风险记录的函数。
   *
   * 来源：
   *
   * App.jsx
   *   ↓
   * useYouthData.updateYouthRisks
   */
  onUpdateYouthRisks,
}) {
  /*
   * ==========================================================
   * 当前左侧页码
   * ==========================================================
   */
  const [currentPage, setCurrentPage] =
    useState(1)


  /*
   * ==========================================================
   * 每页显示数量
   * ==========================================================
   */
  const [pageSize, setPageSize] =
    useState(20)


  /*
   * ==========================================================
   * 搜索文字
   * ==========================================================
   */
  const [searchText, setSearchText] =
    useState('')


  /*
   * ==========================================================
   * 风险状态筛选
   * ==========================================================
   */
  const [riskFilter, setRiskFilter] =
    useState('全部')


  /*
   * ==========================================================
   * 当前选中的青少年
   * ==========================================================
   */
  const [selectedYouthKey, setSelectedYouthKey] =
    useState('')


  /*
   * ==========================================================
   * 是否打开新增风险排查抽屉
   * ==========================================================
   */
  const [addingRisk, setAddingRisk] =
    useState(false)


  /*
   * ==========================================================
   * 正在编辑的风险排查记录
   * ==========================================================
   *
   * 为空表示当前是“新增”。
   *
   * 不为空表示当前是“编辑”。
   * ==========================================================
   */
  const [editingRisk, setEditingRisk] =
    useState(null)


  /*
   * ==========================================================
   * 是否正在保存风险排查
   * ==========================================================
   */
  const [savingRisk, setSavingRisk] =
    useState(false)


  /*
   * ==========================================================
   * 正在删除的风险记录 ID
   * ==========================================================
   */
  const [deletingRiskId, setDeletingRiskId] =
    useState('')


  /*
   * ==========================================================
   * 规范化全部青少年数据
   * ==========================================================
   *
   * 注意：
   *
   * 这里没有复制一套新的风险数据。
   *
   * risks 仍然来自 allYouthData。
   *
   * 所以只要 allYouthData 改变，
   * 这里就会自动重新计算。
   *
   * ==========================================================
   */
  const normalizedAllYouthData =
    useMemo(() => {
      return allYouthData
        .map(
          normalizeRiskPageYouth
        )
        .filter(Boolean)
    }, [allYouthData])


  /*
   * ==========================================================
   * 全量筛选
   * ==========================================================
   */
  const filteredYouthData =
    useMemo(() => {
      const keyword =
        searchText
          .trim()
          .toLowerCase()

      return normalizedAllYouthData.filter(
        (record) => {
          /*
           * 搜索：
           *
           * 姓名
           * 电话
           * 户籍地
           * 常住地
           */
          const matchesKeyword =
            !keyword ||
            String(
              record.name || ''
            )
              .toLowerCase()
              .includes(keyword) ||
            String(
              record.phone || ''
            )
              .toLowerCase()
              .includes(keyword) ||
            String(
              record.household || ''
            )
              .toLowerCase()
              .includes(keyword) ||
            String(
              record.residence || ''
            )
              .toLowerCase()
              .includes(keyword)

          /*
           * 风险状态筛选
           */
          const matchesRisk =
            riskFilter === '全部' ||
            getRiskFilterStatus(
              record
            ) === riskFilter

          return (
            matchesKeyword &&
            matchesRisk
          )
        }
      )
    }, [
      normalizedAllYouthData,
      searchText,
      riskFilter,
    ])


  /*
   * ==========================================================
   * 实时统计数据
   * ==========================================================
   */
  const riskStatistics =
    useMemo(() => {
      let riskCount = 0

      let noRiskCount = 0

      let uncheckedCount = 0

      filteredYouthData.forEach(
        (record) => {
          const status =
            getRiskFilterStatus(
              record
            )

          if (
            status === '有风险'
          ) {
            riskCount += 1
          } else if (
            status === '无风险'
          ) {
            noRiskCount += 1
          } else {
            uncheckedCount += 1
          }
        }
      )

      return {
        total:
          filteredYouthData.length,

        risk:
          riskCount,

        noRisk:
          noRiskCount,

        unchecked:
          uncheckedCount,
      }
    }, [
      filteredYouthData,
    ])


  /*
   * ==========================================================
   * 当前页数据
   * ==========================================================
   */
  const pageData =
    useMemo(() => {
      const startIndex =
        (currentPage - 1) *
        pageSize

      const endIndex =
        startIndex + pageSize

      return filteredYouthData.slice(
        startIndex,
        endIndex
      )
    }, [
      filteredYouthData,
      currentPage,
      pageSize,
    ])


  /*
   * ==========================================================
   * 当前选中人员
   * ==========================================================
   *
   * 非常重要：
   *
   * selectedYouth 不是自己保存的一份数据。
   *
   * 每次 allYouthData 改变以后，
   * selectedYouth 都会重新从 pageData 中取得最新对象。
   *
   * ==========================================================
   */
  const selectedYouth =
    useMemo(() => {
      return (
        pageData.find(
          (record) =>
            String(
              record.key
            ) ===
            String(
              selectedYouthKey
            )
        ) ||
        pageData[0] ||
        null
      )
    }, [
      pageData,
      selectedYouthKey,
    ])


  /*
   * ==========================================================
   * 搜索 / 风险筛选变化以后回到第一页
   * ==========================================================
   */
  useEffect(() => {
    setCurrentPage(1)
  }, [
    searchText,
    riskFilter,
  ])


  /*
   * ==========================================================
   * 每页数量改变以后回到第一页
   * ==========================================================
   */
  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize])


  /*
   * ==========================================================
   * 保证当前选中人员有效
   * ==========================================================
   */
  useEffect(() => {
    if (
      pageData.length === 0
    ) {
      if (
        selectedYouthKey !== ''
      ) {
        setSelectedYouthKey('')
      }

      return
    }

    const exists =
      pageData.some(
        (record) =>
          String(
            record.key
          ) ===
          String(
            selectedYouthKey
          )
      )

    if (!exists) {
      setSelectedYouthKey(
        pageData[0].key
      )
    }
  }, [
    pageData,
    selectedYouthKey,
  ])


  /*
   * ==========================================================
   * 点击搜索按钮
   * ==========================================================
   */
  const handleSearch = () => {
    setCurrentPage(1)
  }


  /*
   * ==========================================================
   * 打开新增风险排查表单
   * ==========================================================
   */
  const handleOpenAddRisk = () => {
    if (!selectedYouth) {
      message.warning(
        '请先选择一名青少年',
      )

      return
    }

    /*
     * 新增时必须清空“正在编辑的记录”，
     * 否则会误走修改分支。
     */
    setEditingRisk(null)

    setAddingRisk(true)
  }


  /*
   * ==========================================================
   * 打开编辑风险排查表单
   * ==========================================================
   *
   * 直接在风险排查页面编辑已有记录。
   * ==========================================================
   */
  const handleOpenEditRisk = (
    risk,
  ) => {
    if (!selectedYouth) {
      message.warning(
        '请先选择一名青少年',
      )

      return
    }

    if (!risk || !risk.id) {
      message.error(
        '这条记录缺少ID，无法编辑',
      )

      return
    }

    setEditingRisk(risk)

    setAddingRisk(true)
  }


  /*
   * ==========================================================
   * 删除风险排查记录
   * ==========================================================
   *
   * 删除成功后：
   *
   * 1. 从 allYouthData 中移除这条记录
   * 2. 重新计算页面显示
   *
   * 不重新请求 1181 条数据。
   * ==========================================================
   */
  const handleDeleteRisk = async (
    risk,
  ) => {
    if (!risk || !risk.id) {
      message.error(
        '这条记录缺少ID，无法删除',
      )

      return
    }

    try {
      setDeletingRiskId(
        String(risk.id),
      )

      await deleteRiskRecord(
        risk.id,
      )

      if (messageApi?.success) {
        messageApi.success(
          '风险排查记录删除成功',
        )
      } else {
        message.success(
          '风险排查记录删除成功',
        )
      }

      /*
       * 从本地状态中移除。
       */
      onRemoveYouthRisk?.(
        selectedYouth?.key ||
          selectedYouth?.id,
        String(risk.id),
      )
    } catch (error) {
      const text =
        error?.message ||
        '删除风险排查记录失败'

      if (messageApi?.error) {
        messageApi.error(text)
      } else {
        message.error(text)
      }
    } finally {
      setDeletingRiskId('')
    }
  }


  /*
   * ==========================================================
   * 关闭新增风险排查表单
   * ==========================================================
   */
  const handleCloseAddRisk = () => {
    if (savingRisk) {
      return
    }

    setAddingRisk(false)

    setEditingRisk(null)
  }


  /*
   * ==========================================================
   * 保存“编辑”后的风险排查记录
   * ==========================================================
   *
   * 与新增的区别：
   *
   *     新增  createRiskRecord(youthId, risk)
   *     编辑  updateRiskRecord(riskId,  risk)
   *
   * 编辑成功后同样使用服务器返回的记录
   * 同步进统一状态，不重新 GET 全量数据。
   * ==========================================================
   */
  const submitUpdateRisk = async (
    riskId,
    risk,
  ) => {
    try {
      setSavingRisk(true)

      const result =
        await updateRiskRecord(
          riskId,
          risk,
        )

      const serverRisk =
        normalizeRiskRecord(
          result?.record || risk,
        )

      if (
        typeof onUpdateYouthRisks ===
        'function'
      ) {
        onUpdateYouthRisks(
          selectedYouth?.key ||
            selectedYouth?.id,
          {
            ...serverRisk,
            id: riskId,
          },
        )
      }

      setAddingRisk(false)

      setEditingRisk(null)

      if (messageApi?.success) {
        messageApi.success(
          '风险排查记录修改成功',
        )
      } else {
        message.success(
          '风险排查记录修改成功',
        )
      }
    } catch (error) {
      const text =
        error?.message ||
        '修改风险排查记录失败'

      if (messageApi?.error) {
        messageApi.error(text)
      } else {
        message.error(text)
      }
    } finally {
      setSavingRisk(false)
    }
  }


  /*
   * ==========================================================
   * 保存新增风险排查记录
   * ==========================================================
   *
   * 这里是本次修改的核心。
   *
   * ==========================================================
   *
   * 正确的数据流：
   *
   *     1. 前端 POST
   *            ↓
   *     2. 服务器写入 NocoDB
   *            ↓
   *     3. 服务器返回完整 record
   *            ↓
   *     4. 前端取得 record
   *            ↓
   *     5. record 交给统一状态中心
   *            ↓
   *     6. allYouthData 更新
   *            ↓
   *     7. 所有页面自动更新
   *
   * ==========================================================
   *
   * 不允许：
   *
   *     保存成功
   *       ↓
   *     再 GET 数据库
   *
   * 因为这会重新制造第二条数据链。
   *
   * ==========================================================
   */
  const handleSubmitRisk = async (
    risk,
  ) => {
    if (!selectedYouth) {
      message.warning(
        '请先选择一名青少年',
      )

      return
    }

    const youthId =
      selectedYouth.id ||
      selectedYouth.key

    if (!youthId) {
      message.error(
        '缺少青少年记录ID，无法保存',
      )

      return
    }

    /*
     * ========================================================
     * 编辑已有记录
     * ========================================================
     *
     * editingRisk 不为空时走修改分支。
     * ========================================================
     */
    if (
      editingRisk &&
      editingRisk.id
    ) {
      await submitUpdateRisk(
        editingRisk.id,
        risk,
      )

      return
    }

    /*
     * ========================================================
     * 保存前调试信息
     * ========================================================
     */
    console.log(
      '【风险排查】开始保存',
      {
        youthId,
        youthName:
          selectedYouth.name,
        risk,
        onUpdateYouthRisks:
          typeof onUpdateYouthRisks,
      },
    )

    try {
      setSavingRisk(true)

      /*
       * ======================================================
       * 第一步
       *
       * 向服务器保存。
       * ======================================================
       */
      const createdRisk =
        await createRiskRecord(
          youthId,
          risk,
        )

      /*
       * ======================================================
       * 第二步
       *
       * 打印服务器真正返回给浏览器的数据。
       *
       * 这和服务器终端日志是两回事。
       * ======================================================
       */
      console.log(
        '【风险排查】服务器返回结果：',
        createdRisk,
      )

      /*
       * ======================================================
       * 第三步
       *
       * 必须存在服务器返回的 record。
       *
       * 如果没有 record，
       * 就不能假装前端已经同步成功。
       * ======================================================
       */
      if (
        !createdRisk ||
        !createdRisk.record
      ) {
        console.error(
          '【风险排查】服务器成功，但没有返回 record：',
          createdRisk,
        )

        throw new Error(
          '服务器已保存风险记录，但没有返回完整风险记录，前端无法同步',
        )
      }

      /*
       * ======================================================
       * 第四步
       *
       * 对服务器返回的最终记录做一次前端统一规范化。
       *
       * 注意：
       *
       * 这里不是重新请求数据库。
       *
       * 就是处理刚刚服务器已经返回的数据。
       * ======================================================
       */
      const serverRisk =
        normalizeRiskRecord(
          createdRisk.record,
        )

      console.log(
        '【风险排查】服务器返回的最终风险记录：',
        serverRisk,
      )

      /*
       * ======================================================
       * 第五步
       *
       * 必须有风险记录 ID。
       *
       * 没有 ID 就不能进入统一状态。
       * ======================================================
       */
      if (
        !serverRisk ||
        !serverRisk.id
      ) {
        console.error(
          '【风险排查】服务器返回的风险记录没有有效 ID：',
          {
            createdRisk,
            serverRisk,
          },
        )

        throw new Error(
          '服务器返回的风险记录缺少 ID，前端无法同步',
        )
      }

      /*
       * ======================================================
       * 第六步
       *
       * 将服务器刚刚返回的最终记录交给：
       *
       *     App
       *       ↓
       *     useYouthData
       *       ↓
       *     allYouthData
       *
       * 这里是整个系统真正的“统一状态入口”。
       * ======================================================
       */
      if (
        typeof onUpdateYouthRisks !==
        'function'
      ) {
        console.error(
          '【风险排查】严重错误：onUpdateYouthRisks 没有传入',
          {
            youthId,
            serverRisk,
          },
        )

        throw new Error(
          '前端风险数据同步函数没有正确连接',
        )
      }

      console.log(
        '【风险排查】准备写入统一前端状态：',
        {
          youthId,
          riskId:
            serverRisk.id,
          serverRisk,
        },
      )

      onUpdateYouthRisks(
        youthId,
        serverRisk,
      )

      /*
       * ======================================================
       * 第七步
       *
       * 注意这里没有重新请求数据库。
       *
       * 成功写入 NocoDB 的记录已经在 serverRisk 中。
       * ======================================================
       */

      console.log(
        '【风险排查】已经提交给统一前端状态中心',
        {
          youthId,
          riskId:
            serverRisk.id,
        },
      )

      message.success(
        '风险排查记录添加成功',
      )

      setAddingRisk(false)

    } catch (error) {

      /*
       * ======================================================
       * 只有真正成功以后才关闭抽屉。
       *
       * 如果同步失败：
       *
       *     不修改页面数据
       *     不制造假数据
       * ======================================================
       */
      console.error(
        '【风险排查】新增风险排查记录失败：',
        error,
      )

      message.error(
        error?.message ||
          '新增风险排查记录失败',
      )

    } finally {

      setSavingRisk(false)

    }
  }


  /*
   * ==========================================================
   * 页面显示
   * ==========================================================
   */
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >

      {/* =====================================================
          顶部搜索和筛选区
          ===================================================== */}
      <div
        style={{
          paddingBottom: 12,
          flexShrink: 0,
        }}
      >
        <Space
          wrap
          style={{
            width: '100%',
          }}
        >

          {/* 搜索框 */}
          <Space.Compact>
            <Input
              allowClear
              placeholder="搜索姓名、电话、户籍地、常住地"
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
              onPressEnter={
                handleSearch
              }
              style={{
                width: 320,
              }}
            />

            <Button
              type="primary"
              onClick={
                handleSearch
              }
            >
              搜索
            </Button>
          </Space.Compact>


          {/* 风险状态筛选 */}
          <Select
            value={riskFilter}
            onChange={setRiskFilter}
            style={{
              width: 140,
            }}
            options={[
              {
                value: '全部',
                label: '全部',
              },
              {
                value: '有风险',
                label: '有风险',
              },
              {
                value: '无风险',
                label: '无风险',
              },
              {
                value: '未排查',
                label: '未排查',
              },
            ]}
          />
        </Space>
      </div>


      {/* =====================================================
          实时统计行
          ===================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding:
            '10px 16px',
          marginBottom: 12,
          background:
            '#fafafa',
          border:
            '1px solid #f0f0f0',
          borderRadius: 6,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <Space size={6}>
          <Text type="secondary">
            共计
          </Text>

          <Text strong>
            {riskStatistics.total}
          </Text>

          <Text type="secondary">
            人
          </Text>
        </Space>


        <Space size={6}>
          <Text type="secondary">
            有风险
          </Text>

          <Text
            strong
            type="danger"
          >
            {riskStatistics.risk}
          </Text>

          <Text type="secondary">
            人
          </Text>
        </Space>


        <Space size={6}>
          <Text type="secondary">
            无风险
          </Text>

          <Text
            strong
            type="success"
          >
            {riskStatistics.noRisk}
          </Text>

          <Text type="secondary">
            人
          </Text>
        </Space>


        <Space size={6}>
          <Text type="secondary">
            未排查
          </Text>

          <Text strong>
            {riskStatistics.unchecked}
          </Text>

          <Text type="secondary">
            人
          </Text>
        </Space>
      </div>


      {/* =====================================================
          左右两栏
          ===================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 16,
          flex: 1,
          minHeight: 0,
        }}
      >

        {/* ===================================================
            左侧：青少年列表
            =================================================== */}
        <Card
          title="青少年"
          bodyStyle={{
            padding: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
          style={{
            height: '100%',
            minHeight: 0,
          }}
        >

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              minHeight: 0,
            }}
          >
            {externalLoading ? (
              <div
                style={{
                  height: '100%',
                  minHeight: 240,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Spin
                  size="large"
                  tip="正在读取数据……"
                />
              </div>
            ) : pageData.length ===
              0 ? (
              <Empty
                description="暂无数据"
                style={{
                  marginTop: 60,
                }}
              />
            ) : (
              pageData.map(
                (record) => {
                  const isSelected =
                    String(
                      record.key
                    ) ===
                    String(
                      selectedYouthKey
                    )

                  const riskStatus =
                    getRiskFilterStatus(
                      record
                    )

                  return (
                    <div
                      key={
                        record.key
                      }
                      onClick={() =>
                        setSelectedYouthKey(
                          record.key
                        )
                      }
                      style={{
                        padding:
                          '14px 16px',
                        cursor:
                          'pointer',
                        background:
                          isSelected
                            ? '#f0f5ff'
                            : '#fff',
                        borderLeft:
                          isSelected
                            ? '3px solid #1677ff'
                            : '3px solid transparent',
                        borderBottom:
                          '1px solid #f0f0f0',
                      }}
                    >
                      <Space
                        direction="vertical"
                        size={4}
                        style={{
                          width:
                            '100%',
                        }}
                      >
                        <Space>
                          <Text strong>
                            {
                              record.name ||
                              '未命名'
                            }
                          </Text>

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
                        </Space>

                        {record.latestRiskDescription ||
                        record.risks?.[0]
                          ?.description ? (
                          <Text
                            type="secondary"
                            ellipsis={{
                              tooltip:
                                record
                                  .latestRiskDescription ||
                                record
                                  .risks?.[0]
                                  ?.description,
                            }}
                          >
                            {record
                              .latestRiskDescription ||
                              record
                                .risks?.[0]
                                ?.description}
                          </Text>
                        ) : (
                          <Text type="secondary">
                            暂无风险排查记录
                          </Text>
                        )}
                      </Space>
                    </div>
                  )
                }
              )
            )}
          </div>


          {/* 左侧分页 */}
          <div
            style={{
              padding:
                '12px 12px',
              borderTop:
                '1px solid #f0f0f0',
              flexShrink: 0,
              display: 'flex',
              justifyContent:
                'center',
              background:
                '#fff',
            }}
          >
            <Pagination
              current={
                currentPage
              }
              pageSize={
                pageSize
              }
              total={
                riskStatistics.total
              }
              showSizeChanger
              pageSizeOptions={[
                10,
                20,
                50,
              ]}
              showQuickJumper={{
                goButton: '转到',
              }}
              locale={{
                items_per_page: '条/页',
                jump_to: '转到',
                jump_to_confirm: '确定',
                page: '页',
                prev_page: '上一页',
                next_page: '下一页',
                prev_5: '向前 5 页',
                next_5: '向后 5 页',
                prev_3: '向前 3 页',
                next_3: '向后 3 页',
              }}
              onChange={(
                page,
                size
              ) => {
                if (
                  size !==
                  pageSize
                ) {
                  setPageSize(
                    size
                  )

                  return
                }

                setCurrentPage(
                  page
                )
              }}
            />
          </div>
        </Card>


        {/* ===================================================
            右侧：风险排查记录
            =================================================== */}
        <Card
          title={
            selectedYouth
              ? `${selectedYouth.name || '未命名'}的风险排查记录`
              : '风险排查记录'
          }
          extra={
            <Button
              type="primary"
              onClick={
                handleOpenAddRisk
              }
              disabled={
                !selectedYouth ||
                externalLoading
              }
            >
              ＋ 添加风险排查
            </Button>
          }
          style={{
            height: '100%',
            minHeight: 0,
          }}
          bodyStyle={{
            height:
              'calc(100% - 57px)',
            overflowY:
              'auto',
          }}
        >
          {!selectedYouth ? (
            <Empty
              description="请选择青少年"
            />
          ) : !Array.isArray(
              selectedYouth.risks
            ) ||
            selectedYouth.risks.length ===
              0 ? (
            <Empty
              description="暂无风险排查记录"
            />
          ) : (
            <Space
              direction="vertical"
              size={16}
              style={{
                width:
                  '100%',
              }}
            >
              {selectedYouth.risks.map(
                (risk, index) => (
                  <Card
                    key={
                      risk.id ||
                      index
                    }
                    size="small"
                    title={
                      risk.title ||
                      `排查记录${index + 1}`
                    }
                    extra={
                      <Space size={4}>
                        {/* 编辑：直接在风险排查页面修改 */}
                        <Button
                          size="small"
                          onClick={() =>
                            handleOpenEditRisk(
                              risk,
                            )
                          }
                        >
                          编辑
                        </Button>

                        {/* 删除：红色危险按钮 */}
                        <Popconfirm
                          title="确定删除这条排查记录吗？"
                          description="删除后不可恢复"
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{
                            danger: true,
                          }}
                          onConfirm={() =>
                            handleDeleteRisk(
                              risk,
                            )
                          }
                        >
                          <Button
                            size="small"
                            danger
                            loading={
                              String(
                                deletingRiskId,
                              ) ===
                              String(
                                risk.id,
                              )
                            }
                          >
                            删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    }
                  >
                    <Space
                      direction="vertical"
                      size={8}
                      style={{
                        width:
                          '100%',
                      }}
                    >

                      {/* 排查日期 */}
                      <div>
                        <Text strong>
                          排查日期：
                        </Text>

                        <Text>
                          {risk.date ||
                            '—'}
                        </Text>
                      </div>


                      {/* 是否存在风险 */}
                      <div>
                        <Text strong>
                          是否存在风险：
                        </Text>

                        {risk.status ===
                        '是' ? (
                          <Tag color="error">
                            有风险
                          </Tag>
                        ) : (
                          <Tag color="success">
                            无风险
                          </Tag>
                        )}
                      </div>


                      {/* 风险隐患描述 */}
                      <div>
                        <Text strong>
                          风险隐患描述：
                        </Text>

                        <div
                          style={{
                            marginTop:
                              4,
                          }}
                        >
                          {risk.description ||
                            '—'}
                        </div>
                      </div>


                      {/* 处置情况 */}
                      <div>
                        <Text strong>
                          处置情况：
                        </Text>

                        <div
                          style={{
                            marginTop:
                              4,
                          }}
                        >
                          {risk.handling ||
                            '—'}
                        </div>
                      </div>


                      {/* 排查人 */}
                      <div>
                        <Text strong>
                          排查人：
                        </Text>

                        <Text>
                          {risk.inspector ||
                            '—'}
                        </Text>
                      </div>


                      {/* 备注 */}
                      <div>
                        <Text strong>
                          备注：
                        </Text>

                        <div
                          style={{
                            marginTop:
                              4,
                          }}
                        >
                          {risk.remark ||
                            '—'}
                        </div>
                      </div>

                    </Space>
                  </Card>
                )
              )}
            </Space>
          )}
        </Card>
      </div>


      {/* =====================================================
          新增风险排查记录抽屉
          ===================================================== */}
      <RiskRecordForm
        open={addingRisk}
        youth={selectedYouth}
        saving={savingRisk}

        /*
         * 传入正在编辑的记录时，表单进入编辑模式。
         * 为空则是新增。
         */
        record={editingRisk}

        onClose={
          handleCloseAddRisk
        }
        onSubmit={
          handleSubmitRisk
        }
      />
    </div>
  )
}