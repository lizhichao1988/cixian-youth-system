/**
 * 青少年统计工具
 *
 * 本文件只负责青少年数据统计，
 * 不负责页面展示，也不负责数据读取和数据保存。
 *
 * 主要职责：
 * 1. 统计青少年总人数。
 * 2. 统计重点托底类人数。
 * 3. 统计常态关爱类人数。
 * 4. 统计成长托举类人数。
 *
 * 分类判断统一调用 categoryUtils，
 * 避免 App.jsx 自己重复处理困难类别。
 */

import {
  getCategoryGroup,
} from './categoryUtils'

/**
 * 计算青少年统计数据。
 *
 * 参数：
 * records
 * - 已经经过 normalizeRecord() 标准化后的青少年数组。
 *
 * 返回：
 * {
 *   total: 总人数,
 *   top: 重点托底类人数,
 *   normal: 常态关爱类人数,
 *   growth: 成长托举类人数,
 * }
 */
function calculateStatistics(
  records,
) {
  /*
   * 防止传入的数据不是数组。
   */
  const list = Array.isArray(records)
    ? records
    : []

  /*
   * 初始化统计结果。
   */
  const statistics = {
    total: list.length,
    top: 0,
    normal: 0,
    growth: 0,
  }

  /*
   * 逐条判断青少年的困难类别。
   */
  list.forEach((record) => {
    if (
      !record ||
      typeof record !== 'object'
    ) {
      return
    }

    /*
     * categoryUtils 中的 getCategoryGroup()
     * 返回的是数组，例如：
     *
     * ['重点托底类']
     *
     * 所以这里不能直接拿数组和字符串比较。
     *
     * 先取得第一个主要困难大类。
     */
    const groups =
      getCategoryGroup(
        record.categories,
        record.bigCategory,
      )

    const group =
      Array.isArray(groups)
        ? groups[0] || ''
        : groups || ''

    /*
     * 重点托底类。
     */
    if (
      group === '重点托底类'
    ) {
      statistics.top += 1
      return
    }

    /*
     * 常态关爱类。
     */
    if (
      group === '常态关爱类'
    ) {
      statistics.normal += 1
      return
    }

    /*
     * 成长托举类。
     */
    if (
      group === '成长托举类'
    ) {
      statistics.growth += 1
    }
  })

  return statistics
}

/**
 * 计算风险排查统计数据。
 *
 * 参数：
 * records
 * - 已经经过 normalizeRecord() 标准化后的青少年数组。
 *
 * 返回：
 * {
 *   hasRisk: 有风险人数，
 *   noRisk: 无风险人数，
 *   unchecked: 尚未排查人数，
 * }
 *
 * 风险状态的判断统一调用 riskUtils，
 * 避免 App.jsx 自己处理风险业务逻辑。
 */
function calculateRiskStatistics(
  records,
  getRiskFilterStatus,
) {
  /*
   * 防止传入的数据不是数组。
   */
  const list = Array.isArray(records)
    ? records
    : []

  /*
   * 初始化统计结果。
   */
  const statistics = {
    hasRisk: 0,
    noRisk: 0,
    unchecked: 0,
  }

  /*
   * 逐条统计风险状态。
   */
  list.forEach((record) => {
    if (
      !record ||
      typeof record !== 'object'
    ) {
      return
    }

    /*
     * riskUtils 中的 getRiskFilterStatus()
     * 会统一判断：
     *
     * 有风险
     * 无风险
     * 未排查
     */
    const status =
      getRiskFilterStatus(
        record,
      )

    if (
      status === '有风险'
    ) {
      statistics.hasRisk += 1
      return
    }

    if (
      status === '无风险'
    ) {
      statistics.noRisk += 1
      return
    }

    statistics.unchecked += 1
  })

  return statistics
}

/*
 * 对外导出统计函数。
 */
export {
  calculateStatistics,
  calculateRiskStatistics,
}