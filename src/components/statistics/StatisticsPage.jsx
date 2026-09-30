/**
 * =========================================================
 * 数据统计
 * =========================================================
 *
 * 页面结构：
 *
 *     1. 筛选区（与青少年信息页风格一致）
 *     2. 实时统计卡片
 *     3. 饼图：性别 / 困难大类 / 风险状态 / 帮扶需求
 *     4. 柱状图：乡镇分布、年龄段分布
 *     5. 折线图：按月 / 按季 / 按年 的增长趋势
 *
 * 数据来源：
 *
 *     allYouthData（App 已加载好的全量青少年数据）
 *
 * 所有统计都在前端内存里算，
 * 不额外请求后端，保证切换筛选条件时响应很快。
 * =========================================================
 */

import {
  useMemo,
  useState,
} from 'react'

import dayjs from 'dayjs'

import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Typography,
} from 'antd'

import {
  getRiskFilterStatus,
} from '../../utils/riskUtils'

import {
  allCategories,
  categoryGroups,
} from '../../utils/categoryUtils'

import { EChart } from './EChart'

import {
  useAuth,
} from '../../context/AuthContext'

const { Title, Text } = Typography

/**
 * 三大类配色。
 *
 * 必须与青少年信息页（App.css 的 dot 样式）
 * 完全一致：
 *
 *     重点托底类  #ff4d4f  红
 *     常态关爱类  #fadb14  黄
 *     成长托举类  #52c41a  绿
 */
const CATEGORY_COLOR = {
  重点托底类: '#ff4d4f',
  常态关爱类: '#fadb14',
  成长托举类: '#52c41a',
}

const GENDER_COLOR = {
  男: '#1677ff',
  女: '#eb2f96',
}

/**
 * 磁县全部乡镇 / 社区。
 *
 * 与帮扶管理页、青少年信息页保持同一套口径。
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
]

/**
 * 计算年龄。
 */
function calcAge(birthday) {
  if (!birthday) {
    return null
  }

  const date = new Date(birthday)

  if (isNaN(date.getTime())) {
    return null
  }

  const now = new Date()

  let age =
    now.getFullYear() -
    date.getFullYear()

  const monthDiff =
    now.getMonth() -
    date.getMonth()

  if (
    monthDiff < 0 ||
    (monthDiff === 0 &&
      now.getDate() <
        date.getDate())
  ) {
    age -= 1
  }

  return age
}

/**
 * 年龄段划分。
 *
 * 按业务口径统一为三段：
 *
 *     0-12周岁
 *     13-17周岁
 *     18-35周岁
 *
 * 其余归为“35周岁以上”。
 */
const AGE_GROUPS = [
  '0-12周岁',
  '13-17周岁',
  '18-35周岁',
  '35周岁以上',
  '未知',
]

function ageGroup(age) {
  if (age === null) {
    return '未知'
  }

  if (age <= 12) return '0-12周岁'
  if (age <= 17) return '13-17周岁'
  if (age <= 35) return '18-35周岁'

  return '35周岁以上'
}

/**
 * 从地址里提取乡镇 / 社区。
 *
 * 固定匹配磁县 12 个乡镇 / 社区，
 * 保证与帮扶管理页、青少年信息页一致。
 */
function extractTown(text) {
  if (!text) {
    return ''
  }

  const value = String(text)

  for (const town of TOWN_OPTIONS) {
    if (
      town !== '社区' &&
      value.includes(town)
    ) {
      return town
    }
  }

  if (value.includes('社区')) {
    return '社区'
  }

  return ''
}

/**
 * 取一条记录的“乡镇”归属。
 *
 * 统计页统一比对「归口单位」字段，
 * 与乡镇账号的数据隔离口径保持一致。
 *
 * 归口单位为空时退回按户籍地 / 常住地提取，
 * 保证历史数据也能统计到。
 */
function getTown(item) {
  const unit = item?.responsibleUnit

  if (unit) {
    return unit
  }

  return (
    extractTown(item?.residence) ||
    extractTown(item?.household) ||
    '未知'
  )
}

/**
 * 把任意时间值转成 YYYY-MM-DD。
 */
function toDateText(value) {
  if (!value) {
    return ''
  }

  const date = new Date(
    String(value).slice(0, 10),
  )

  if (isNaN(date.getTime())) {
    return ''
  }

  return String(value).slice(0, 10)
}

/**
 * 统计某一字段的取值分布。
 */
function countBy(list, getter) {
  const map = new Map()

  list.forEach((item) => {
    const key =
      getter(item) || '未知'

    map.set(
      key,
      (map.get(key) || 0) + 1,
    )
  })

  return [...map.entries()].sort(
    (a, b) => b[1] - a[1],
  )
}

/**
 * 通用饼图配置。
 */
