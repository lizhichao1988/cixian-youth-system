/*
 * 帮扶需求数据工具
 *
 * 本文件只负责“帮扶需求”相关的数据读取、标准化和判断。
 *
 * 注意：
 * 本次只是将原 App.jsx 中已经验证正常的帮扶需求逻辑
 * 独立到本文件。
 *
 * 除了文件位置发生变化以外，
 * 不改变原来的数据结构和业务逻辑。
 */

import {
  firstDefined,
  getObjectText,
  unwrapRelation,
  getField,
} from './youthUtils'

/*
 * 判断帮扶需求值是否为空。
 *
 * 以下内容统一视为“没有实际需求”：
 * - 空字符串
 * - 无
 * - 暂无
 * - 没有
 * - 无需求
 * - 无帮扶需求
 */
function isEmptyHelpValue(value) {
  if (value === null || value === undefined) {
    return true
  }

  const text = getObjectText(value).trim()

  if (!text) {
    return true
  }

  const normalized = text.toLowerCase()

  return [
    '无',
    '暂无',
    '没有',
    '无需求',
    '无帮扶需求',
  ].includes(normalized)
}

/*
 * 获取帮扶需求关联记录。
 *
 * 优先使用已经标准化好的 record.helpNeeds。
 *
 * 如果没有，则按照原来的逻辑，
 * 从 NocoDB 关联字段中读取。
 */
function getHelpNeedRecords(record) {
  if (!record || typeof record !== 'object') {
    return []
  }

  if (Array.isArray(record.helpNeeds)) {
    return record.helpNeeds
  }

  const relationNames = [
    '帮扶需求记录',
    '帮扶需求',
    '帮扶需求表',
    '帮扶需求表s',
    'helpNeed',
    'helpNeeds',
  ]

  for (const fieldName of relationNames) {
    const fieldValue = getField(record, fieldName)

    if (
      fieldValue === undefined ||
      fieldValue === null
    ) {
      continue
    }

    const relation = unwrapRelation(fieldValue)

    if (Array.isArray(relation)) {
      return relation.filter(Boolean)
    }

    if (
      relation &&
      typeof relation === 'object'
    ) {
      return [relation]
    }
  }

  return []
}

/*
 * 标准化帮扶需求。
 *
 * 非常重要：
 *
 * 原来的 App.jsx 中，
 * normalizeHelpNeed(record) 返回的是“字符串”，
 * 而不是对象。
 *
 * 同时原来的业务逻辑是：
 *
 * 1. 优先读取“需求描述”
 * 2. 如果需求描述没有有效内容，再使用“需求类型”
 * 3. 多条真实需求去重后使用“ | ”连接
 * 4. 没有真实需求时返回“暂无”
 */
function normalizeHelpNeed(record) {
  if (!record || typeof record !== 'object') {
    return '暂无'
  }

  const records = getHelpNeedRecords(record)

  if (
    !Array.isArray(records) ||
    records.length === 0
  ) {
    /*
     * 为了兼容原来的数据结构，
     * 如果传入的 record 本身就是一条帮扶需求记录，
     * 也直接读取它。
     */
    const description = firstDefined(
      record.description,
      record['需求描述'],
      record.helpDescription
    )

    const type = firstDefined(
      record.type,
      record['需求类型'],
      record.helpType
    )

    if (!isEmptyHelpValue(description)) {
      return getObjectText(description).trim()
    }

    if (!isEmptyHelpValue(type)) {
      return getObjectText(type).trim()
    }

    return '暂无'
  }

  const values = []

  records.forEach((item) => {
    if (
      !item ||
      typeof item !== 'object'
    ) {
      return
    }

    /*
     * 第一优先级：需求描述
     */
    const description = firstDefined(
      item.description,
      item['需求描述'],
      item.helpDescription
    )

    if (!isEmptyHelpValue(description)) {
      const text = getObjectText(description).trim()

      if (text) {
        values.push(text)
        return
      }
    }

    /*
     * 第二优先级：需求类型
     *
     * 只有需求描述没有有效内容时，
     * 才使用需求类型。
     */
    const type = firstDefined(
      item.type,
      item['需求类型'],
      item.helpType
    )

    if (!isEmptyHelpValue(type)) {
      const text = getObjectText(type).trim()

      if (text) {
        values.push(text)
      }
    }
  })

  const uniqueValues = [
    ...new Set(values),
  ]

  return uniqueValues.length > 0
    ? uniqueValues.join(' | ')
    : '暂无'
}

/*
 * 判断是否存在真实帮扶需求。
 *
 * 注意：
 * “有帮扶需求关联记录”
 * 不代表
 * “有真实帮扶需求”。
 */
function hasRealHelpNeed(record) {
  const records = getHelpNeedRecords(record)

  if (
    !Array.isArray(records) ||
    records.length === 0
  ) {
    return false
  }

  return records.some((item) => {
    if (
      !item ||
      typeof item !== 'object'
    ) {
      return false
    }

    const description = firstDefined(
      item.description,
      item['需求描述'],
      item.helpDescription
    )

    const type = firstDefined(
      item.type,
      item['需求类型'],
      item.helpType
    )

    return (
      !isEmptyHelpValue(description) ||
      !isEmptyHelpValue(type)
    )
  })
}

export {
  isEmptyHelpValue,
  getHelpNeedRecords,
  normalizeHelpNeed,
  hasRealHelpNeed,
}