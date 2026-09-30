 /*
  * 青少年系统——风险排查业务工具
  *
  * 本文件专门负责“风险排查”相关的数据处理。
  *
  * 主要职责：
  * 1. 从青少年主记录中读取风险排查关联记录。
  * 2. 统一处理“是否存在风险”的各种数据库返回格式。
  * 3. 将风险排查记录标准化。
  * 4. 统一按照“最新排查在前、历史排查在后”排序。
  * 5. 判断一名青少年的风险排查总体状态。
  * 6. 提取风险状态列表。
  * 7. 提取最新一次风险排查的风险隐患描述。
  *
  * 本文件不负责：
  * 1. 页面展示
  * 2. React 状态
  * 3. Ant Design 组件
  * 4. 数据库写入
  *
  * 因此 YouthTable、YouthDetail、YouthForm、
  * Dashboard、风险排查页面等其他模块都可以独立使用本文件。
  */

import {
  firstDefined,
  hasValue,
  getObjectText,
  unwrapRelation,
  getField,
} from './youthUtils'

/* =========================================================
   读取风险排查关联记录
   ========================================================= */

/*
 * 从青少年主记录中读取风险排查记录。
 *
 * NocoDB 返回的数据结构可能存在差异，因此这里同时兼容：
 *
 * risks
 * 风险排查记录
 * 风险排查记录s
 * 风险排查处置表
 * 风险排查处置表s
 * 风险排查
 * riskRecords
 * risk_records
 * risk
 * 风险排查情况
 */
function getRiskRawRecords(record) {
  if (
    !record ||
    typeof record !== 'object'
  ) {
    return []
  }

  /*
   * 如果前面的数据标准化过程已经准备好了 risks，
   * 优先直接使用。
   */
  if (
    Array.isArray(record.risks)
  ) {
    return record.risks
  }

  const relationNames = [
    '风险排查记录',
    '风险排查记录s',
    '风险排查处置表',
    '风险排查处置表s',
    '风险排查',
    'riskRecords',
    'risk_records',
    'risks',
    'risk',
    '风险排查情况',
  ]

  const raw = getField(
    record,
    relationNames,
  )

  if (!hasValue(raw)) {
    return []
  }

  return unwrapRelation(raw).filter(
    (item) =>
      item !== null &&
      item !== undefined,
  )
}

/* =========================================================
   风险状态标准化
   ========================================================= */

/*
 * 将数据库中可能出现的各种风险状态统一成：
 *
 * 是
 * 否
 * ''
 *
 * 例如：
 *
 * 是 / 有 / 存在风险 / 有风险 / true / yes / 1
 *                         ↓
 *                        是
 *
 * 否 / 无 / 无风险 / 不存在风险 / false / no / 0
 *                         ↓
 *                        否
 */
function normalizeRiskStatus(value) {
  const text =
    getObjectText(value)
      .trim()
      .toLowerCase()

  if (
    text === '是' ||
    text === '有' ||
    text === '存在风险' ||
    text === '有风险' ||
    text === 'true' ||
    text === 'yes' ||
    text === 'y' ||
    text === '1'
  ) {
    return '是'
  }

  if (
    text === '否' ||
    text === '无' ||
    text === '无风险' ||
    text === '不存在风险' ||
    text === 'false' ||
    text === 'no' ||
    text === 'n' ||
    text === '0'
  ) {
    return '否'
  }

  return ''
}

/* =========================================================
   日期标准化与排序
   ========================================================= */

/*
 * 将风险排查日期转换成可以比较的时间戳。
 *
 * 兼容：
 *
 * 2026-09-25
 * 2026-09-25 10:30:00
 * 2026/09/25
 * 2026年09月25日
 *
 * 如果日期为空或者无法识别：
 * 返回 0。
 */
function getRiskDateTimestamp(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0
  }

  const text =
    getObjectText(value)
      .trim()

  if (!text) {
    return 0
  }

  /*
   * 统一中文日期、斜杠日期。
   */
  const normalizedText =
    text
      .replace(
        /年/g,
        '-',
      )
      .replace(
        /月/g,
        '-',
      )
      .replace(
        /日/g,
        '',
      )
      .replace(
        /\//g,
        '-',
      )

  const timestamp =
    Date.parse(
      normalizedText,
    )

  if (
    Number.isFinite(timestamp)
  ) {
    return timestamp
  }

  /*
   * 对纯年月日格式做一次兜底处理。
   */
  const match =
    normalizedText.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/,
    )

  if (match) {
    const year =
      Number(match[1])

    const month =
      Number(match[2])

    const day =
      Number(match[3])

    const date =
      new Date(
        year,
        month - 1,
        day,
      )

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      return date.getTime()
    }
  }

  return 0
}

