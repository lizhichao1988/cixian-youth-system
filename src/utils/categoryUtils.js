/*
 * 困难类别工具
 *
 * 本文件专门负责：
 *
 * 1. 保存系统目前使用的三大困难类别及全部困难小类。
 * 2. 统一处理困难类别文字。
 * 3. 从 NocoDB 多对多关系数据中提取困难小类。
 * 4. 判断一名青少年属于哪个困难大类。
 * 5. 判断“是否需要帮扶”字段。
 * 6. 为筛选、列表、详情页和编辑页提供统一的数据方法。
 *
 * 注意：
 * 本文件只负责数据处理，不负责页面显示。
 */

import {
  firstDefined,
  getObjectText,
} from './youthUtils'

/* =========================================================
   三大困难类别
   ========================================================= */

const categoryGroups = {
  重点托底类: [
    '孤儿',
    '事实无人抚养儿童',
    '残疾青少年',
    '脱贫户、防返贫监测户、低保家庭、特困供养家庭子女',
    '乡村寄宿儿童、农村留守儿童',
    '社区矫正未成年人、观护帮教未成年人、专门学校未成年人',
    '服刑和强制隔离戒毒人员未成年子女',
    '因灾致困',
    '因病致困',
    '因意外致困',
    '心理困境型',
    '其他特殊困难型',
  ],

  常态关爱类: [
    '监护缺失型',
    '流动儿童中生活、就医、就学存在困难的群体',
    '心理亚健康与精神生活匮乏',
    '新就业群体青年',
    '其他需要常态化关注的青少年群体',
  ],

  成长托举类: [
    '就业方面（聚焦离校未就业高校毕业生）',
    '婚恋方面',
    '住房方面',
    '社会融入方面',
    '权益保障方面',
    '其他方面',
  ],
}

/* =========================================================
   所有困难小类
   ========================================================= */

const allCategories = Object.values(
  categoryGroups,
).flat()

/* =========================================================
   困难类别文字标准化
   ========================================================= */

function normalizeCategoryText(value) {
  return String(value ?? '')
    .replace(/[，,]/g, '，')
    .replace(/[；;]/g, '；')
    .replace(/[|]/g, '；')
    .replace(/\s+/g, '')
    .trim()
}

/* =========================================================
   是否需要帮扶文字标准化
   ========================================================= */

/*
 * 统一处理“是否需要帮扶”字段。
 *
 * 数据库中可能出现：
 *
 * 是
 * 否
 * 需要
 * 不需要
 * true
 * false
 * yes
 * no
 * 1
 * 0
 *
 * 以及 NocoDB 返回的对象、数组等形式。
 *
 * 最终统一返回：
 *
 * “是”
 * “否”
 * 或空字符串。
 */
function normalizeHelpRequired(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return ''
  }

  /*
   * 布尔值。
   */
  if (
    typeof value === 'boolean'
  ) {
    return value ? '是' : '否'
  }

  /*
   * 数组。
   *
   * 某些 NocoDB 字段可能被包装成数组。
   */
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return ''
    }

    return normalizeHelpRequired(
      value[0],
    )
  }

  /*
   * 对象。
   *
   * NocoDB 的单选字段有可能返回：
   *
   * {
   *   label: '是',
   *   value: '是'
   * }
   */
  if (
    typeof value === 'object'
  ) {
    const nestedValue =
      firstDefined(
        value.label,
        value.value,
        value.值,
        value.name,
        value.名称,
        value.title,
        value.text,
        value.display_value,
        value.displayValue,
        '',
      )

    if (
      nestedValue !== '' &&
      nestedValue !== null &&
      nestedValue !== undefined
    ) {
      return normalizeHelpRequired(
        nestedValue,
      )
    }

    const objectText =
      getObjectText(value)

    if (objectText) {
      return normalizeHelpRequired(
        objectText,
      )
    }

    return ''
  }

  const text =
    String(value)
      .trim()
      .toLowerCase()

  if (!text) {
    return ''
  }

  /*
   * “是”的各种可能写法。
   */
  if (
    text === '是' ||
    text === '需要' ||
    text === '需要帮扶' ||
    text === '需帮扶' ||
    text === 'yes' ||
    text === 'true' ||
    text === '1' ||
    text === 'y'
  ) {
    return '是'
  }

  /*
   * “否”的各种可能写法。
   */
  if (
    text === '否' ||
    text === '不需要' ||
    text === '不需要帮扶' ||
    text === '无需帮扶' ||
    text === '无需' ||
    text === 'no' ||
    text === 'false' ||
    text === '0' ||
    text === 'n'
  ) {
    return '否'
  }

  /*
   * 有些数据可能是：
   *
   * 是否需要帮扶：是
   * 是否需要帮扶=是
   */
  const normalizedText =
    text
      .replace(/：/g, ':')
      .replace(/；/g, ';')
      .replace(/，/g, ',')

  const yesPatterns = [
    '是否需要帮扶:是',
    '是否需帮扶:是',
    '需要帮扶:是',
    '是否需要帮扶=是',
    '是否需帮扶=是',
    '需要帮扶=是',
  ]

  const noPatterns = [
    '是否需要帮扶:否',
    '是否需帮扶:否',
    '需要帮扶:否',
    '是否需要帮扶=否',
    '是否需帮扶=否',
    '需要帮扶=否',
  ]

  if (
    yesPatterns.some(
      (pattern) =>
        normalizedText.includes(
          pattern,
        ),
    )
  ) {
    return '是'
  }

  if (
    noPatterns.some(
      (pattern) =>
        normalizedText.includes(
          pattern,
        ),
    )
  ) {
    return '否'
  }

  /*
   * 如果无法判断，则原样返回。
   *
   * 这样不会把未知数据强行判断成“是”或“否”。
   */
  return String(value).trim()
}

