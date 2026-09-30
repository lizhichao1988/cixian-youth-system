/**
 * 青少年系统通用数据工具
 *
 * 本文件只负责“读取和整理数据结构”，不负责页面展示。
 *
 * 主要职责：
 * 1. 处理 NocoDB 返回的各种数据结构。
 * 2. 读取普通字段。
 * 3. 读取关联数据。
 * 4. 从复杂对象中查找字段。
 * 5. 计算青少年年龄。
 * 6. 从后端接口返回结果中提取青少年记录数组。
 *
 * 这些函数原来全部写在 App.jsx 中，现在集中到这里，
 * 这样 App.jsx 可以逐步从“什么都负责”变成“负责页面调度”。
 */

/* =========================================================
 * 一、基础值判断
 * ========================================================= */

/**
 * 从多个候选值中，找到第一个真正有内容的值。
 */
function firstDefined(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      return value
    }
  }

  return ''
}

/**
 * 判断一个值是否真正有内容。
 */
function hasValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    value !== ''
  )
}

/* =========================================================
 * 二、通用对象文字提取
 * ========================================================= */

/**
 * 将 NocoDB 返回的字符串、数字、对象、数组等数据，
 * 尽可能转换成前端可以直接使用的文字。
 */
function getObjectText(
  value,
  depth = 0,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return ''
  }

  /**
   * 防止异常数据形成无限递归。
   */
  if (depth > 15) {
    return ''
  }

  /**
   * 基础数据类型直接转换成字符串。
   */
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value)
  }

  /**
   * 数组逐项读取。
   */
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        getObjectText(
          item,
          depth + 1,
        ),
      )
      .filter(Boolean)
      .join('、')
  }

  /**
   * 对象按照常见字段名称寻找文字。
   */
  if (
    typeof value === 'object'
  ) {
    const directKeys = [
      'name',
      '名称',
      'title',
      'Title',
      'value',
      '值',
      'display_value',
      '显示值',
      'displayValue',
      'label',
      'text',
      '文本',
      '姓名',
      '小类名称',
      '大类',
      '是否需要帮扶',
      '是否需帮扶',
      '需要帮扶',
      '是否结对帮扶',
      '是否需要结对帮扶',
      '是否结对',
      '是否存在风险',
      'hasRisk',
      '风险隐患描述',
      '排查日期',
      '处置情况',
      '排查人',
      '备注',
      'status',
      'date',
      'description',
      'handling',
      'inspector',
      'remark',
    ]

    for (const key of directKeys) {
      if (hasValue(value[key])) {
        const text =
          getObjectText(
            value[key],
            depth + 1,
          )

        if (text) {
          return text
        }
      }
    }

    /**
     * 一些接口会把真正的数据再包一层。
     */
    const wrapperKeys = [
      'data',
      'record',
      'row',
      'item',
      'fields',
      'values',
    ]

    for (const key of wrapperKeys) {
      if (
        value[key] !==
          undefined &&
        value[key] !== null
      ) {
        const text =
          getObjectText(
            value[key],
            depth + 1,
          )

        if (text) {
          return text
        }
      }
    }
  }

  return ''
}

/* =========================================================
 * 三、关联数据处理
 * ========================================================= */

/**
 * 将 NocoDB 的关联字段统一拆成数组。
 */
function unwrapRelation(
  value,
  depth = 0,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return []
  }

  if (depth > 15) {
    return []
  }

  /**
   * 本身已经是数组。
   */
  if (Array.isArray(value)) {
    const result = []

    value.forEach((item) => {
      const nested =
        unwrapRelation(
          item,
          depth + 1,
        )

      if (nested.length > 0) {
        result.push(...nested)
      } else if (
        item !== null &&
        item !== undefined
      ) {
        result.push(item)
      }
    })

    return result
  }

  /**
   * 普通字符串、数字等作为一条数据返回。
   */
  if (
    typeof value !== 'object'
  ) {
    return [value]
  }

  /**
   * 常见的关联记录数组包装方式。
   */
  const collectionKeys = [
    'records',
    'list',
    'rows',
    'items',
    'data',
    'linkedRecords',
    'linked_records',
  ]

  for (const key of collectionKeys) {
    if (
      Array.isArray(value[key])
    ) {
      return unwrapRelation(
        value[key],
        depth + 1,
      )
    }
  }

  /**
   * 常见的单条记录包装方式。
   */
  const wrapperKeys = [
    'record',
    'row',
    'item',
    'value',
    'fields',
    'values',
  ]

  for (const key of wrapperKeys) {
    if (
      value[key] !==
        undefined &&
      value[key] !== null &&
      typeof value[key] ===
        'object'
    ) {
      const nested =
        unwrapRelation(
          value[key],
          depth + 1,
        )

      if (nested.length > 0) {
        return nested
      }
    }
  }

  return [value]
}

/**
 * 从一条记录中读取普通字段。
 */