/*
 * 获取风险记录创建时间。
 *
 * 主要用于：
 * 同一天存在多条排查记录时，
 * 按创建时间从新到旧排列。
 */
function getRiskCreatedTimestamp(risk) {
  if (
    !risk ||
    typeof risk !== 'object'
  ) {
    return 0
  }

  const value =
    firstDefined(
      risk.createdAt,
      risk.created_at,
      risk['CreatedAt'],
      risk['创建时间'],
      risk['记录创建时间'],
      '',
    )

  if (
    !hasValue(value)
  ) {
    return 0
  }

  const timestamp =
    Date.parse(
      getObjectText(value),
    )

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : 0
}

/*
 * =========================================================
 * 风险排查记录统一排序
 * =========================================================
 *
 * 排序原则：
 *
 * 第一优先级：
 * 添加时间 最新 → 最旧
 *
 * 第二优先级：
 * 排查日期 最新 → 最旧
 *
 * 第三优先级：
 * NocoDB 记录 ID 大 → 小
 *
 * 为什么第一优先级使用“添加时间”？
 *
 * 因为用户要求：
 *
 *     最后添加的风险排查记录
 *             ↓
 *         永远排在最前面
 *
 * 即使两条记录的“排查日期”完全相同，
 * 后添加的那一条也必须排在前面。
 *
 * 如果历史数据没有创建时间，
 * 则自动退回：
 *
 *     排查日期
 *         ↓
 *     ID
 *
 * 进行排序。
 * =========================================================
 */
function sortRisksLatestFirst(risks) {
  if (
    !Array.isArray(risks)
  ) {
    return []
  }

  return [
    ...risks,
  ].sort(
    (a, b) => {
      /*
       * -----------------------------------------------------
       * 第一优先级：添加时间
       * -----------------------------------------------------
       */
      const createdA =
        getRiskCreatedTimestamp(
          a,
        )

      const createdB =
        getRiskCreatedTimestamp(
          b,
        )

      /*
       * 如果两条记录都有创建时间，
       * 直接按照创建时间倒序。
       */
      if (
        createdA !==
        createdB
      ) {
        return (
          createdB -
          createdA
        )
      }

      /*
       * -----------------------------------------------------
       * 第二优先级：排查日期
       * -----------------------------------------------------
       */
      const dateA =
        getRiskDateTimestamp(
          a?.date,
        )

      const dateB =
        getRiskDateTimestamp(
          b?.date,
        )

      if (
        dateA !==
        dateB
      ) {
        return (
          dateB -
          dateA
        )
      }

      /*
       * -----------------------------------------------------
       * 第三优先级：数据库 ID
       * -----------------------------------------------------
       *
       * NocoDB 新创建的记录 ID 通常更大。
       *
       * 因此如果：
       *
       *     创建时间一样
       *     排查日期也一样
       *
       * 那么 ID 大的记录排在前面。
       */
      const idA =
        String(
          a?.id ??
            a?.Id ??
            a?.ID ??
            '',
        )

      const idB =
        String(
          b?.id ??
            b?.Id ??
            b?.ID ??
            '',
        )

      return idB.localeCompare(
        idA,
        undefined,
        {
          numeric: true,
        },
      )
    },
  )
}

/**
 * =========================================================
 * 写入一条风险排查记录（新增或替换）
 * =========================================================
 *
 * 用户要求的顺序规则：
 *
 *     1. 新增的记录排在最前面
 *     2. 编辑已有记录时，位置保持不变
 *
 * 以前的做法是：
 *
 *     不管新增还是编辑，
 *     都把记录塞到最前面再整体排序。
 *
 * 这样一旦服务器返回的创建时间有偏差，
 * 刚编辑过的记录就会“跑到最后”，
 * 用户以为记录丢了。
 *
 * 现在改成：
 *
 *     已经存在的记录：原地替换，不动位置
 *     不存在的记录：放到最前面
 *
 * 这样编辑顺序稳定，新增又始终可见。
 * =========================================================
 */