/* =========================================================
   提取困难小类
   ========================================================= */

function getCategoryItems(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return []
  }

  /*
   * 数组。
   */
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (
          item &&
          typeof item === 'object'
        ) {
          const text =
            firstDefined(
              item.name,
              item.名称,
              item.小类名称,
              item.value,
              item.值,
              item.display_value,
              item.displayValue,
              '',
            )

          return text
            ? [String(text)]
            : []
        }

        return item
          ? [String(item)]
          : []
      })
      .map(
        normalizeCategoryText,
      )
      .filter(Boolean)
  }

  /*
   * 对象。
   */
  if (
    typeof value === 'object'
  ) {
    const text =
      getObjectText(value)

    return text
      ? [
          normalizeCategoryText(
            text,
          ),
        ]
      : []
  }

  /*
   * 普通字符串。
   */
  const text =
    normalizeCategoryText(value)

  return text ? [text] : []
}

/* =========================================================
   困难类别筛选
   ========================================================= */

function categoryMatchesFilter(
  categories,
  filter,
) {
  const normalizedFilter =
    normalizeCategoryText(filter)

  /*
   * 没有选择困难小类，
   * 默认全部通过。
   */
  if (!normalizedFilter) {
    return true
  }

  const categoryItems =
    getCategoryItems(categories)

  /*
   * 直接匹配。
   */
  if (
    categoryItems.some(
      (item) =>
        item === normalizedFilter,
    )
  ) {
    return true
  }

  /*
   * 历史数据可能是组合字符串。
   */
  const combinedText =
    normalizeCategoryText(
      categories,
    )

  if (!combinedText) {
    return false
  }

  const combinedParts =
    combinedText
      .split(/[；;|]/)
      .map(
        normalizeCategoryText,
      )
      .filter(Boolean)

  if (
    combinedParts.includes(
      normalizedFilter,
    )
  ) {
    return true
  }

  /*
   * 最后再检查一次提取结果。
   */
  return categoryItems.some(
    (item) =>
      item === normalizedFilter,
  )
}

/* =========================================================
   获取困难小类显示文字
   ========================================================= */

function getCategoryValue(
  categories,
) {
  if (!categories) {
    return ''
  }

  /*
   * 多对多关系通常是数组。
   */
  if (Array.isArray(categories)) {
    const values =
      categories
        .map((item) => {
          if (
            item &&
            typeof item ===
              'object'
          ) {
            return firstDefined(
              item.name,
              item.名称,
              item.小类名称,
              item.value,
              item.值,
              item.display_value,
              item.displayValue,
              '',
            )
          }

          return item
        })
        .filter(Boolean)

    return values.join('、')
  }

  /*
   * 非数组使用通用文字提取。
   */
  return getObjectText(
    categories,
  )
}

/* =========================================================
   获取困难大类
   ========================================================= */

function getCategoryGroup(
  categories,
  bigCategory = '',
) {
  /*
   * 如果数据库中本身已经有明确的大类，
   * 优先使用数据库中的大类。
   */
  const directBig =
    getObjectText(
      bigCategory,
    )

  if (
    directBig &&
    Object.prototype.hasOwnProperty.call(
      categoryGroups,
      directBig,
    )
  ) {
    return [directBig]
  }

  /*
   * 没有明确大类，
   * 根据困难小类反推。
   */
  const category =
    getCategoryValue(
      categories,
    )

  if (!category) {
    return []
  }

  const groups = []

  Object.entries(
    categoryGroups,
  ).forEach(
    ([group, items]) => {
      const normalizedCategory =
        normalizeCategoryText(
          category,
        )

      /*
       * 情况一：
       * 整体文字刚好等于一个小类。
       */
      const matched =
        items.some(
          (item) =>
            normalizeCategoryText(
              item,
            ) ===
            normalizedCategory,
        )

      if (matched) {
        groups.push(group)
        return
      }

      /*
       * 情况二：
       * 一个人有多个困难小类。
       */
      const categoryItems =
        getCategoryItems(
          categories,
        )

      if (
        categoryItems.some(
          (categoryItem) =>
            items.some(
              (item) =>
                normalizeCategoryText(
                  item,
                ) ===
                normalizeCategoryText(
                  categoryItem,
                ),
            ),
        )
      ) {
        groups.push(group)
      }
    },
  )

  return [
    ...new Set(groups),
  ]
}

/* =========================================================
   获取主要困难大类
   ========================================================= */

function getPrimaryCategoryGroup(
  categories,
  bigCategory = '',
) {
  const groups =
    getCategoryGroup(
      categories,
      bigCategory,
    )

  return groups[0] || ''
}

/* =========================================================
   对外导出
   ========================================================= */

export {
  categoryGroups,
  allCategories,

  normalizeCategoryText,

  normalizeHelpRequired,

  getCategoryItems,
  categoryMatchesFilter,
  getCategoryValue,
  getCategoryGroup,
  getPrimaryCategoryGroup,
}