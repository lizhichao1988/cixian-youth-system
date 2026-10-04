import {
  Suspense,
  lazy,
} from 'react'

import { Spin } from 'antd'

import {
  ModulePlaceholder,
} from './common/ModulePlaceholder'

/**
 * =========================================================
 * 页面级懒加载
 * =========================================================
 *
 * 改造前：
 *
 *     六个页面在首屏一次性全部打包加载，
 *     哪怕用户只打算看「青少年信息」，
 *     帮扶管理、数据统计、系统管理的代码
 *     也都要先下载下来。
 *
 *     首屏 JS 接近 2MB，
 *     乡镇网络下打开要等好几秒。
 *
 * 改造后：
 *
 *     每个页面单独打包成一个 chunk，
 *     点开哪个页面才下载哪个。
 *
 *     首屏只需要下载外壳 + 当前页面，
 *     首次打开明显变快；
 *     而且以后只改某一个页面，
 *     用户浏览器只需重新下载那个 chunk，
 *     其余走缓存。
 *
 * =========================================================
 */

const Dashboard = lazy(() =>
  import('./dashboard/Dashboard').then(
    (m) => ({
      default: m.Dashboard,
    }),
  ),
)

const YouthPage = lazy(() =>
  import('./youth/YouthPage').then(
    (m) => ({
      default: m.YouthPage,
    }),
  ),
)

const RiskPage = lazy(() =>
  import('./risk/RiskPage').then(
    (m) => ({
      default: m.RiskPage,
    }),
  ),
)

const HelpManagePage = lazy(() =>
  import('./help/HelpManagePage').then(
    (m) => ({
      default: m.HelpManagePage,
    }),
  ),
)

const StatisticsPage = lazy(
  () =>
    import(
      './statistics/StatisticsPage'
    ).then((m) => ({
      default: m.StatisticsPage,
    })),
)

const SystemManagePage = lazy(
  () =>
    import(
      './system/SystemManagePage'
    ).then((m) => ({
      default: m.SystemManagePage,
    })),
)

/**
 * 加载中的占位。
 *
 * 页面 chunk 只有几十 KB，
 * 正常情况下一闪而过；
 * 乡镇网络慢时至少有个反馈，
 * 不会看起来像卡死。
 */
function PageLoading() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          'center',
        minHeight: 280,
      }}
    >
      <Spin
        size="large"
        tip="页面加载中…"
      >
        <div
          style={{
            padding: 24,
          }}
        />
      </Spin>
    </div>
  )
}

/**
 * =========================================================
 * PageContent
 * =========================================================
 *
 * 负责根据当前页面状态，
 * 决定主内容区域显示什么页面。
 *
 * 当前支持：
 *
 * 1. dashboard
 *    首页工作台
 *
 * 2. youth
 *    青少年信息
 *
 * 3. help
 *    需帮扶人员信息
 *
 * 4. risk
 *    风险排查
 *
 * 5. helpManage
 *    帮扶管理
 *
 * 6. statistics
 *    数据统计
 *
 * 7. system
 *    系统管理
 *
 * =========================================================
 *
 * 本组件只负责：
 *
 * “显示哪个页面”
 *
 * 不负责：
 *
 * 1. 数据读取
 * 2. 数据筛选
 * 3. 编辑
 * 4. 详情
 * 5. Drawer
 * 6. 页面状态管理
 *
 * 这些职责仍然由 App.jsx 和对应 Hook 负责。
 *
 * =========================================================
 */
export function PageContent({
  activePage,

  dashboardProps,

  youthPageProps,

  riskPageProps,

  helpManageProps,

  statisticsProps,

  systemProps,
}) {
  /**
   * =======================================================
   * 首页工作台
   * =======================================================
   */
  if (
    activePage ===
    'dashboard'
  ) {
    return (
      <Suspense
        fallback={
          <PageLoading />
        }
      >
        <Dashboard
          {...dashboardProps}
        />
      </Suspense>
    )
  }

  /**
   * =======================================================
   * 青少年信息 / 需帮扶人员信息
   * =======================================================
   */
  if (
    activePage ===
      'youth' ||
    activePage ===
      'help'
  ) {
    return (
      <Suspense
        fallback={
          <PageLoading />
        }
      >
        <YouthPage
          {...youthPageProps}
        />
      </Suspense>
    )
  }

  /**
   * =======================================================
   * 风险排查
   * =======================================================
   *
   * 风险排查页面独立成自己的组件。
   *
   * PageContent 只负责把对应参数传进去。
   * =======================================================
   */
  if (
    activePage ===
    'risk'
  ) {
    return (
      <Suspense
        fallback={
          <PageLoading />
        }
      >
        <RiskPage
          {...riskPageProps}
        />
      </Suspense>
    )
  }

  /**
   * =======================================================
   * 帮扶管理
   * =======================================================
   *
   * 左侧菜单栏“帮扶管理”对应的页面。
   *
   * 显示 1181 名青少年 / 91 名需帮扶人员，
   * 选中后可维护：
   *
   *     结对帮扶信息
   *     帮扶需求
   *     帮扶记录
   * =======================================================
   */
  if (
    activePage ===
    'helpManage'
  ) {
    return (
      <Suspense
        fallback={
          <PageLoading />
        }
      >
        <HelpManagePage
          {...helpManageProps}
        />
      </Suspense>
    )
  }

  /**
   * =======================================================
   * 数据统计
   * =======================================================
   */
  if (
    activePage ===
    'statistics'
  ) {
    return (
      <Suspense
        fallback={
          <PageLoading />
        }
      >
        <StatisticsPage
          {...statisticsProps}
        />
      </Suspense>
    )
  }

  /**
   * =======================================================
   * 系统管理
   * =======================================================
   *
   * 账号管理 / 回收站 / 操作日志
   * =======================================================
   */
  if (
    activePage ===
    'system'
  ) {
    return (
      <Suspense
        fallback={
          <PageLoading />
        }
      >
        <SystemManagePage
          {...systemProps}
        />
      </Suspense>
    )
  }

  /**
   * =======================================================
   * 其他暂未实现的页面
   * =======================================================
   */
  return (
    <ModulePlaceholder
      activePage={
        activePage
      }
    />
  )
}
