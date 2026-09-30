/*
 * 结对帮扶数据工具
 *
 * 本文件只负责“结对帮扶”相关的数据读取和标准化。
 *
 * 本模块只负责数据逻辑，不负责：
 * - React
 * - Ant Design
 * - 页面展示
 * - 页面状态
 * - API 请求
 *
 * 本次修改重点：
 * 结对帮扶状态必须优先根据“结对帮扶关联记录”判断。
 *
 * 如果已经存在有效的：
 * - 帮扶联系人
 * - 联系电话
 * - 所属单位
 *
 * 则说明已经存在结对帮扶数据，
 * 不能因为主记录中某个默认值为“否”
 * 就把最终结果判断成“否”。
 */

import {
  firstDefined,
  getObjectText,
  unwrapRelation,
  getField,
  findFieldValue,
} from './youthUtils'

/*
 * 获取青少年对应的结对帮扶原始记录。
 */
function getPairingRecords(record) {
  if (!record || typeof record !== 'object') {
    return []
  }

  /*
   * 如果已经标准化过，
   * 优先使用标准化后的关联记录。
   */
  if (Array.isArray(record.pairingRecords)) {
    return record.pairingRecords
  }

  const relationNames = [
    '结对帮扶记录',
    '结对帮扶记录s',
    '结对帮扶记录表',
    '结对帮扶记录表s',
    'pairingRecords',
    'pairingRecord',
    'pairings',
    'pairing',
    '结对帮扶',
    '结对帮扶表',
    '结对帮扶表s',
  ]

  for (const fieldName of relationNames) {
    const fieldValue = getField(
      record,
      fieldName
    )

    if (
      fieldValue === undefined ||
      fieldValue === null
    ) {
      continue
    }

    const relation =
      unwrapRelation(fieldValue)

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
 * 从结对帮扶记录中读取字段。
 *
 * 按照三个层级读取：
 *
 * 1. 直接字段
 * 2. getField()
 * 3. findFieldValue()
 */
function readPairingField(
  pairingRecord,
  fieldNames
) {
  if (
    !pairingRecord ||
    typeof pairingRecord !== 'object'
  ) {
    return ''
  }

  const names = Array.isArray(fieldNames)
    ? fieldNames
    : [fieldNames]

  /*
   * 第一层：直接读取。
   */
  for (const fieldName of names) {
    if (
      Object.prototype.hasOwnProperty.call(
        pairingRecord,
        fieldName
      )
    ) {
      const value =
        pairingRecord[fieldName]

      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
      ) {
        return value
      }
    }
  }

  /*
   * 第二层：使用通用字段读取。
   */
  for (const fieldName of names) {
    const value = getField(
      pairingRecord,
      fieldName
    )

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      return value
    }
  }

  /*
   * 第三层：递归寻找字段。
   */
  for (const fieldName of names) {
    const value = findFieldValue(
      pairingRecord,
      fieldName
    )

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      return value
    }
  }

  return ''
}

/*
 * 标准化“是否结对帮扶”。
 *
 * 最终只返回：
 *
 * 是
 * 否
 * ''
 */
function normalizePairingStatus(value) {
  const text = getObjectText(value)
    .trim()
    .toLowerCase()

  if (!text) {
    return ''
  }

  /*
   * 先判断“否”。
   *
   * 这一点很重要。
   *
   * 因为：
   *
   * “不需要结对帮扶”
   *
   * 本身包含：
   *
   * “需要结对帮扶”
   *
   * 如果先判断 includes('需要结对帮扶')
   * 就会把“否”误判成“是”。
   */
  if (
    [
      '否',
      '无',
      '未结对',
      '未结对帮扶',
      '不需要结对',
      '不需要结对帮扶',
      'false',
      'no',
      'n',
      '0',
    ].includes(text)
  ) {
    return '否'
  }

  if (
    text.includes('不需要结对帮扶') ||
    text.includes('未结对帮扶') ||
    text.includes('未结对')
  ) {
    return '否'
  }

  /*
   * 明确表示“是”。
   */
  if (
    [
      '是',
      '有',
      '已结对',
      '已结对帮扶',
      '需要结对',
      '需要结对帮扶',
      'true',
      'yes',
      'y',
      '1',
    ].includes(text)
  ) {
    return '是'
  }

  if (
    text.includes('已结对帮扶') ||
    text.includes('已经结对') ||
    text.includes('已结对')
  ) {
    return '是'
  }

  if (
    text.includes('需要结对帮扶')
  ) {
    return '是'
  }

  return ''
}

/*
 * 从关联记录中判断是否结对帮扶。
 *
 * 规则：
 *
 * 只要有一条记录明确为“是”
 * → 是
 *
 * 没有“是”，但有“否”
 * → 否
 *
 * 没有明确状态
 * → ''
 */
function getPairingStatusFromRecords(records) {
  if (!Array.isArray(records)) {
    return ''
  }

  let hasNo = false

  for (const pairingRecord of records) {
    if (
      !pairingRecord ||
      typeof pairingRecord !== 'object'
    ) {
      continue
    }

    const rawStatus =
      readPairingField(
        pairingRecord,
        [
          '是否需要结对帮扶',
          '是否结对帮扶',
          '是否结对',
          '需要结对帮扶',
          'pairingRequired',
          'needPairing',
          'pairing',
        ]
      )

    const status =
      normalizePairingStatus(
        rawStatus
      )

    if (status === '是') {
      return '是'
    }

    if (status === '否') {
      hasNo = true
    }
  }

  return hasNo ? '否' : ''
}

