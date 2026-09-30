/**
 * 青少年主记录标准化工具
 *
 * 本文件负责：
 * 1. 将后端 / NocoDB 原始青少年数据转换成前端统一结构
 * 2. 统一处理“是否需要帮扶”
 * 3. 统一组合风险排查、帮扶需求、结对帮扶等业务数据
 *
 * 本文件不负责：
 * 1. 页面显示
 * 2. 筛选
 * 3. API 请求
 * 4. 保存数据
 */

import {
  firstDefined,
  hasValue,
  getObjectText,
  unwrapRelation,
  getField,
  findFieldValue,
} from './youthUtils'

import {
  normalizeHelpRequired,
  getCategoryValue,
} from './categoryUtils'

import {
  normalizeRisks,
} from './riskUtils'

import {
  normalizeHelpNeed,
} from './helpUtils'

import {
  getPairingData,
} from './pairingUtils'

/**
 * 获取“是否需要帮扶”
 *
 * 青少年基本信息表中使用的字段是：
 * 是否需要帮扶
 *
 * 为了兼容后端已经整理过的数据，
 * 同时支持几个可能存在的字段名称。
 */
function getHelpRequiredValue(record) {
  if (!record || typeof record !== 'object') {
    return '否'
  }

  const rawValue = firstDefined(
  /*
   * 后端标准化后的字段。
   *
   * server.js 返回：
   *
   *   needHelp: '是'
   *   needHelp: '否'
   *
   * 这是当前最优先读取的字段。
   */
  record.needHelp,

  /*
   * 兼容前端旧结构。
   */
  record.helpRequired,

  /*
   * 兼容 NocoDB 原始字段。
   */
  record.是否需要帮扶,
  record.是否需帮扶,
  record.需要帮扶,

  /*
   * 兼容嵌套字段结构。
   */
  getField(record, [
    'needHelp',
    'helpRequired',
    '是否需要帮扶',
    '是否需帮扶',
    '需要帮扶',
  ]),

  findFieldValue(record, [
    'needHelp',
    'helpRequired',
    '是否需要帮扶',
    '是否需帮扶',
    '需要帮扶',
  ]),
)

  return normalizeHelpRequired(rawValue) || '否'
}

/**
 * 获取帮扶记录数量
 *
 * 统一规则：
 *
 * 1. 后端已经提供 helpRecordCount 时，优先使用。
 * 2. 如果没有数量，则从 helpRecordList 计算。
 * 3. 再兼容旧结构中的 helpRecords 数组。
 *
 * 注意：
 * helpRecords 在最终标准结构中表示“数量”，
 * helpRecordList 才表示“完整帮扶记录数组”。
 */
function getHelpRecordCount(record) {
  if (!record || typeof record !== 'object') {
    return 0
  }

  /*
   * 后端已经计算好的数量。
   */
  const directCount = firstDefined(
    record.helpRecordCount,
    record.帮扶记录数量,
  )

  if (
    directCount !== undefined &&
    directCount !== null &&
    directCount !== ''
  ) {
    const number = Number(directCount)

    if (Number.isFinite(number)) {
      return number
    }
  }

  /*
   * 如果已经存在标准化后的帮扶记录数组，
   * 直接计算数组长度。
   */
  if (Array.isArray(record.helpRecordList)) {
    return record.helpRecordList.length
  }

  /*
   * 兼容后端旧结构：
   * helpRecords 可能暂时还是数组。
   */
  if (Array.isArray(record.helpRecords)) {
    return record.helpRecords.length
  }

  return 0
}

/**
 * 创建一个空的标准青少年记录。
 *
 * 当后端偶然返回 null / undefined 时，
 * 使用这个结构可以避免整个页面报错。
 */
function createEmptyYouthRecord(index) {
  return {
    key: `youth-${index}`,
    sequence: index + 1,
    name: '',
    gender: '',
    birthday: '',
    political: '',
    household: '',
    residence: '',
    basic: '',
    phone: '',
    guardian: '',
    guardianPhone: '',
    helpRequired: '否',
    bigCategory: '',
    categories: '',
    timestamp: '',
    risks: [],
    helpNeed: '暂无',
    pairing: '否',
    pairingContact: '',
    pairingPhone: '',
    pairingUnit: '',
        /*
     * 完整帮扶记录列表。
     */
    helpRecordList: [],

    /*
     * 帮扶记录数量。
     */
    helpRecords: 0,
    remark: '',
  }
}

/**
 * 将 NocoDB 原始青少年记录
 * 转换成前端统一使用的记录结构。
 */
