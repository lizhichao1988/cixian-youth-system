import {
  useMemo,
  useState,
} from 'react'

import {
  Button,
  Drawer,
  Layout,
  message,
} from 'antd'

import {
  MenuFoldOutlined,
} from '@ant-design/icons'

import './App.css'

import { Sidebar } from './components/layout/Sidebar'
import { Header as AppHeader } from './components/layout/Header'
import { AppMenu } from './components/layout/AppMenu'

import {
  LoginPage,
} from './components/LoginPage'

import {
  useAuth,
} from './context/AuthContext'

import { YouthDrawers } from './components/youth/YouthDrawers'
import { PageContent } from './components/PageContent'

import { useYouthData } from './hooks/useYouthData'
import { useYouthFilters } from './hooks/useYouthFilters'
import { useYouthEditor } from './hooks/useYouthEditor'
import { useYouthDetail } from './hooks/useYouthDetail'

import {
  calculateStatistics,
  calculateRiskStatistics,
} from './utils/statisticsUtils'

import {
  getRiskFilterStatus,
  normalizeRiskRecord,
  upsertRiskRecord,
} from './utils/riskUtils'

import {
  categoryGroups,
} from './utils/categoryUtils'

const { Content } = Layout

/* =========================================================
   App
   ========================================================= */