/*
 * 判断一条结对帮扶记录中是否存在有效的帮扶信息。
 *
 * 只要出现：
 * - 帮扶联系人
 * - 联系电话
 * - 所属单位
 *
 * 任意一项有效内容，
 * 就说明这是一条真实的结对帮扶记录。
 */
function hasPairingInformation(
  pairingRecord
) {
  if (
    !pairingRecord ||
    typeof pairingRecord !== 'object'
  ) {
    return false
  }

  const contact =
    readPairingField(
      pairingRecord,
      [
        '帮扶联系人',
        '联系人',
        '结对帮扶联系人',
        'contact',
        'pairingContact',
      ]
    )

  const phone =
    readPairingField(
      pairingRecord,
      [
        '联系电话',
        '联系手机',
        '帮扶联系人电话',
        'phone',
        'pairingPhone',
      ]
    )

  const unit =
    readPairingField(
      pairingRecord,
      [
        '所属单位',
        '帮扶单位',
        '单位',
        'unit',
        'pairingUnit',
      ]
    )

  return Boolean(
    getObjectText(contact).trim() ||
    getObjectText(phone).trim() ||
    getObjectText(unit).trim()
  )
}

/*
 * 判断整个关联记录集合中是否存在真实结对帮扶信息。
 */
function hasPairingInformationInRecords(
  records
) {
  if (!Array.isArray(records)) {
    return false
  }

  return records.some(
    hasPairingInformation
  )
}

/*
 * 获取完整的结对帮扶数据。
 *
 * 最终返回：
 *
 * {
 *   pairing: '是' / '否',
 *   contact: '',
 *   phone: '',
 *   unit: ''
 * }
 */
function getPairingData(record) {
  if (!record || typeof record !== 'object') {
    return {
      pairing: '否',
      contact: '',
      phone: '',
      unit: '',
    }
  }

  /*
   * 第一步：
   * 获取真实的结对帮扶关联记录。
   */
  const records =
    getPairingRecords(record)

  /*
   * 第二步：
   * 先从关联记录中判断“是否结对帮扶”。
   *
   * 这一项必须优先于主记录中的默认值。
   */
  const relationPairing =
    getPairingStatusFromRecords(
      records
    )

  /*
   * 第三步：
   * 再读取主记录中的状态。
   *
   * 注意：
   * 主记录中的“否”不能直接覆盖关联记录。
   */
  const directPairing =
    normalizePairingStatus(
      firstDefined(
        record['是否需要结对帮扶'],
        record['是否结对帮扶'],
        record['是否结对'],
        record.pairing
      )
    )

  /*
   * 第四步：
   * 读取联系人、电话、单位。
   */
  let contact = firstDefined(
    record.pairingContact,
    record['帮扶联系人'],
    record['结对帮扶联系人']
  )

  let phone = firstDefined(
    record.pairingPhone,
    record['联系电话'],
    record['结对帮扶联系电话']
  )

  let unit = firstDefined(
    record.pairingUnit,
    record['所属单位'],
    record['结对帮扶所属单位']
  )

  /*
   * 如果主记录没有联系人等信息，
   * 从关联记录读取。
   */
  if (Array.isArray(records)) {
    for (const pairingRecord of records) {
      if (
        !pairingRecord ||
        typeof pairingRecord !== 'object'
      ) {
        continue
      }

      if (!contact) {
        contact =
          readPairingField(
            pairingRecord,
            [
              '帮扶联系人',
              '联系人',
              '结对帮扶联系人',
              'contact',
              'pairingContact',
            ]
          )
      }

      if (!phone) {
        phone =
          readPairingField(
            pairingRecord,
            [
              '联系电话',
              '联系手机',
              '帮扶联系人电话',
              'phone',
              'pairingPhone',
            ]
          )
      }

      if (!unit) {
        unit =
          readPairingField(
            pairingRecord,
            [
              '所属单位',
              '帮扶单位',
              '单位',
              'unit',
              'pairingUnit',
            ]
          )
      }

      if (
        contact &&
        phone &&
        unit
      ) {
        break
      }
    }
  }

  /*
   * 第五步：
   * 最终确定“是否结对帮扶”。
   *
   * 优先级：
   *
   * ① 关联记录明确为“是”
   * ② 关联记录存在真实帮扶信息
   * ③ 关联记录明确为“否”
   * ④ 主记录明确为“是”
   * ⑤ 主记录明确为“否”
   * ⑥ 默认“否”
   *
   * 这样就不会出现：
   *
   * 联系人已经存在
   * ↓
   * 但是否结对帮扶却显示“否”
   */
  let pairing = ''

  if (relationPairing === '是') {
    pairing = '是'
  } else if (
    hasPairingInformationInRecords(
      records
    )
  ) {
    pairing = '是'
  } else if (relationPairing === '否') {
    pairing = '否'
  } else if (directPairing === '是') {
    pairing = '是'
  } else if (directPairing === '否') {
    pairing = '否'
  } else {
    pairing = '否'
  }

  return {
    pairing,
    contact: getObjectText(
      contact
    ).trim(),
    phone: getObjectText(
      phone
    ).trim(),
    unit: getObjectText(
      unit
    ).trim(),
  }
}

export {
  getPairingRecords,
  readPairingField,
  normalizePairingStatus,
  getPairingStatusFromRecords,
  getPairingData,
}