function getField(
  record,
  names,
) {
  if (
    !record ||
    typeof record !== 'object'
  ) {
    return ''
  }

  for (const name of names) {
    if (hasValue(record[name])) {
      return record[name]
    }
  }

  return ''
}

/**
 * 从一条记录中读取关联数据。
 */
function getRelationRecords(
  record,
  names,
) {
  const value = getField(
    record,
    names,
  )

  return unwrapRelation(value)
}

/* =========================================================
 * 四、复杂对象字段查找
 * ========================================================= */

/**
 * 在复杂的 NocoDB 数据对象中递归查找指定字段。
 *
 * 例如：
 * {
 *   data: {
 *     fields: {
 *       是否需要帮扶: "是"
 *     }
 *   }
 * }
 *
 * 即使字段不是直接挂在最外层，也可以找到。
 */
function findFieldValue(
  object,
  fieldNames,
  depth = 0,
  visited = new Set(),
) {
  if (
    object === null ||
    object === undefined
  ) {
    return ''
  }

  if (depth > 15) {
    return ''
  }

  if (
    typeof object !== 'object'
  ) {
    return ''
  }

  /**
   * 防止循环引用造成无限递归。
   */
  if (visited.has(object)) {
    return ''
  }

  visited.add(object)

  /**
   * 第一层：直接寻找目标字段。
   */
  for (const fieldName of fieldNames) {
    if (
      hasValue(
        object[fieldName],
      )
    ) {
      const raw =
        object[fieldName]

      const text =
        getObjectText(raw)

      if (text) {
        return text
      }

      if (
        typeof raw ===
        'object'
      ) {
        const nested =
          findFieldValue(
            raw,
            fieldNames,
            depth + 1,
            visited,
          )

        if (nested) {
          return nested
        }
      }
    }
  }

  /**
   * 第二层：检查常见包装字段。
   */
  const compatibleKeys = [
    'data',
    'record',
    'row',
    'item',
    'value',
    'values',
    'fields',
  ]

  for (const key of compatibleKeys) {
    if (
      object[key] !==
        undefined &&
      object[key] !== null &&
      typeof object[key] ===
        'object'
    ) {
      const result =
        findFieldValue(
          object[key],
          fieldNames,
          depth + 1,
          visited,
        )

      if (result) {
        return result
      }
    }
  }

  /**
   * 第三层：继续扫描其他对象属性。
   */
  for (const [
    key,
    value,
  ] of Object.entries(object)) {
    if (
      compatibleKeys.includes(
        key,
      )
    ) {
      continue
    }

    if (
      value &&
      typeof value ===
        'object'
    ) {
      const result =
        findFieldValue(
          value,
          fieldNames,
          depth + 1,
          visited,
        )

      if (result) {
        return result
      }
    }
  }

  return ''
}

/* =========================================================
 * 五、年龄计算
 * ========================================================= */

/**
 * 根据出生年月计算年龄。
 *
 * birthday 可以是：
 *
 * 1. "2010-05-20"
 * 2. "2010-05"
 * 3. "2010/05/20"
 * 4. Date 对象
 * 5. NocoDB 返回的日期对象
 *
 * 返回：
 * - 正常情况下：整数年龄
 * - 无法识别：空字符串
 *
 * 这里采用“周岁”计算。
 */
function getAge(birthday) {
  if (
    birthday === null ||
    birthday === undefined ||
    birthday === ''
  ) {
    return ''
  }

  /**
   * 如果日期是对象，先尝试提取里面真正的日期文字。
   */
  let value = birthday

  if (
    typeof value === 'object' &&
    !(value instanceof Date)
  ) {
    const objectText =
      getObjectText(value)

    if (!objectText) {
      return ''
    }

    value = objectText
  }

  /**
   * Date 对象直接使用。
   */
  let date

  if (value instanceof Date) {
    date = value
  } else {
    let text =
      String(value).trim()

    if (!text) {
      return ''
    }

    /**
     * 统一常见日期格式。
     */
    text = text
      .replace(/年/g, '-')
      .replace(/月/g, '-')
      .replace(/日/g, '')
      .replace(/\//g, '-')
      .trim()

    /**
     * 如果 NocoDB 返回的是类似：
     * 2010-05-20T00:00:00.000Z
     * 直接交给 Date。
     */
    date = new Date(text)

    /**
     * 如果完整日期无法解析，
     * 尝试处理只有“年月”的情况。
     */
    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      const match =
        text.match(
          /^(\d{4})-(\d{1,2})$/,
        )

      if (match) {
        const year =
          Number(match[1])

        const month =
          Number(match[2])

        if (
          year >= 1900 &&
          month >= 1 &&
          month <= 12
        ) {
          date = new Date(
            year,
            month - 1,
            1,
          )
        }
      }
    }
  }

  /**
   * 日期仍然无法解析。
   */
  if (
    !(date instanceof Date) ||
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return ''
  }

  const today =
    new Date()

  let age =
    today.getFullYear() -
    date.getFullYear()

  /**
   * 如果今年生日还没到，周岁减一。
   */
  const currentMonth =
    today.getMonth()

  const birthdayMonth =
    date.getMonth()

  const currentDate =
    today.getDate()

  const birthdayDate =
    date.getDate()

  if (
    currentMonth <
      birthdayMonth ||
    (
      currentMonth ===
        birthdayMonth &&
      currentDate <
        birthdayDate
    )
  ) {
    age -= 1
  }

  /**
   * 排除明显异常年龄。
   */
  if (
    age < 0 ||
    age > 120
  ) {
    return ''
  }

  return age
}

