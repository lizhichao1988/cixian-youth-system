/**
 * =========================================================
 * 字段处理工具
 * =========================================================
 *
 * 从 server.js 拆出。
 *
 * 这一层全是纯函数：
 *     不读数据库、不发请求、不碰任何模块级状态，
 *     同样的输入永远得到同样的输出。
 *
 * 包含：
 *     cleanValue              任意值 -> 安全字符串
 *     getObjectText           任意嵌套结构 -> 纯文本
 *     sanitizeEmptyValues     空串 / null -> null
 *     normalizeDateFields     年月 -> 年月日
 *     responsibleUnitForUser  登录用户 -> 归口单位
 *     normalizeNeedHelp       各种写法 -> 是 / 否
 *     firstValue              按候选字段名依次取值
 *     getRecordFields         取记录字段并解密敏感列
 * =========================================================
 */

const security = require('../security')

function cleanValue(value) {
  if (value === null || value === undefined) {
    return ''
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value
      .map(item => cleanValue(item))
      .filter(Boolean)
      .join('、')
  }

  if (typeof value === 'object') {
    const keys = [
      'value',
      'label',
      'name',
      'text',
      'title',
      'display_value',
      'displayValue',
      '名称',
      '显示值'
    ]

    for (const key of keys) {
      if (
        value[key] !== undefined &&
        value[key] !== null &&
        value[key] !== ''
      ) {
        const result = cleanValue(value[key])

        if (result) {
          return result
        }
      }
    }

    return ''
  }

  return ''
}

function getObjectText(value, depth = 0, visited = new Set()) {
  if (value === null || value === undefined) {
    return ''
  }

  if (depth > 10) {
    return ''
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value
      .map(item =>
        getObjectText(item, depth + 1, visited)
      )
      .filter(Boolean)
      .join('、')
  }

  if (typeof value === 'object') {
    if (visited.has(value)) {
      return ''
    }

    visited.add(value)

    const directKeys = [
      'value',
      'label',
      'name',
      '名称',
      '显示值',
      'display_value',
      'displayValue',
      'text',
      'title',
      '是否需要帮扶',
      'needHelp'
    ]

    for (const key of directKeys) {
      if (
        value[key] !== undefined &&
        value[key] !== null &&
        value[key] !== ''
      ) {
        const text = getObjectText(
          value[key],
          depth + 1,
          visited
        )

        if (text) {
          return text
        }
      }
    }

    const wrapperKeys = [
      'data',
      'record',
      'row',
      'item',
      'fields',
      'values'
    ]

    for (const key of wrapperKeys) {
      if (
        value[key] !== undefined &&
        value[key] !== null
      ) {
        const text = getObjectText(
          value[key],
          depth + 1,
          visited
        )

        if (text) {
          return text
        }
      }
    }
  }

  return ''
}

/**
 * 写入前的字段清洗。
 *
 * 作用：
 *
 *     1. 去掉字符串首尾空格
 *     2. 把空字符串 / undefined 统一转成 null
 *
 * 为什么必须做这一步？
 *
 *     前端编辑表单里没有填的日期字段（出生年月等）
 *     会提交成空字符串 ''。
 *
 *     NocoDB 收到 '' 写日期列时会直接报：
 *
 *         400 The date / time value is invalid.
 *
 *     这就是为什么“新增人员保存失败”。
 *
 *     转成 null 以后 NocoDB 会当成“该字段为空”，
 *     写入成功。
 */
function sanitizeEmptyValues(fields) {
  if (
    !fields ||
    typeof fields !== 'object'
  ) {
    return fields
  }

  Object.keys(fields).forEach((key) => {
    const value = fields[key]

    if (
      value === undefined ||
      value === null
    ) {
      fields[key] = null
      return
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()

      fields[key] =
        trimmed === '' ? null : trimmed
    }
  })

  return fields
}

/**
 * 日期字段补全。
 *
 * 前端“出生年月”用的是月份选择器，
 * 用户可能只选到 年-月（例如 2005-01）。
 *
 * 但是 NocoDB 的日期列要求 年-月-日，
 * 只给 年-月 会被直接退回 400。
 *
 * 所以这里统一补成当月 1 号：
 *
 *     2005-01      -> 2005-01-01
 *     2005/1       -> 2005-01-01
 *     2005年1月    -> 2005-01-01
 *     2005.01.15   -> 2005-01-15
 */
const DATE_FIELDS = ['出生年月']

function normalizeDateFields(fields) {
  if (
    !fields ||
    typeof fields !== 'object'
  ) {
    return fields
  }

  DATE_FIELDS.forEach((key) => {
    if (
      !Object.prototype.hasOwnProperty.call(
        fields,
        key,
      )
    ) {
      return
    }

    const value = fields[key]

    if (typeof value !== 'string') {
      return
    }

    const text = value.trim()

    if (!text) {
      return
    }

    const matched = text.match(
      /^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?日?$/,
    )

    if (!matched) {
      return
    }

    const year = matched[1]

    const month = String(
      matched[2],
    ).padStart(2, '0')

    const day = matched[3]
      ? String(matched[3]).padStart(2, '0')
      : '01'

    fields[key] = `${year}-${month}-${day}`
  })

  return fields
}

/**
 * 根据登录账号角色计算归口单位（数据责任单位）。
 *
 * 规则：
 *
 *     管理员     -> 系统管理员
 *     县级管理员 -> 县级管理员
 *     乡镇账号   -> 账号所属乡镇（例如 讲武城镇）
 *     社区账号   -> 社区
 *
 * 这样“录入的数据”天然归属到录入人，
 * 乡镇账号的数据隔离才能稳定生效。
 *
 * 注意：
 *
 * 社区账号在登录态里就是
 * role='town'、town='社区'，
 * 所以直接返回 req.user.town 即可。
 */
function responsibleUnitForUser(user) {
  if (!user) {
    return ''
  }

  if (user.role === 'admin') {
    return '系统管理员'
  }

  if (user.role === 'county') {
    return '县级管理员'
  }

  if (user.role === 'town') {
    return user.town || ''
  }

  return ''
}

function normalizeNeedHelp(value) {
  const text = getObjectText(value)
    .trim()
    .toLowerCase()

  if (
    [
      '是',
      '需要',
      '需要帮扶',
      '有',
      'true',
      'yes',
      'y',
      '1'
    ].includes(text)
  ) {
    return '是'
  }

  if (
    [
      '否',
      '不需要',
      '无需',
      '无',
      '不需要帮扶',
      'false',
      'no',
      'n',
      '0'
    ].includes(text)
  ) {
    return '否'
  }

  return ''
}

function firstValue(fields, names) {
  for (const name of names) {
    if (
      fields &&
      fields[name] !== undefined &&
      fields[name] !== null &&
      fields[name] !== ''
    ) {
      return fields[name]
    }
  }

  return ''
}

function getRecordFields(record) {
  if (!record) {
    return {}
  }

  const raw =
    record.fields &&
    typeof record.fields === 'object'
      ? record.fields
      : record

  /**
   * 敏感字段（手机号等）在库里是密文，
   * 读出来统一解密后再往下走。
   *
   * 历史明文数据不是 enc1: 开头，
   * 会原样返回，不受影响。
   */
  return security.decryptSensitiveFields(raw)
}

module.exports = {
  cleanValue,
  getObjectText,
  sanitizeEmptyValues,
  normalizeDateFields,
  responsibleUnitForUser,
  normalizeNeedHelp,
  firstValue,
  getRecordFields,
}
