import {
  Dashboard,
} from './dashboard/Dashboard'

import {
  YouthPage,
} from './youth/YouthPage'

import {
  RiskPage,
} from './risk/RiskPage'

import {
  HelpManagePage,
} from './help/HelpManagePage'

import {
  StatisticsPage,
} from './statistics/StatisticsPage'

import {
  SystemManagePage,
} from './system/SystemManagePage'

import {
  ModulePlaceholder,
} from './common/ModulePlaceholder'


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
 * 4. 其他页面
 *    暂时显示占位页面
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


/**
 * =========================================================
 * PageContent
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
      <Dashboard
        {...dashboardProps}
      />
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
      <YouthPage
        {...youthPageProps}
      />
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
      <RiskPage
        {...riskPageProps}
      />
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
      <HelpManagePage
        {...helpManageProps}
      />
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
      <StatisticsPage
        {...statisticsProps}
      />
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
      <SystemManagePage
        {...systemProps}
      />
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