function buildPieOption(
  title,
  data,
  colorMap,
) {
  /**
   * 名称 -> 人数，
   * 供 legend / 标签文字取数使用。
   */
  const countMap = new Map(
    data.map(
      ([name, value]) => [
        name,
        value,
      ],
    ),
  )

  const total = data.reduce(
    (sum, [, value]) =>
      sum + value,
    0,
  )

  return {
    title: {
      text: title,
      subtext:
        total > 0
          ? `总计 ${total} 人`
          : '暂无数据',
      left: 'center',
      top: 8,
      textStyle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#1f2d3d',
      },
      subtextStyle: {
        fontSize: 12,
        color: '#8c8c8c',
      },
    },
    tooltip: {
      trigger: 'item',
      formatter:
        '{b}：{c} 人（{d}%）',
    },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        fontSize: 12,
      },
      /**
       * 图例上也直接带上人数，
       * 不用悬停就能看到男女各多少人。
       */
      formatter: (name) => {
        const value =
          countMap.get(name) ?? 0

        return `${name} ${value}人`
      },
    },
    series: [
      {
        type: 'pie',
        radius: [
          '38%',
          '58%',
        ],
        center: [
          '50%',
          '52%',
        ],
        avoidLabelOverlap:
          true,
        /**
         * 占比过小的扇区也保留一点角度，
         * 避免标签被自动隐藏。
         */
        minAngle: 6,
        minShowLabelAngle: 0,
        itemStyle: {
          borderColor:
            '#ffffff',
          borderWidth: 2,
        },
        /**
         * 关键：显式打开标签，
         * 并把“名称 + 人数 + 百分比”都显示出来。
         */
        label: {
          show: true,
          position: 'outside',
          alignTo: 'edge',
          edgeDistance: 8,
          fontSize: 12,
          lineHeight: 16,
          color: '#1f2d3d',
          formatter: (
            params,
          ) =>
            `${params.name}\n${params.value}人 ${params.percent}%`,
        },
        labelLine: {
          show: true,
          length: 8,
          length2: 10,
        },
        /**
         * 悬停时加粗强调。
         */
        emphasis: {
          label: {
            show: true,
            fontSize: 13,
            fontWeight: 600,
          },
        },
        data: data.map(
          ([name, value]) => ({
            name,
            value,
            itemStyle: {
              color:
                colorMap?.[
                  name
                ],
            },
          }),
        ),
      },
    ],
  }
}

/**
 * 通用柱状图配置。
 */
function buildBarOption(
  title,
  data,
  color = '#1677ff',
) {
  return {
    title: {
      text: title,
      left: 'center',
      top: 8,
      textStyle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#1f2d3d',
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    grid: {
      left: 50,
      right: 24,
      bottom: 60,
      top: 50,
    },
    xAxis: {
      type: 'category',
      data: data.map(
        (item) => item[0],
      ),
      axisLabel: {
        interval: 0,
        rotate:
          data.length > 6
            ? 30
            : 0,
        fontSize: 11,
      },
    },
    yAxis: {
      type: 'value',
      name: '人数',
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 34,
        itemStyle: {
          color,
          borderRadius: [
            4,
            4,
            0,
            0,
          ],
        },
        data: data.map(
          (item) => item[1],
        ),
      },
    ],
  }
}

/**
 * 纵向对比图（趋势分析）配置。
 *
 * 产品经理视角定义的核心价值：
 *
 *     1. 累计曲线（折线）看“盘子有多大、在变大还是变小”
 *        —— 青少年总数 / 已结对 / 需帮扶 / 有风险
 *        四条累计线纵向对比，直观反映工作覆盖面的变化。
 *
 *     2. 月新增（柱状）看“每月净增量”
 *        —— 相邻周期累计之差，反映工作推进节奏，
 *        是增长 / 减少趋势最直接的风向标。
 *
 * 采用双 Y 轴：
 *     左轴 = 累计人数（折线）
 *     右轴 = 月新增（柱），量级小，单独轴才看得清。
 */
function buildTrendOption(points) {
  const labels = points.map(
    (item) => item.text,
  )

  const rotate =
    labels.length > 8 ? 30 : 0

  return {
    title: {
      text: '工作数据纵向对比（累计趋势 + 月新增）',
      left: 'center',
      top: 8,
      textStyle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#1f2d3d',
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
    },
    legend: {
      bottom: 0,
      data: [
        '青少年总数',
        '已结对帮扶',
        '需要帮扶',
        '存在风险',
        '月新增',
      ],
    },
    grid: {
      left: 56,
      right: 56,
      bottom: 64,
      top: 50,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: {
        fontSize: 11,
        interval: 0,
        rotate,
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '累计人数',
        position: 'left',
      },
      {
        type: 'value',
        name: '月新增',
        position: 'right',
        splitLine: {
          show: false,
        },
      },
    ],
    series: [
      {
        name: '月新增',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 28,
        itemStyle: {
          color: '#91caff',
          borderRadius: [
            4,
            4,
            0,
            0,
          ],
        },
        data: points.map(
          (item) => item.newCount || 0,
        ),
      },
      {
        name: '青少年总数',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2.5,
        },
        itemStyle: {
          color: '#1677ff',
        },
        data: points.map(
          (item) => item.total || 0,
        ),
      },
      {
        name: '已结对帮扶',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
        },
        itemStyle: {
          color: '#52c41a',
        },
        data: points.map(
          (item) =>
            item.paired || 0,
        ),
      },
      {
        name: '需要帮扶',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
        },
        itemStyle: {
          color: '#fa8c16',
        },
        data: points.map(
          (item) =>
            item.needHelp || 0,
        ),
      },
      {
        name: '存在风险',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
        },
        itemStyle: {
          color: '#ff4d4f',
        },
        data: points.map(
          (item) =>
            item.hasRisk || 0,
        ),
      },
    ],
  }
}