export function normalizeRecord(
  record,
  index = 0,
) {
  /**
   * 防止后端返回空值。
   */
  if (
    !record ||
    typeof record !== 'object'
  ) {
    return createEmptyYouthRecord(
      index,
    )
  }

  /**
   * -----------------------------
   * 1. 风险排查
   * -----------------------------
   *
   * 完全交给 riskUtils.js。
   */
  const risks =
    normalizeRisks(record)

  /**
   * -----------------------------
   * 2. 困难类别
   * -----------------------------
   */
  const rawBigCategory =
    firstDefined(
      record.bigCategory,
      record.困难大类,
      record.大类,
      getField(record, [
        'bigCategory',
        '困难大类',
        '大类',
      ]),
    )

  const rawCategories =
    firstDefined(
      record.categories,
      record.category,
      record.困难小类,
      record.小类名称,
      record.困难类别,
      getField(record, [
        'categories',
        'category',
        '困难小类',
        '小类名称',
        '困难类别',
      ]),
    )

  /**
   * -----------------------------
   * 3. 是否需要帮扶
   * -----------------------------
   *
   * 注意这里必须调用本文件自己的
   * getHelpRequiredValue。
   */
  const helpRequired =
    getHelpRequiredValue(record)

  /**
   * -----------------------------
   * 4. 结对帮扶
   * -----------------------------
   *
   * 由 pairingUtils.js 统一处理。
   *
   * 这里不要自己判断“是/否”，
   * 防止再次出现之前“全部显示否”的问题。
   */
  const pairing =
    getPairingData(record)

  /**
   * -----------------------------
   * 5. 返回统一结构
   * -----------------------------
   */
  return {
    /**
     * 唯一标识
     */
    key: String(
      firstDefined(
        record.key,
        record.Id,
        record.id,
        record.ID,
        record.序号,
        record.sequence,
        `youth-${index}`,
      ),
    ),

    /**
     * 序号
     */
    sequence: firstDefined(
      record.sequence,
      record.序号,
      index + 1,
    ),

    /**
     * 姓名
     */
    name: getObjectText(
      firstDefined(
        record.name,
        record.姓名,
      ),
    ),

    /**
     * 性别
     */
    gender: getObjectText(
      firstDefined(
        record.gender,
        record.性别,
      ),
    ),

    /**
     * 出生年月
     */
    birthday: getObjectText(
      firstDefined(
        record.birthday,
        record.出生年月,
      ),
    ),

    /**
     * 政治面貌
     */
    political: getObjectText(
      firstDefined(
        record.political,
        record.政治面貌,
      ),
    ),

    /**
     * 户籍地
     */
    household: getObjectText(
      firstDefined(
        record.household,
        record.户籍地,
      ),
    ),

    /**
     * 常住地
     */
    residence: getObjectText(
      firstDefined(
        record.residence,
        record.常住地,
      ),
    ),

    /**
     * 归口单位（数据责任单位）。
     *
     * 乡镇账号的数据隔离、
     * 统计页乡镇筛选都比对这个字段。
     */
    responsibleUnit: getObjectText(
      firstDefined(
        record.responsibleUnit,
        record.归口单位,
      ),
    ),

    /**
     * 个人基本情况
     */
    basic: getObjectText(
      firstDefined(
        record.basic,
        record.个人基本情况,
        findFieldValue(
          record,
          [
            'basic',
            '个人基本情况',
          ],
        ),
        '',
      ),
    ),

    /**
     * 联系方式
     */
    phone: getObjectText(
      firstDefined(
        record.phone,
        record.联系方式,
      ),
    ),

    /**
     * 监护人姓名
     */
    guardian: getObjectText(
      firstDefined(
        record.guardian,
        record.监护人姓名,
      ),
    ),

    /**
     * 监护人联系方式
     */
    guardianPhone:
      getObjectText(
        firstDefined(
          record.guardianPhone,
          record.监护人联系方式,
        ),
      ),

    /**
     * 是否需要帮扶
     */
    helpRequired,

    /**
     * 困难大类
     */
    bigCategory:
      getObjectText(
        rawBigCategory,
      ),

    /**
     * 困难小类
     */
    categories:
      getCategoryValue(
        rawCategories,
      ),

    /**
     * 数据时间戳
     *
     * 后端在“数据时间戳”为空时会退化成 CreatedAt。
     *
     * 数据统计页的“按日期纵向对比”
     * 依赖这个字段：
     *
     *     统计某个日期截止时的数据
     *     就是取 数据时间戳 <= 该日期 的记录。
     */
    timestamp:
      getObjectText(
        firstDefined(
          record.timestamp,
          record.数据时间戳,
          record.CreatedAt,
          '',
        ),
      ),

    /**
     * 风险排查
     */
    risks,

       /**
     * 帮扶需求摘要
     *
     * 用于列表页显示简短的需求信息。
     *
     * 例如：
     * 助学 | 就业帮扶
     */
    helpNeed:
      normalizeHelpNeed(
        record,
      ),

    /**
     * 完整帮扶需求记录
     *
     * 后端 server.js 已经将关联的
     * 帮扶需求整理成数组。
     *
     * 详情页 HelpNeeds.jsx
     * 直接使用这个数组显示每一条记录。
     */
    helpNeeds:
      Array.isArray(
        record.helpNeeds,
      )
        ? record.helpNeeds
        : [],

    /**
     * 是否结对帮扶
     */

    /**
     * 是否结对帮扶
     */
    pairing:
      pairing.pairing,

    /**
     * 结对帮扶联系人
     */
    pairingContact:
      pairing.contact,

    /**
     * 结对帮扶联系电话
     */
    pairingPhone:
      pairing.phone,

    /**
     * 结对帮扶所属单位
     */
    pairingUnit:
      pairing.unit,

       /**
     * 完整帮扶记录列表
     *
     * 后端已经将帮扶记录整理成数组，
     * 这里直接保留下来。
     *
     * 这样 YouthDetail.jsx、
     * HelpRecords.jsx 后续都可以直接使用。
     */
    helpRecordList:
      Array.isArray(
        record.helpRecordList,
      )
        ? record.helpRecordList
        : [],

    /**
     * 帮扶记录数量
     *
     * 这里只保存数量，
     * 方便 YouthTable.jsx 直接显示：
     *
     * 3条
     */
    helpRecords:
      getHelpRecordCount(
        record,
      ),

    /**
     * 备注
     */
    remark:
      getObjectText(
        firstDefined(
          record.remark,
          record.备注,
        ),
      ),
  }
}