function upsertRiskRecord(
  risks,
  newRisk,
) {
  const list =
    Array.isArray(risks)
      ? risks
      : []

  const record =
    normalizeRiskRecord(
      newRisk,
    )

  if (!record.id) {
    return list
  }

  const targetId =
    String(record.id).trim()

  const index =
    list.findIndex(
      (risk) =>
        String(
          risk?.id ??
            risk?.Id ??
            risk?.ID ??
            '',
        ).trim() ===
        targetId,
    )

  /**
   * 已存在：原地替换。
   *
   * 服务器返回的空字段不能覆盖本地已有值，
   * 否则界面又会变成空白。
   */
  if (index >= 0) {
    const old =
      list[index]

    const merged = {
      ...old,
    }

    Object.keys(
      record,
    ).forEach((key) => {
      const value =
        record[key]

      if (
        value ===
          undefined ||
        value === null ||
        value === ''
      ) {
        return
      }

      merged[key] =
        value
    })

    /**
     * 创建时间必须沿用原来的，
     * 保证顺序不变。
     */
    merged.id =
      old.id

    merged.createdAt =
      old.createdAt ||
      record.createdAt ||
      ''

    const next = [...list]

    next[index] = merged

    return next
  }

  /**
   * 不存在：新增，放到最前面。
   */
  return [
    record,
    ...list,
  ]
}

/* =========================================================
   单条风险记录标准化
   ========================================================= */

/*
 * 将一条 NocoDB 风险排查记录转换成系统统一结构。
 *
 * 统一后的结构：
 *
 * {
 *   id,
 *   date,
 *   hasRisk,
 *   status,
 *   description,
 *   handling,
 *   inspector,
 *   remark,
 *   title,
 *   createdAt
 * }
 */
function normalizeRiskRecord(risk) {
  if (!risk) {
    return {
      id: '',
      date: '',
      hasRisk: '',
      status: '',
      description: '',
      handling: '',
      inspector: '',
      remark: '',
      title: '',
      createdAt: '',
    }
  }

  const hasRisk =
    normalizeRiskStatus(
      firstDefined(
        risk.hasRisk,
        risk.status,
        risk['是否存在风险'],
        risk['是否有风险'],
      ),
    )

  const createdAt =
    firstDefined(
      risk.createdAt,
      risk.created_at,
      risk['CreatedAt'],
      risk['创建时间'],
      risk['记录创建时间'],
      '',
    )

  return {
    id: String(
      firstDefined(
        risk.id,
        risk.Id,
        risk.ID,
        '',
      ),
    ),

    date: getObjectText(
      firstDefined(
        risk.date,
        risk['排查日期'],
        risk['日期'],
        '',
      ),
    ),

    hasRisk,

    status: hasRisk,

    description:
      getObjectText(
        firstDefined(
          risk.description,
          risk['风险隐患描述'],
          risk['风险描述'],
          '',
        ),
      ),

    handling:
      getObjectText(
        firstDefined(
          risk.handling,
          risk['处置情况'],
          risk['风险处置情况'],
          '',
        ),
      ),

    inspector:
      getObjectText(
        firstDefined(
          risk.inspector,
          risk['排查人'],
          '',
        ),
      ),

    remark: getObjectText(
      firstDefined(
        risk.remark,
        risk['备注'],
        '',
      ),
    ),

    title: getObjectText(
      firstDefined(
        risk.title,
        risk.Title,
        '',
      ),
    ),

    createdAt:
      getObjectText(
        createdAt,
      ),
  }
}

/* =========================================================
   全部风险记录标准化
   ========================================================= */

/*
 * 统一标准化以后，立即进行排序。
 *
 * 这样整个系统后面的页面只需要使用：
 *
 * record.risks
 *
 * 就能得到：
 *
 * 最新排查
 * ↓
 * 较新排查
 * ↓
 * 更早排查
 * ↓
 * 历史排查
 */
function normalizeRisks(record) {
  const rawRisks =
    getRiskRawRecords(record)

  const normalizedRisks =
    rawRisks
      .map(
        normalizeRiskRecord,
      )
      .filter(
        (risk) =>
          risk.date ||
          risk.hasRisk ||
          risk.description ||
          risk.handling ||
          risk.inspector ||
          risk.remark ||
          risk.title,
      )

  return sortRisksLatestFirst(
    normalizedRisks,
  )
}