function App() {
  const [
    messageApi,
    contextHolder,
  ] = message.useMessage()

  const [
    activePage,
    setActivePage,
  ] = useState(() => {
    try {
      return (
        sessionStorage.getItem(
          'cixian_active_page',
        ) || 'youth'
      )
    } catch {
      return 'youth'
    }
  })

  /**
   * 统一的页面切换函数。
   *
   * 切换时把当前页写进 sessionStorage，
   * 这样刷新浏览器后仍然停留在该页面，
   * 不会跳回青少年信息页；
   * 而青少年数据会在后台静默重新读取。
   */
  function navigateToPage(key) {
    setActivePage(key)

    try {
      sessionStorage.setItem(
        'cixian_active_page',
        key,
      )
    } catch {
      /**
       * 隐私模式写入失败不影响主流程。
       */
    }
  }

  const [
    selectedRowKeys,
    setSelectedRowKeys,
  ] = useState([])

  /**
   * 移动端抽屉导航的开关状态。
   *
   * 桌面端侧边栏常驻，
   * 手机端侧边栏隐藏，
   * 改用抽屉 + 汉堡按钮切换页面。
   */
  const [
    mobileNavOpen,
    setMobileNavOpen,
  ] = useState(false)

  /**
   * =========================================================
   * 登录状态
   * =========================================================
   *
   * 没有登录时直接显示登录页，
   * 后面的业务数据一概不加载。
   */
  const {
    user,
    checking,
  } = useAuth()

  /**
   * =========================================================
   * 页面级权限
   * =========================================================
   *
   * 系统管理只有管理员能进。
   *
   * 县级与乡级账号在菜单里看不到这一项，
   * 这里再做一次兜底：
   *
   *     万一被切到 system，自动回落到青少年信息页。
   */

  const isAdmin =
    user?.role === 'admin'

  const effectivePage =
    activePage === 'system' &&
    !isAdmin
      ? 'youth'
      : activePage

  /**
   * =========================================================
   * 青少年数据
   * =========================================================
   *
   * 必须在登录成功以后才读取。
   *
   * 后端会根据登录账号的归口单位过滤，
   * 乡镇账号只能拿到本乡镇的数据。
   *
   * 这里把 user 传进去：
   *
   *     1. 未登录时不读取
   *     2. 换账号登录后自动重新读取
   */

  const {
  allYouthData,
  setAllYouthData,
  loading,
} = useYouthData({
  messageApi,

  user,

  ready: !checking,
})

/**
 * ============================================================
 * 更新某名青少年的风险排查记录
 * ============================================================
 *
 * 注意：
 * normalizeRecord() 标准化后的青少年唯一 ID
 * 保存在 youth.key 中，而不是 youth.id 中。
 *
 * 因此这里必须使用 youth.key 查找目标青少年。
 *
 * 这样风险排查页面新增记录以后，
 * 可以直接更新 App.jsx 内存中的 allYouthData，
 * 不需要重新请求 1181 条数据。
 *
 * ============================================================
 */
function updateYouthRisks(
  youthId,
  newRisk,
) {
  /**
   * 风险页只允许把“服务器已经成功返回的完整 record”
   * 写入前端内存。
   *
   * 如果没有 record / 没有 ID，直接不更新，
   * 从根源上保证“服务器保存失败，前端不显示”。
   */
  const riskRecord =
    normalizeRiskRecord(
      newRisk?.record ||
        newRisk,
    )

  if (!riskRecord.id) {
    return
  }

  setAllYouthData(
    (currentData) =>
      currentData.map(
        (youth) => {
          const currentYouthId =
            youth.key ??
            youth.id ??
            youth.Id ??
            ''

          if (
            String(currentYouthId) !==
            String(youthId)
          ) {
            return youth
          }

          const currentRisks =
            Array.isArray(youth.risks)
              ? youth.risks
              : []

          /**
           * 编辑已有记录：原地替换，顺序不变。
           * 新增记录：放到最前面。
           */
          return {
            ...youth,
            risks:
              upsertRiskRecord(
                currentRisks,
                riskRecord,
              ),
          }
        },
      ),
  )

  /**
   * 如果当前恰好还打开着这个人的“一人一档”，
   * 同时更新详情快照，避免出现：
   *
   * allYouthData 已经有新记录，
   * 详情抽屉却还是旧数据。
   */
  updateDetailRisks(
    youthId,
    riskRecord,
  )
}

/**
 * ============================================================
 * 删除某名青少年的一条风险排查记录
 * ============================================================
 *
 * 只从前端内存中移除这一条，
 * 不重新请求 1181 条数据。
 *
 * 数据库层面的删除由后端接口完成，
 * 这个函数只在“后端已经删除成功”之后调用。
 * ============================================================
 */
function removeYouthRisk(
  youthId,
  riskId,
) {
  setAllYouthData(
    (currentData) =>
      currentData.map(
        (youth) => {
          const currentYouthId =
            youth.key ??
            youth.id ??
            youth.Id ??
            ''

          if (
            String(currentYouthId) !==
            String(youthId)
          ) {
            return youth
          }

          const currentRisks =
            Array.isArray(youth.risks)
              ? youth.risks
              : []

          return {
            ...youth,

            risks:
              currentRisks.filter(
                (risk) =>
                  String(
                    risk?.id ??
                      risk?.Id ??
                      risk?.ID ??
                      '',
                  ) !==
                  String(riskId),
              ),
          }
        },
      ),
  )
}

/**
 * =========================================================
 * 一人一档详情状态
 * =========================================================
 *
 * 详情人员、详情 Drawer 以及详情更新逻辑，
 * 统一交给 useYouthDetail 管理。
 */
const {
  detailRecord,
  drawerOpen,
  setDrawerOpen,
  openDetail,
  closeDetail,
  updateDetailRecord,
  updateDetailRisks,
} = useYouthDetail()

  /**
   * =========================================================
   * 青少年列表筛选
   * =========================================================
   *
   * 筛选、搜索、分页全部交给 useYouthFilters。
   *
   * App.jsx 只负责使用结果。
   */

  const {
    searchText,
    setSearchText,

    ageMin,
    setAgeMin,

    ageMax,
    setAgeMax,

    genderFilter,
    setGenderFilter,

    bigCategoryFilter,
    setBigCategoryFilter,

    smallCategoryFilter,
    setSmallCategoryFilter,

    householdFilter,
    setHouseholdFilter,

    residenceFilter,
    setResidenceFilter,

    riskFilter,
    setRiskFilter,

    helpRequiredFilter,
    setHelpRequiredFilter,

    birthdayRange,
    setBirthdayRange,

    currentPage,
    setCurrentPage,

    pageSize,
    setPageSize,

    smallCategoryOptions,

    filteredData,

    tableData,

    resetFilters,

    handleBigCategoryChange,
  } = useYouthFilters({
    allYouthData,

    activePage: effectivePage,

    onResetSelection:
      () =>
        setSelectedRowKeys([]),
  })

  const {
    editRecord,
    editOpen,
    setEditOpen,
    openEdit,
    openCreate,
    saveEdit,
    updateEditField,
    deleteYouth,
  } = useYouthEditor({
  messageApi,
  setAllYouthData,
  onRecordSaved:
    updateDetailRecord,

  /**
   * 保存成功以后的收尾动作。
   *
   * source 表示这一次编辑是从哪里打开的：
   *
   *     'list'     青少年列表 / 新增
   *     'detail'   一人一档详情页
   *
   * 如果是从“一人一档”详情页点“编辑”进来的，
   * 保存成功以后自动把详情页重新打开。
   *
   * 这样用户点完保存，
   * 立刻就能看到刚刚保存好的：
   *
   *     是否存在风险
   *     风险隐患描述
   *     排查日期
   *     排查人
   *     ...
   */
  onAfterSave: (
    _savedRecord,
    source,
  ) => {
    if (source !== 'detail') {
      return
    }

    setDrawerOpen(true)
  },
})

  const statistics =
    useMemo(
      () =>
        calculateStatistics(
          filteredData,
        ),
      [filteredData],
    )
  const riskStatistics =
    useMemo(
      () =>
        calculateRiskStatistics(
          allYouthData,
          getRiskFilterStatus,
        ),
     [
      allYouthData,
      ],
  )

  const pageTitle =
    activePage === 'help'
      ? '需帮扶人员信息'
      : '青少年信息'

    /**
   * =========================================================
   * 青少年页面参数
   * =========================================================
   *
   * 将传给 YouthPage 的参数集中整理。
   *
   * 这样 App.jsx 的 JSX 不需要堆积大量 props。
   *
   * 本次只做参数整理：
   * 不改变任何业务逻辑。
   * =========================================================
   */
    const youthPageProps = {
      activePage,
      pageTitle,

      allYouthData,
      loading,

      statistics,

      selectedRowKeys,
      setSelectedRowKeys,

      searchText,
      setSearchText,

      bigCategoryFilter,
      handleBigCategoryChange,

      categoryGroups,

      smallCategoryFilter,
      setSmallCategoryFilter,

      smallCategoryOptions,

      ageMin,
      setAgeMin,

      ageMax,
      setAgeMax,

      genderFilter,
      setGenderFilter,

      householdFilter,
      setHouseholdFilter,

      residenceFilter,
      setResidenceFilter,

      riskFilter,
      setRiskFilter,

      helpRequiredFilter,
      setHelpRequiredFilter,

      birthdayRange,
      setBirthdayRange,

      setCurrentPage,

      resetFilters,

      filteredData,

      tableData,

      currentPage,
      pageSize,
      setPageSize,

      openDetail,
      openEdit,
      openCreate,
      deleteYouth,
    }

    /**
 * =========================================================
 * 首页工作台参数
 * =========================================================
 *
 * 将 Dashboard 所需参数集中整理。
 *
 * 与 youthPageProps 的目的相同：
 * 让 App.jsx 的 JSX 更干净。
 * =========================================================
 */
  const dashboardProps = {
  statistics,

  riskStatistics,

  onYouth: () =>
    navigateToPage(
      'youth',
    ),

  onHelp: () =>
    navigateToPage(
      'help',
    ),
}
  /**
   * =========================================================
   * 未登录：只显示登录页
   * =========================================================
   */
  if (!user) {
    return (
      <>
        {contextHolder}

        <LoginPage />
      </>
    )
  }

  /**
   * 正在用本地 token 恢复登录态时，
   * 先不渲染主界面，避免闪烁。
   */
  if (checking) {
    return (
      <>
        {contextHolder}
      </>
    )
  }

  return (
    <>
      {contextHolder}

      <Layout className="app-layout">
        <Sidebar
          activePage={effectivePage}
          onPageChange={navigateToPage}
          onClearSelection={() =>
            setSelectedRowKeys([])
          }
        />

        <Layout>
          <AppHeader
            onMenuClick={() =>
              setMobileNavOpen(true)
            }
          />

          <Content className="main-content">
             <PageContent
            activePage={
              effectivePage
            }
            dashboardProps={
              dashboardProps
            }
            youthPageProps={
              youthPageProps
            }
            riskPageProps={{
            allYouthData,
            loading,
            messageApi,
            onUpdateYouthRisks:
              updateYouthRisks,
            onRemoveYouthRisk:
              removeYouthRisk,
          }}

            helpManageProps={{
            allYouthData,
            loading,
            messageApi,
          }}

            statisticsProps={{
            allYouthData,
            loading,
          }}

            systemProps={{
            messageApi,
          }}
          />
          </Content>
        </Layout>

        {/* 移动端抽屉导航：手机上替代隐藏的侧边栏 */}
        <Drawer
          placement="left"
          open={mobileNavOpen}
          onClose={() =>
            setMobileNavOpen(false)
          }
          width={240}
          styles={{
            body: {
              padding: 0,
            },
          }}
          className="mobile-drawer"
          title={
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
          }
        >
          <AppMenu
            activePage={effectivePage}
            onPageChange={(key) => {
              navigateToPage(key)
              setSelectedRowKeys([])
              setMobileNavOpen(false)
            }}
          />
        </Drawer>
      </Layout>
      <YouthDrawers
        detailRecord={detailRecord}
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}

        editRecord={editRecord}
        editOpen={editOpen}
        setEditOpen={setEditOpen}

        openEdit={openEdit}
        saveEdit={saveEdit}
        updateEditField={updateEditField}

        categoryGroups={categoryGroups}
         onOpenAllRisks={() => {
          setDrawerOpen(false)
          navigateToPage('risk')
        }}

      />
    </>
  )

}

export default App