export function StatisticsPage({
  allYouthData = [],
  loading = false,
}) {
  /**
   * =====================================================
   * 登录账号
   * =====================================================
   *
   * 乡镇账号：
   *
   *     1. 不显示“乡镇”下拉菜单
   *     2. 所有统计结果本来就只有本乡镇的数据
   *        （后端已按归口单位过滤）
   *
   * 县级账号与管理员：
   *
   *     显示完整功能，包括乡镇下拉。
   */

  const { user } = useAuth()

  const isTownAccount =
    user?.role === 'town'

  /**
   * =====================================================
   * 筛选条件
   * =====================================================
   */
  const [
    searchText,
    setSearchText,
  ] = useState('')

  const [
    genderFilter,
    setGenderFilter,
  ] = useState('全部')

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState('全部')

  const [
    helpFilter,
    setHelpFilter,
  ] = useState('全部')

  const [
    riskFilter,
    setRiskFilter,
  ] = useState('全部')

  const [
    townFilter,
    setTownFilter,
  ] = useState('全部')

  /**
   * 困难小类。
   */
  const [
    smallCategoryFilter,
    setSmallCategoryFilter,
  ] = useState('全部')

  /**
   * 是否结对帮扶。
   */
  const [
    pairedFilter,
    setPairedFilter,
  ] = useState('全部')

  /**
   * 年龄区间。
   */
  const [ageMin, setAgeMin] =
    useState(null)

  const [ageMax, setAgeMax] =
    useState(null)

  /**
   * 趋势粒度：月 / 季 / 年
   */
  const [
    trendUnit,
    setTrendUnit,
  ] = useState('月')

  /**
   * 纵向对比的起止日期。
   *
   * 默认最近半年到今天。
   */
  const [
    startDate,
    setStartDate,
  ] = useState(() =>
    dayjs().subtract(6, 'month'),
  )

  const [endDate, setEndDate] =
    useState(() => dayjs())

  /**
   * 乡镇下拉选项。
   *
   * 比对「归口单位」：只列出当前数据里
   * 实际出现的归口单位（管理员 / 县级是全量，
   * 乡镇账号只会看到本账号所属的归口单位）。
   */
  const townOptions = useMemo(
    () => {
      const present = Array.from(
        new Set(
          allYouthData
            .map((item) => item.responsibleUnit)
            .filter(Boolean),
        ),
      )

      const base =
        present.length > 0
          ? present
          : TOWN_OPTIONS

      return base
    },
    [allYouthData],
  )

  /**
   * 困难小类下拉选项。
   */
  const smallCategoryOptions =
    useMemo(
      () => [
        '全部',
        ...allCategories,
      ],
      [],
    )

  /**
   * 重置全部筛选。
   */
  function resetFilters() {
    setSearchText('')
    setGenderFilter('全部')
    setCategoryFilter('全部')
    setSmallCategoryFilter('全部')
    setHelpFilter('全部')
    setPairedFilter('全部')
    setRiskFilter('全部')
    setTownFilter('全部')
    setAgeMin(null)
    setAgeMax(null)
    setStartDate(
      dayjs().subtract(6, 'month'),
    )
    setEndDate(dayjs())
  }

  /**
   * =====================================================
   * 筛选后的数据
   * =====================================================
   */
  const filtered =
    useMemo(() => {
      const keyword =
        searchText.trim()

      return allYouthData.filter(
        (item) => {
          if (
            keyword &&
            !`${item.name || ''}${
              item.household || ''
            }${
              item.residence || ''
            }`.includes(keyword)
          ) {
            return false
          }

          if (
            genderFilter !==
              '全部' &&
            item.gender !==
              genderFilter
          ) {
            return false
          }

          if (
            categoryFilter !==
              '全部' &&
            item.bigCategory !==
              categoryFilter
          ) {
            return false
          }

          if (
            helpFilter !==
              '全部' &&
            item.helpRequired !==
              helpFilter
          ) {
            return false
          }

          if (
            riskFilter !==
            '全部'
          ) {
            const status =
              getRiskFilterStatus(
                item,
              )

            if (
              status !==
              riskFilter
            ) {
              return false
            }
          }

          /**
           * 困难小类。
           *
           * 一个人可能有多个小类，
           * 这里按“包含”匹配。
           */
          if (
            smallCategoryFilter !==
              '全部' &&
            !String(
              item.categories ||
                '',
            ).includes(
              smallCategoryFilter,
            )
          ) {
            return false
          }

          /**
           * 是否结对帮扶。
           */
          if (
            pairedFilter !==
              '全部'
          ) {
            const paired =
              item.pairing === '是'
                ? '是'
                : '否'

            if (
              paired !==
              pairedFilter
            ) {
              return false
            }
          }

          /**
           * 年龄区间。
           */
          if (
            ageMin !==
              null &&
            ageMin !==
              undefined
          ) {
            const age =
              calcAge(
                item.birthday,
              )

            if (
              age === null ||
              age < ageMin
            ) {
              return false
            }
          }

          if (
            ageMax !==
              null &&
            ageMax !==
              undefined
          ) {
            const age =
              calcAge(
                item.birthday,
              )

            if (
              age === null ||
              age > ageMax
            ) {
              return false
            }
          }

          /**
           * 乡镇按“常住地”口径比对。
           */
          if (
            townFilter !==
              '全部' &&
            getTown(item) !==
              townFilter
          ) {
            return false
          }

          return true
        },
      )
    }, [
      allYouthData,
      searchText,
      genderFilter,
      categoryFilter,
      smallCategoryFilter,
      helpFilter,
      pairedFilter,
      riskFilter,
      townFilter,
      ageMin,
      ageMax,
    ])

  /**
   * =====================================================
   * 概览统计
   * =====================================================
   */
  const overview =
    useMemo(() => {
      let male = 0
      let female = 0
      let needHelp = 0
      let hasRisk = 0

      const categories =
        new Map()

      filtered.forEach(
        (item) => {
          if (
            item.gender === '男'
          ) {
            male += 1
          }

          if (
            item.gender === '女'
          ) {
            female += 1
          }

          if (
            item.helpRequired ===
            '是'
          ) {
            needHelp += 1
          }

          if (
            getRiskFilterStatus(
              item,
            ) === '有风险'
          ) {
            hasRisk += 1
          }

          const key =
            item.bigCategory ||
            '未知'

          categories.set(
            key,
            (categories.get(
              key,
            ) || 0) + 1,
          )
        },
      )

      return {
        total:
          filtered.length,
        male,
        female,
        needHelp,
        hasRisk,
        categories: [
          ...categories.entries(),
        ],
      }
    }, [filtered])

  /**
   * =====================================================
   * 图表数据
   * =====================================================
   */
  const genderData =
    useMemo(
      () =>
        countBy(
          filtered,
          (item) =>
            item.gender,
        ),
      [filtered],
    )

  const categoryData =
    useMemo(
      () =>
        countBy(
          filtered,
          (item) =>
            item.bigCategory,
        ),
      [filtered],
    )

  const riskData =
    useMemo(
      () =>
        countBy(
          filtered,
          (item) =>
            getRiskFilterStatus(
              item,
            ),
        ),
      [filtered],
    )

  const helpData =
    useMemo(
      () =>
        countBy(
          filtered,
          (item) =>
            item.helpRequired ===
            '是'
              ? '需要帮扶'
              : '暂不需要',
        ),
      [filtered],
    )

  const townData =
    useMemo(
      () =>
        countBy(
          filtered,
          (item) =>
            getTown(item),
        ).slice(0, 12),
      [filtered],
    )

  const ageData =
    useMemo(() => {
      const order = AGE_GROUPS

      const map = new Map(
        countBy(
          filtered,
          (item) =>
            ageGroup(
              calcAge(
                item.birthday,
              ),
            ),
        ),
      )

      return order
        .filter((key) =>
          map.has(key),
        )
        .map((key) => [
          key,
          map.get(key),
        ])
    }, [filtered])

  /**
   * =====================================================
   * 按日期纵向对比
   * =====================================================
   *
   * 每一条青少年数据都带“数据时间戳”（建档时间）。
   *
   * “某个日期截止时的数据”
   * 就是取
   *
   *     数据时间戳 <= 该日期
   *
   * 的全部记录，
   * 据此画出各周期累计曲线与相邻周期净新增。
   */

  /**
   * 起始日期 -> 截止日期 的时间点序列。
   */
  const timeline = useMemo(() => {
    if (!startDate || !endDate) {
      return []
    }

    let start = dayjs(startDate)
    let end = dayjs(endDate)

    if (end.isBefore(start)) {
      const temp = start
      start = end
      end = temp
    }

    const points = []
    let cursor = start

    /**
     * 最多 24 个点，避免图表挤成一团。
     */
    for (let i = 0; i < 24; i += 1) {
      points.push(cursor)

      const next =
        trendUnit === '月'
          ? cursor.add(1, 'month')
          : trendUnit === '季'
            ? cursor.add(3, 'month')
            : cursor.add(1, 'year')

      if (next.isAfter(end)) {
        break
      }

      cursor = next
    }

    const last =
      points[points.length - 1]

    if (
      !last ||
      !last.isSame(end, 'day')
    ) {
      points.push(end)
    }

    return points.map((item) =>
      item.format('YYYY-MM-DD'),
    )
  }, [startDate, endDate, trendUnit])

  /**
   * 每个时间点的数据快照，
   * 以及首（起始）尾（截止）对比。
   *
   * 这是“纵向对比”的核心：
   *
   *     按时间轴（月 / 季 / 年）取每个周期截止时的
   *     累计快照，再算相邻周期的净新增，
   *     从而得到“数据增长 / 减少趋势”。
   *
   * 时间维度来自每条青少年记录的
   * 「数据时间戳」（建档时间），
   * 后端在为空时退化为 CreatedAt。
   */
  const comparison = useMemo(() => {
    if (!timeline.length) {
      return {
        points: [],
        start: null,
        end: null,
      }
    }

    /**
     * 取“截止到 dateText（含）”这一刻的累计快照。
     *
     * 没有时间戳的记录不参与历史快照
     * （视为“尚未建档”，只在最新节点可能被计入）。
     */
    const snapshotAt = (
      dateText,
    ) => {
      const list =
        filtered.filter(
          (item) => {
            const stamp =
              toDateText(
                item.timestamp,
              )

            if (!stamp) {
              return false
            }

            return (
              stamp <= dateText
            )
          },
        )

      let needHelp = 0
      let paired = 0
      let hasRisk = 0

      list.forEach(
        (item) => {
          if (
            item.helpRequired ===
            '是'
          ) {
            needHelp += 1
          }

          if (
            item.pairing ===
            '是'
          ) {
            paired += 1
          }

          if (
            getRiskFilterStatus(
              item,
            ) === '有风险'
          ) {
            hasRisk += 1
          }
        },
      )

      return {
        total:
          list.length,
        needHelp,
        paired,
        hasRisk,
      }
    }

    /**
     * 周期截止日：
     * 月 -> 月末；季 -> 季末；年 -> 年末。
     */
    const periodEnd = (
      text,
    ) => {
      const d = dayjs(text)

      const end =
        trendUnit === '季'
          ? d.endOf('quarter')
          : trendUnit === '年'
            ? d.endOf('year')
            : d.endOf('month')

      return end.format(
        'YYYY-MM-DD',
      )
    }

    /**
     * 周期显示标签。
     */
    const periodLabel = (
      text,
    ) => {
      const d = dayjs(text)

      if (
        trendUnit === '季'
      ) {
        return (
          d.year() +
          '-Q' +
          d.quarter()
        )
      }

      if (
        trendUnit === '年'
      ) {
        return String(
          d.year(),
        )
      }

      return d.format(
        'YYYY-MM',
      )
    }

    const points =
      timeline.map(
        (text, index) => {
          const end =
            periodEnd(text)
          const snap =
            snapshotAt(end)

          const prevEnd =
            index > 0
              ? periodEnd(
                  timeline[
                    index - 1
                  ],
                )
              : null

          const prevTotal =
            prevEnd
              ? snapshotAt(
                  prevEnd,
                ).total
              : 0

          return {
            text: periodLabel(
              text,
            ),
            raw: end,
            newCount:
              snap.total -
              prevTotal,
            ...snap,
          }
        },
      )

    return {
      points,
      start: points[0],
      end: points[
        points.length - 1
      ],
    }
  }, [
    timeline,
    filtered,
    trendUnit,
  ])

  /**
   * 图表配置。
   */
  const genderChart =
    useMemo(
      () =>
        buildPieOption(
          '性别占比',
          genderData,
          GENDER_COLOR,
        ),
      [genderData],
    )

  const categoryChart =
    useMemo(
      () =>
        buildPieOption(
          '困难大类占比',
          categoryData,
          CATEGORY_COLOR,
        ),
      [categoryData],
    )

  const riskChart =
    useMemo(
      () =>
        buildPieOption(
          '风险状态占比',
          riskData,
          {
            有风险:
              '#ff4d4f',
            无风险:
              '#52c41a',
            未排查:
              '#bfbfbf',
          },
        ),
      [riskData],
    )

  const helpChart =
    useMemo(
      () =>
        buildPieOption(
          '帮扶需求占比',
          helpData,
          {
            需要帮扶:
              '#fa8c16',
            暂不需要:
              '#1677ff',
          },
        ),
      [helpData],
    )

  const townChart =
    useMemo(
      () =>
        townData.length
          ? buildBarOption(
              '乡镇分布 TOP15',
              townData,
            )
          : null,
      [townData],
    )

  const ageChart =
    useMemo(
      () =>
        ageData.length
          ? buildBarOption(
              '年龄段分布',
              ageData,
              '#722ed1',
            )
          : null,
      [ageData],
    )

  const compareChart =
    useMemo(
      () =>
        comparison.points.length
          ? buildTrendOption(
              comparison.points,
            )
          : null,
      [comparison],
    )

  /**
   * 纵向对比核心指标卡：
   *
   *     累计总数 / 本期新增 / 帮扶覆盖率 /
   *     有风险数 / 环比增长。
   *
   * 用最新周期与上一周期算“环比”，
   * 直观回答“数据是增长还是减少”。
   */
  const trendSummary = useMemo(() => {
    const points = comparison.points

    if (points.length === 0) {
      return null
    }

    const last =
      points[points.length - 1]
    const prev =
      points.length > 1
        ? points[points.length - 2]
        : null

    const total = last.total || 0
    const paired = last.paired || 0
    const hasRisk = last.hasRisk || 0

    const prevTotal =
      prev?.total || 0

    const momRate =
      prevTotal > 0
        ? ((total - prevTotal) /
            prevTotal) *
          100
        : null

    const coverageRate =
      total > 0
        ? (paired / total) * 100
        : 0

    return {
      total,
      newCount: last.newCount || 0,
      coverageRate,
      hasRisk,
      momRate,
    }
  }, [comparison])

  /**
   * 起始 / 截止 两个时间点的指标变化。
   */
  const compareMetrics = useMemo(() => {
    const start =
      comparison.start
    const end = comparison.end

    if (!start || !end) {
      return []
    }

    return [
      {
        label: '青少年总数',
        key: 'total',
        color: '#1677ff',
      },
      {
        label: '需要帮扶',
        key: 'needHelp',
        color: '#fa8c16',
      },
      {
        label: '已结对帮扶',
        key: 'paired',
        color: '#52c41a',
      },
      {
        label: '存在风险',
        key: 'hasRisk',
        color: '#ff4d4f',
      },
    ].map((metric) => ({
      ...metric,
      from: start[metric.key] || 0,
      to: end[metric.key] || 0,
      diff:
        (end[metric.key] || 0) -
        (start[metric.key] || 0),
    }))
  }, [comparison])

  if (loading) {
    return (
      <div
        style={{
          padding: 60,
          textAlign:
            'center',
        }}
      >
        <Spin
          size="large"
          tip="数据加载中"
        />
      </div>
    )
  }

  return (
    <div
      className="page-container"
      style={{
        padding: 20,
        overflowY:
          'auto',
        height:
          '100%',
      }}
    >
      <Title
        level={4}
        style={{
          marginTop: 0,
        }}
      >
        数据统计
      </Title>

      {/*
       * ==========================================
       * 筛选区
       * ==========================================
       */}
      <Card
        size="small"
        style={{
          marginBottom: 16,
        }}
      >
        <Space
          wrap
          size={12}
        >
          <Input.Search
            allowClear
            placeholder="姓名 / 户籍地"
            style={{
              width: 200,
            }}
            value={
              searchText
            }
            onChange={(
              event,
            ) =>
              setSearchText(
                event.target
                  .value,
              )
            }
          />

          <Select
            value={
              genderFilter
            }
            onChange={
              setGenderFilter
            }
            style={{
              width: 110,
            }}
            options={[
              '全部',
              '男',
              '女',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '性别：全部'
                    : item,
                value: item,
              }),
            )}
          />

          <Select
            value={
              categoryFilter
            }
            onChange={
              setCategoryFilter
            }
            style={{
              width: 150,
            }}
            options={[
              '全部',
              '重点托底类',
              '常态关爱类',
              '成长托举类',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '困难大类：全部'
                    : item,
                value: item,
              }),
            )}
          />

          <Select
            value={
              helpFilter
            }
            onChange={
              setHelpFilter
            }
            style={{
              width: 150,
            }}
            options={[
              '全部',
              '是',
              '否',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '需要帮扶：全部'
                    : item ===
                      '是'
                    ? '需要帮扶'
                    : '暂不需要',
                value: item,
              }),
            )}
          />

          <Select
            value={
              riskFilter
            }
            onChange={
              setRiskFilter
            }
            style={{
              width: 150,
            }}
            options={[
              '全部',
              '有风险',
              '无风险',
              '未排查',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '风险状态：全部'
                    : item,
                value: item,
              }),
            )}
          />

          {!isTownAccount && (
            <Select
              value={
                townFilter
              }
              onChange={
                setTownFilter
              }
              showSearch
              style={{
                width: 150,
              }}
              options={[
                '全部',
                ...townOptions,
              ].map(
                (item) => ({
                  label:
                    item ===
                    '全部'
                      ? '乡镇：全部'
                      : item,
                  value: item,
                }),
              )}
            />
          )}

          <Select
            value={
              pairedFilter
            }
            onChange={
              setPairedFilter
            }
            style={{
              width: 160,
            }}
            options={[
              '全部',
              '是',
              '否',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '是否结对：全部'
                    : item ===
                      '是'
                    ? '已结对帮扶'
                    : '未结对帮扶',
                value: item,
              }),
            )}
          />

          <Select
            showSearch
            value={
              smallCategoryFilter
            }
            onChange={
              setSmallCategoryFilter
            }
            style={{
              width: 200,
            }}
            options={smallCategoryOptions.map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '困难小类：全部'
                    : item,
                value: item,
              }),
            )}
          />

          <span
            style={{
              display:
                'inline-flex',
              alignItems:
                'center',
              gap: 4,
            }}
          >
            <Text
              type="secondary"
            >
              年龄
            </Text>

            <InputNumber
              min={0}
              max={120}
              placeholder="起始"
              style={{
                width: 80,
              }}
              value={
                ageMin
              }
              onChange={
                setAgeMin
              }
            />

            <Text
              type="secondary"
            >
              -
            </Text>

            <InputNumber
              min={0}
              max={120}
              placeholder="截止"
              style={{
                width: 80,
              }}
              value={
                ageMax
              }
              onChange={
                setAgeMax
              }
            />

            <Text
              type="secondary"
            >
              周岁
            </Text>
          </span>

          <Button
            onClick={
              resetFilters
            }
          >
            重置
          </Button>
        </Space>
      </Card>

      {/*
       * ==========================================
       * 实时统计
       * ==========================================
       */}
      <Row
        gutter={12}
        style={{
          marginBottom: 16,
        }}
      >
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="共计"
              value={
                overview.total
              }
              suffix="人"
              styles={{ content: { color: '#1677ff' } }}
            />
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="男性"
              value={
                overview.male
              }
              suffix="人"
            />
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="女性"
              value={
                overview.female
              }
              suffix="人"
            />
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="需要帮扶"
              value={
                overview.needHelp
              }
              suffix="人"
              styles={{ content: { color: '#fa8c16' } }}
            />
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="存在风险"
              value={
                overview.hasRisk
              }
              suffix="人"
              styles={{ content: { color: '#ff4d4f' } }}
            />
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="乡镇数量"
              value={
                townData.filter(
                  (
                    item,
                  ) =>
                    item[0] !==
                      '未知' &&
                    item[0] !==
                      '其他',
                ).length
              }
              suffix="个"
            />
          </Card>
        </Col>
      </Row>

      {/*
       * ==========================================
       * 饼图区
       * ==========================================
       */}
      <Row
        gutter={12}
        style={{
          marginBottom: 16,
        }}
      >
        <Col span={6}>
          <Card size="small">
            {genderData.length ? (
              <EChart
                option={
                  genderChart
                }
                height={
                  300
                }
              />
            ) : (
              <Empty />
            )}
          </Card>
        </Col>

        <Col span={6}>
          <Card size="small">
            {categoryData.length ? (
              <EChart
                option={
                  categoryChart
                }
                height={
                  300
                }
              />
            ) : (
              <Empty />
            )}
          </Card>
        </Col>

        <Col span={6}>
          <Card size="small">
            {riskData.length ? (
              <EChart
                option={
                  riskChart
                }
                height={
                  300
                }
              />
            ) : (
              <Empty />
            )}
          </Card>
        </Col>

        <Col span={6}>
          <Card size="small">
            {helpData.length ? (
              <EChart
                option={
                  helpChart
                }
                height={
                  300
                }
              />
            ) : (
              <Empty />
            )}
          </Card>
        </Col>
      </Row>

      {/*
       * ==========================================
       * 柱状图区
       * ==========================================
       */}
      <Row
        gutter={12}
        style={{
          marginBottom: 16,
        }}
      >
        <Col span={12}>
          <Card size="small">
            {townChart ? (
              <EChart
                option={
                  townChart
                }
                height={
                  320
                }
              />
            ) : (
              <Empty />
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card size="small">
            {ageChart ? (
              <EChart
                option={
                  ageChart
                }
                height={
                  320
                }
              />
            ) : (
              <Empty />
            )}
          </Card>
        </Col>
      </Row>

      {/*
       * ==========================================
       * 趋势图
       * ==========================================
       */}
      <Card
        size="small"
        title={
          <Space>
            <span>
              工作趋势（按日期纵向对比）
            </span>

            <Segmented
              size="small"
              value={
                trendUnit
              }
              onChange={
                setTrendUnit
              }
              options={[
                '月',
                '季',
                '年',
              ]}
            />
          </Space>
        }
      >
        {/*
         * 起止日期选择器。
         *
         * 与上面的性别、是否帮扶、乡镇等条件
         * 可以同时生效：
         * 先按条件筛人，
         * 再按日期取快照做纵向对比。
         */}
        <Space
          wrap
          size={12}
          style={{
            marginBottom: 12,
          }}
        >
          <span
            style={{
              display:
                'inline-flex',
              alignItems:
                'center',
              gap: 6,
            }}
          >
            <Text
              type="secondary"
            >
              起始日期
            </Text>

            <DatePicker
              allowClear={
                false
              }
              value={
                startDate
              }
              onChange={
                setStartDate
              }
              style={{
                width: 150,
              }}
            />
          </span>

          <span
            style={{
              display:
                'inline-flex',
              alignItems:
                'center',
              gap: 6,
            }}
          >
            <Text
              type="secondary"
            >
              截止日期
            </Text>

            <DatePicker
              allowClear={
                false
              }
              value={
                endDate
              }
              onChange={
                setEndDate
              }
              style={{
                width: 150,
              }}
            />
          </span>
        </Space>

        {/*
         * 纵向对比核心指标卡：
         * 累计总数 / 本期新增 / 帮扶覆盖率 /
         * 有风险数 / 环比增长。
         */}
        {trendSummary ? (
          <Row
            gutter={12}
            style={{
              marginBottom: 12,
            }}
          >
            <Col span={trendSummary.momRate ===
              null
              ? 6
              : 5}
            >
              <Card size="small">
                <Statistic
                  title="累计青少年总数"
                  value={
                    trendSummary.total
                  }
                  suffix="人"
                  valueStyle={{
                    color: '#1677ff',
                  }}
                />
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                  }}
                >
                  截止最新周期
                </Text>
              </Card>
            </Col>

            <Col span={trendSummary.momRate ===
              null
              ? 6
              : 5}
            >
              <Card size="small">
                <Statistic
                  title="本期新增"
                  value={
                    trendSummary.newCount
                  }
                  suffix="人"
                  valueStyle={{
                    color: '#91caff',
                  }}
                />
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                  }}
                >
                  相邻周期净增量
                </Text>
              </Card>
            </Col>

            <Col span={trendSummary.momRate ===
              null
              ? 6
              : 5}
            >
              <Card size="small">
                <Statistic
                  title="帮扶覆盖率"
                  value={
                    trendSummary.coverageRate.toFixed(
                      1,
                    )
                  }
                  suffix="%"
                  valueStyle={{
                    color: '#52c41a',
                  }}
                />
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                  }}
                >
                  已结对 / 总数
                </Text>
              </Card>
            </Col>

            <Col span={trendSummary.momRate ===
              null
              ? 6
              : 5}
            >
              <Card size="small">
                <Statistic
                  title="存在风险"
                  value={
                    trendSummary.hasRisk
                  }
                  suffix="人"
                  valueStyle={{
                    color: '#ff4d4f',
                  }}
                />
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                  }}
                >
                  需重点跟进
                </Text>
              </Card>
            </Col>

            {trendSummary.momRate !==
            null ? (
              <Col span={4}>
                <Card size="small">
                  <Statistic
                    title="环比增长"
                    value={
                      trendSummary.momRate.toFixed(
                        1,
                      )
                    }
                    suffix="%"
                    valueStyle={{
                      color:
                        trendSummary.momRate >=
                        0
                          ? '#52c41a'
                          : '#ff4d4f',
                    }}
                  />
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 12,
                    }}
                  >
                    较上一周期
                  </Text>
                </Card>
              </Col>
            ) : null}
          </Row>
        ) : null}

        {/*
         * 起始 vs 截止 的关键指标变化。
         */}
        {compareChart ? (
          <Row
            gutter={12}
            style={{
              marginBottom: 12,
            }}
          >
            {compareMetrics.map(
              (metric) => (
                <Col
                  span={6}
                  key={
                    metric.key
                  }
                >
                  <Card
                    size="small"
                  >
                    <Statistic
                      title={
                        metric.label
                      }
                      value={
                        metric.to
                      }
                      suffix="人"
                      styles={{
                        content:
                          {
                            color:
                              metric.color,
                          },
                      }}
                    />

                    <Text
                      type="secondary"
                      style={{
                        fontSize: 12,
                      }}
                    >
                      起始
                      {
                        metric.from
                      }
                      {' '}
                      人，
                      {metric.diff >=
                      0
                        ? '增加'
                        : '减少'}
                      {' '}
                      {Math.abs(
                        metric.diff,
                      )}{' '}
                      人
                    </Text>
                  </Card>
                </Col>
              ),
            )}
          </Row>
        ) : null}

        {compareChart ? (
          <EChart
            option={
              compareChart
            }
            height={340}
          />
        ) : (
          <Empty description="当前筛选条件下暂无时间数据" />
        )}

        <Text
          type="secondary"
          style={{
            fontSize: 12,
          }}
        >
          纵向对比基于每条青少年记录的「建档时间（数据时间戳）」：
          折线为各周期截止时的累计人数，柱为相邻周期净新增，
          可直观看出数据增长 / 减少趋势。起始、截止日期
          可与上方所有筛选条件同时生效。
        </Text>
      </Card>
    </div>
  )
}