/* =========================================================
 * 六、后端结果解析
 * ========================================================= */

/**
 * 从后端接口返回结果中提取青少年记录数组。
 *
 * 后端可能返回不同的数据结构，
 * 这里统一转换成：
 *
 * [
 *   青少年记录1,
 *   青少年记录2,
 *   ...
 * ]
 *
 * 支持：
 *
 * 1. 直接返回数组
 * 2. { records: [] }
 * 3. { data: [] }
 * 4. { data: { records: [] } }
 * 5. { data: { list: [] } }
 * 6. { data: { rows: [] } }
 * 7. { data: { data: [] } }
 * 8. { list: [] }
 * 9. { rows: [] }
 */
function extractRecordsFromResult(
  result,
) {
  /**
   * 情况一：
   * 后端直接返回数组。
   */
  if (Array.isArray(result)) {
    return result
  }

  /**
   * 没有返回对象时，统一返回空数组。
   */
  if (
    !result ||
    typeof result !== 'object'
  ) {
    return []
  }

  /**
   * 情况二：
   * { records: [...] }
   */
  if (
    Array.isArray(result.records)
  ) {
    return result.records
  }

  /**
   * 情况三：
   * { data: [...] }
   */
  if (
    Array.isArray(result.data)
  ) {
    return result.data
  }

  /**
   * 情况四至七：
   * { data: { records/list/rows/data: [...] } }
   */
  if (
    result.data &&
    typeof result.data === 'object'
  ) {
    if (
      Array.isArray(
        result.data.records,
      )
    ) {
      return result.data.records
    }

    if (
      Array.isArray(
        result.data.list,
      )
    ) {
      return result.data.list
    }

    if (
      Array.isArray(
        result.data.rows,
      )
    ) {
      return result.data.rows
    }

    if (
      Array.isArray(
        result.data.data,
      )
    ) {
      return result.data.data
    }
  }

  /**
   * 情况八：
   * { list: [...] }
   */
  if (Array.isArray(result.list)) {
    return result.list
  }

  /**
   * 情况九：
   * { rows: [...] }
   */
  if (Array.isArray(result.rows)) {
    return result.rows
  }

  /**
   * 如果后端返回了暂时无法识别的结构，
   * 不让页面直接崩溃，统一返回空数组。
   */
  return []
}

/* =========================================================
 * 七、新增青少年默认数据
 * ========================================================= */

/**
 * 创建一条“新增人员”时使用的默认青少年记录。
 *
 * 这里不负责保存数据，
 * 只负责提供前端新增表单的初始数据。
 *
 * 这样 App.jsx 就不需要自己拼装这么大的对象。
 */

function createEmptyYouthRecord(
  sequence = 1,
) {

  return {

    /**
     * 新增人员的临时 key。
     *
     * 必须以 "youth-" 开头！
     *
     * 因为保存时的判断规则是：
     *
     *     key 以 "youth-" 开头  -> 新增人员，走 POST
     *     key 是纯数字          -> 数据库已有记录，走 PUT
     *
     * 以前这里写的是 String(Date.now())，
     * 纯数字 → 被误判成“已有记录” → 拿一个
     * 不存在的时间戳当 ID 去 PUT → 后端 400。
     */
    key: `youth-${Date.now()}`,

    sequence,

    name: '新增人员',

    gender: '男',

    /**
     * 出生年月默认留空。
     *
     * 以前默认写死 '2005-01'（只有年-月），
     * 而后端日期校验要求 年-月-日，
     * 于是"新增人员"什么都不改直接保存，
     * 也会被后端退回 400。
     *
     * 留空 → 后端写成 null，可以正常保存。
     */
    birthday: '',

    political:
      '群众',

    household:
      '',

    residence:
      '',

    basic:
      '',

    phone:
      '',

    guardian:
      '',

    guardianPhone:
      '',

    helpRequired:
      '否',

    bigCategory:
      '',

    categories:
      '',

    risks: [],

    helpNeed:
      '暂无',

    pairing:
      '否',

    pairingContact:
      '',

    pairingPhone:
      '',

    pairingUnit:
      '',

    helpRecords:
      0,

    remark:
      '',

  }

}

/* =========================================================
 * 八、统一导出
 * ========================================================= */

export {
  firstDefined,
  hasValue,
  getObjectText,
  unwrapRelation,
  getField,
  getRelationRecords,
  findFieldValue,
  getAge,
  extractRecordsFromResult,
  createEmptyYouthRecord,
}