/* =========================================================
   获取最新一条风险排查记录
   ========================================================= */

/*
 * 返回最新一次风险排查记录。
 *
 * 因为 normalizeRisks() 已经统一排序，
 * 所以这里直接取 risks[0]。
 */
function getLatestRisk(record) {
  const risks =
    Array.isArray(
      record?.risks,
    )
      ? sortRisksLatestFirst(
          record.risks,
        )
      : normalizeRisks(
          record,
        )

  return risks.length > 0
    ? risks[0]
    : null
}


function getRiskFilterStatus(record) {

  /*
   * ========================================================
   * 获取风险排查记录
   * ========================================================
   *
   * normalizeRisks() 已经按照：
   *
   * 最新排查日期
   * ↓
   * 创建时间
   * ↓
   * 记录ID
   *
   * 从新到旧进行了排序。
   *
   * 因此 risks[0] 就是最新一次风险排查。
   * ========================================================
   */

  const risks =
    Array.isArray(record?.risks)
      ? sortRisksLatestFirst(
          record.risks,
        )
      : normalizeRisks(
          record,
        )

  /*
   * 没有风险排查记录。
   */

  if (
    risks.length === 0
  ) {
    return '未排查'
  }

  /*
   * ========================================================
   * 当前风险状态只看“最新一次排查”
   * ========================================================
   *
   * 不能再把历史记录中的“是”一直保留到现在。
   *
   * 例如：
   *
   * 2026-09-20 → 是否存在风险：是
   * 2026-09-26 → 是否存在风险：否
   *
   * 当前状态应该是：
   *
   * 无风险
   *
   * 而不是：
   *
   * 有风险
   * ========================================================
   */

  const latestRisk =
    risks[0]

  const latestStatus =
    normalizeRiskStatus(
      firstDefined(
        latestRisk?.hasRisk,
        latestRisk?.status,
        latestRisk?.['是否存在风险'],
        latestRisk?.['是否有风险'],
      ),
    )

  /*
   * 最新一次排查明确存在风险。
   */

  if (
    latestStatus === '是'
  ) {
    return '有风险'
  }

  /*
   * 最新一次排查明确不存在风险。
   */

  if (
    latestStatus === '否'
  ) {
    return '无风险'
  }

  /*
   * 最新记录存在，但是“是否存在风险”
   * 没有得到明确的“是/否”。
   */

  return '未排查'
}

/* =========================================================
   获取风险状态列表
   ========================================================= */

/*
 * 返回的顺序同样是：
 *
 * 最新排查 → 历史排查
 */
function getRiskStatuses(record) {
  const risks =
    Array.isArray(record?.risks)
      ? sortRisksLatestFirst(
          record.risks,
        )
      : []

  return risks.map((risk) =>
    normalizeRiskStatus(
      firstDefined(
        risk?.hasRisk,
        risk?.status,
        risk?.['是否存在风险'],
        risk?.['是否有风险'],
      ),
    ),
  )
}

/* =========================================================
   获取最新风险隐患描述
   ========================================================= */

/*
 * 重要规则：
 *
 * 青少年列表中的“风险排查”属性，
 * 不再把所有历史风险描述拼接起来。
 *
 * 只显示：
 *
 * 最新一次排查记录
 * ↓
 * 风险隐患描述
 *
 * 例如：
 *
 * 2026-09-25：近期存在心理波动
 * 2026-09-10：家庭矛盾较多
 * 2026-08-20：学习压力较大
 *
 * 页面显示：
 *
 * 近期存在心理波动
 */
function getRiskDescriptions(record) {
  const latestRisk =
    getLatestRisk(
      record,
    )

  if (!latestRisk) {
    return ''
  }

  return String(
    latestRisk.description ||
      latestRisk[
        '风险隐患描述'
      ] ||
      '',
  ).trim()
}

/* =========================================================
   统一导出
   ========================================================= */

export {
  getRiskRawRecords,
  normalizeRiskStatus,
  normalizeRiskRecord,
  normalizeRisks,
  sortRisksLatestFirst,
  upsertRiskRecord,
  getLatestRisk,
  getRiskFilterStatus,
  getRiskStatuses,
  getRiskDescriptions,
}