/**
 * =========================================================
 * NocoDB 记录标准化
 * =========================================================
 *
 * 从 server.js 拆出。
 *
 * NocoDB 返回的记录结构不稳定
 *（同一张表不同记录可能缺字段、多层嵌套、
 *  关联字段有时是对象有时是数组），
 * 直接往前端抛会出现 undefined 崩溃。
 *
 * 这里统一把各种形态的原始数据
 * 归一成前端稳定消费的结构。
 *
 * 全部是纯函数，不依赖运行时状态。
 * =========================================================
 */

const security = require('../security')

const {
  cleanValue,
  getObjectText,
  normalizeNeedHelp,
  firstValue,
  getRecordFields,
} = require('./fields')

function normalizeCategoryRecord(record) {
  const fields = getRecordFields(record)

  const name = cleanValue(
    firstValue(fields, [
      '小类名称',
      '名称',
      'Title',
      'title'
    ])
  )

  const bigCategory = cleanValue(
    firstValue(fields, [
      '大类',
      '大类名称',
      '类别'
    ])
  )

  return {
    id: record.id || record.Id || '',
    name,
    bigCategory,
    raw: record
  }
}

function normalizeRiskRecord(record) {
  const fields = getRecordFields(record)

  const id =
    record?.Id ??
    record?.id ??
    fields.Id ??
    fields.id ??
    ''

  const title =
    firstValue(fields, [
      'Title',
      'title',
      '名称',
      '标题',
    ]) || ''

  const date =
    firstValue(fields, [
      '排查日期',
      '日期',
      '风险排查日期',
    ]) || ''

  const status =
    firstValue(fields, [
      '是否存在风险',
      '风险状态',
      '是否有风险',
    ]) || ''

  const description =
    firstValue(fields, [
      '风险隐患描述',
      '风险描述',
      '隐患描述',
    ]) || ''

  const handling =
    firstValue(fields, [
      '处置情况',
      '风险处置情况',
      '处理情况',
    ]) || ''

  const inspector =
    firstValue(fields, [
      '排查人',
      '检查人',
      '排查人员',
    ]) || ''

  const remark =
    firstValue(fields, [
      '备注',
    ]) || ''

  // 保存风险记录创建时间。
  //
  // 作用：
  // 当同一个青少年在同一天存在多条风险排查记录时，
  // 前端可以先按照“排查日期”判断新旧，
  // 如果日期相同，再按照“创建时间”判断新旧。
  //
  // 不同版本的 NocoDB 返回字段名称可能略有差异，
  // 因此这里同时兼容多个可能的字段名称。
  const createdAt =
    firstValue(fields, [
      'CreatedAt',
      'createdAt',
      'created_at',
      '创建时间',
      '记录创建时间',
    ]) ||
    record?.CreatedAt ||
    record?.createdAt ||
    record?.created_at ||
    ''

  return {
    id,
    title,
    date,
    status,
    description,
    handling,
    inspector,
    remark,

    // 风险记录创建时间。
    // 前端 riskUtils.js 会使用它进行同一天记录的排序。
    createdAt,

    // 保留 NocoDB 原始记录，方便以后扩展。
    raw: record,
  }
}

function normalizeHelpNeedRecord(record) {
  const fields = getRecordFields(record)

  const type = cleanValue(
    firstValue(fields, [
      '需求类型',
      '类型'
    ])
  )

  const description = cleanValue(
    firstValue(fields, [
      '需求描述',
      '描述'
    ])
  )

  const solved = cleanValue(
    firstValue(fields, [
      '是否已解决',
      '是否解决'
    ])
  )

  return {
    id: record.id || record.Id || '',
    title: cleanValue(
      firstValue(fields, [
        'Title',
        'title'
      ])
    ),
    type,
    description,
    solved,
    date: cleanValue(
      firstValue(fields, [
        '提出日期'
      ])
    ),
    solvedDate: cleanValue(
      firstValue(fields, [
        '解决日期'
      ])
    ),
    remark: cleanValue(
      firstValue(fields, [
        '备注'
      ])
    ),
    raw: record
  }
}

function normalizePairingRecord(record) {
  const fields = getRecordFields(record)

  return {
    id: record.id || record.Id || '',
    title: cleanValue(
      firstValue(fields, [
        'Title',
        'title'
      ])
    ),
    need: cleanValue(
      firstValue(fields, [
        '是否需要结对帮扶'
      ])
    ),
    contact: cleanValue(
      firstValue(fields, [
        '帮扶联系人'
      ])
    ),
    phone: cleanValue(
      firstValue(fields, [
        '联系电话'
      ])
    ),
    unit: cleanValue(
      firstValue(fields, [
        '所属单位',
        '工作单位'
      ])
    ),
    startDate: cleanValue(
      firstValue(fields, [
        '开始日期'
      ])
    ),
    endDate: cleanValue(
      firstValue(fields, [
        '结束日期'
      ])
    ),
    status: cleanValue(
      firstValue(fields, [
        '帮扶状态'
      ])
    ),
    remark: cleanValue(
      firstValue(fields, [
        '备注'
      ])
    ),
    raw: record
  }
}

function normalizeHelpRecord(record) {
  const fields = getRecordFields(record)

  return {
    id: record.id || record.Id || '',
    title: cleanValue(
      firstValue(fields, [
        'Title',
        'title'
      ])
    ),
    date: cleanValue(
      firstValue(fields, [
        '帮扶日期'
      ])
    ),
    method: cleanValue(
      firstValue(fields, [
        '帮扶方式'
      ])
    ),
    content: cleanValue(
      firstValue(fields, [
        '帮扶内容'
      ])
    ),
    materials: cleanValue(
      firstValue(fields, [
        '帮扶物资'
      ])
    ),
    amount: cleanValue(
      firstValue(fields, [
        '帮扶金额'
      ])
    ),
    contact: cleanValue(
      firstValue(fields, [
        '帮扶联系人'
      ])
    ),
    remark: cleanValue(
      firstValue(fields, [
        '备注'
      ])
    ),
    photos: firstValue(fields, [
      '帮扶照片'
    ]),
    raw: record
  }
}

function getLinkedIds(value) {
  const ids = []

  function walk(item, depth = 0) {
    if (
      item === null ||
      item === undefined ||
      depth > 10
    ) {
      return
    }

    if (
      typeof item === 'string' ||
      typeof item === 'number'
    ) {
      ids.push(String(item))
      return
    }

    if (Array.isArray(item)) {
      item.forEach(child =>
        walk(child, depth + 1)
      )
      return
    }

    if (typeof item === 'object') {
      const idKeys = [
        'id',
        'Id',
        'ID',
        'recordId',
        'record_id'
      ]

      for (const key of idKeys) {
        if (
          item[key] !== undefined &&
          item[key] !== null &&
          item[key] !== ''
        ) {
          ids.push(String(item[key]))
          break
        }
      }

      const nestedKeys = [
        'data',
        'records',
        'list',
        'record',
        'value',
        'items'
      ]

      nestedKeys.forEach(key => {
        if (item[key] !== undefined) {
          walk(item[key], depth + 1)
        }
      })
    }
  }

  walk(value)

  return [...new Set(ids)]
}

function buildRelationMap(records, normalizer) {
  const map = new Map()

  records.forEach(record => {
    const id = String(
      record.id ||
        record.Id ||
        ''
    )

    if (id) {
      map.set(
        id,
        normalizer(record)
      )
    }
  })

  return map
}

function getRelationField(fields, names) {
  return firstValue(fields, names)
}

function normalizeYouthRecords(
  youthRecords,
  categoryRecords,
  riskRecords,
  helpNeedRecords,
  pairingRecords,
  helpRecords
) {
  const categoryMap =
    buildRelationMap(
      categoryRecords,
      normalizeCategoryRecord
    )

  const riskMap =
    buildRelationMap(
      riskRecords,
      normalizeRiskRecord
    )

  const helpNeedMap =
    buildRelationMap(
      helpNeedRecords,
      normalizeHelpNeedRecord
    )

  const pairingMap =
    buildRelationMap(
      pairingRecords,
      normalizePairingRecord
    )

  const helpRecordMap =
    buildRelationMap(
      helpRecords,
      normalizeHelpRecord
    )

  const normalized = []

  youthRecords.forEach(
    (youth, index) => {
      const fields =
        getRecordFields(youth)

      const youthId =
        youth.id ||
        youth.Id ||
        'youth-' +
          (index + 1)

      const rawNeedHelp =
        firstValue(
          fields,
          [
            '是否需要帮扶',
            '需要帮扶',
            '是否需帮扶',
            'needHelp'
          ]
        )

      const needHelp =
        normalizeNeedHelp(
          rawNeedHelp
        )

      const categoryRelation =
        getRelationField(
          fields,
          [
            '困难类别',
            '困难类别记录',
            '困难类别表',
            '困难类别记录s'
          ]
        )

      const riskRelation =
        getRelationField(
          fields,
          [
            '风险排查记录',
            '风险排查处置表',
            '风险排查处置记录',
            '风险排查情况'
          ]
        )

      const helpNeedRelation =
        getRelationField(
          fields,
          [
            '帮扶需求记录',
            '帮扶需求',
            '帮扶需求表'
          ]
        )

      const pairingRelation =
        getRelationField(
          fields,
          [
            '结对帮扶记录',
            '结对帮扶',
            '结对帮扶表'
          ]
        )

      const helpRecordRelation =
        getRelationField(
          fields,
          [
            '帮扶记录',
            '帮扶记录表'
          ]
        )

      const categoryIds =
        getLinkedIds(
          categoryRelation
        )

      const riskIds =
        getLinkedIds(
          riskRelation
        )

      const helpNeedIds =
        getLinkedIds(
          helpNeedRelation
        )

      const pairingIds =
        getLinkedIds(
          pairingRelation
        )

      const helpRecordIds =
        getLinkedIds(
          helpRecordRelation
        )

      const categories =
        categoryIds
          .map(id =>
            categoryMap.get(id)
          )
          .filter(Boolean)

      const risks =
        riskIds
          .map(id =>
            riskMap.get(id)
          )
          .filter(Boolean)

      const helpNeeds =
        helpNeedIds
          .map(id =>
            helpNeedMap.get(id)
          )
          .filter(Boolean)

      const pairings =
        pairingIds
          .map(id =>
            pairingMap.get(id)
          )
          .filter(Boolean)

      const youthHelpRecords =
        helpRecordIds
          .map(id =>
            helpRecordMap.get(id)
          )
          .filter(Boolean)

      const categoryNames =
        categories
          .map(item => item.name)
          .filter(Boolean)

      const bigCategories =
        categories
          .map(item =>
            item.bigCategory
          )
          .filter(Boolean)

      normalized.push({
        key:
          String(youthId),

        sequence:
          cleanValue(
            firstValue(
              fields,
              [
                '序号',
                '编号'
              ]
            )
          ),

        name:
          cleanValue(
            firstValue(
              fields,
              [
                '姓名',
                'Name'
              ]
            )
          ),

        gender:
          cleanValue(
            firstValue(
              fields,
              [
                '性别'
              ]
            )
          ),

        birthday:
          cleanValue(
            firstValue(
              fields,
              [
                '出生年月',
                '出生日期'
              ]
            )
          ),

        political:
          cleanValue(
            firstValue(
              fields,
              [
                '政治面貌'
              ]
            )
          ),

        household:
          cleanValue(
            firstValue(
              fields,
              [
                '户籍地'
              ]
            )
          ),

        residence:
          cleanValue(
            firstValue(
              fields,
              [
                '常住地'
              ]
            )
          ),

        /**
         * 归口单位（数据责任单位）。
         *
         * 乡镇账号的数据隔离
         * 改为比对这个字段，
         * 而不是户籍地 / 常住地文本。
         */
        responsibleUnit:
          cleanValue(
            firstValue(
              fields,
              [
                '归口单位',
                'responsible_unit'
              ]
            )
          ),

        basic:
          cleanValue(
            firstValue(
              fields,
              [
                '基本情况',
                '家庭情况'
              ]
            )
          ),

        phone:
          cleanValue(
            firstValue(
              fields,
              [
                '联系方式',
                '联系电话',
                '手机号码'
              ]
            )
          ),

        guardian:
          cleanValue(
            firstValue(
              fields,
              [
                '监护人',
                '监护人姓名'
              ]
            )
          ),

        guardianPhone:
          cleanValue(
            firstValue(
              fields,
              [
                '监护人联系方式',
                '监护人电话'
              ]
            )
          ),

        remark:
          cleanValue(
            firstValue(
              fields,
              [
                '备注'
              ]
            )
          ),

        needHelp,

        /**
         * 数据时间戳。
         *
         * 数据统计页的“按日期纵向对比”
         * 依赖这个字段：
         *
         *     统计某个日期截止时的数据，
         *     就是取 数据时间戳 <= 该日期 的记录。
         *
         * 没有时间戳时退化为创建时间。
         */
        timestamp:
          cleanValue(
            firstValue(
              fields,
              ['数据时间戳']
            )
          ) ||
          cleanValue(
            youth.CreatedAt
          ),

        bigCategory:
          [
            ...new Set(
              bigCategories
            )
          ].join('、'),

        categories:
          [
            ...new Set(
              categoryNames
            )
          ],

        risks,

        helpNeeds,

        pairing:
          pairings.length > 0
            ? pairings[0].need
            : '',

        pairingContact:
          pairings.length > 0
            ? pairings[0].contact
            : '',

        pairingPhone:
          pairings.length > 0
            ? pairings[0].phone
            : '',

        pairingUnit:
          pairings.length > 0
            ? pairings[0].unit
            : '',

        pairingRecords:
          pairings,

        // 完整的帮扶记录数组，供青少年详情页使用
        helpRecordList:
          youthHelpRecords,

        // 帮扶记录数量，供列表页和统计使用
        helpRecords:
          youthHelpRecords.length,

        helpRecordCount:
          youthHelpRecords.length,

        _raw:
          youth
      })
    }
  )

  const needYesCount =
    normalized.filter(
      record =>
        record.needHelp === '是'
    ).length

  const needNoCount =
    normalized.filter(
      record =>
        record.needHelp === '否'
    ).length

  const needEmptyCount =
    normalized.length -
    needYesCount -
    needNoCount

  console.log(
    '青少年数据：' +
      normalized.length +
      ' 条'
  )

  console.log(
    '是否需要帮扶=是：' +
      needYesCount +
      ' 条'
  )

  console.log(
    '是否需要帮扶=否：' +
      needNoCount +
      ' 条'
  )

  console.log(
    '是否需要帮扶=空：' +
      needEmptyCount +
      ' 条'
  )

  return normalized
}


module.exports = {
  normalizeCategoryRecord,
  normalizeRiskRecord,
  normalizeHelpNeedRecord,
  normalizePairingRecord,
  normalizeHelpRecord,
  getLinkedIds,
  buildRelationMap,
  getRelationField,
  normalizeYouthRecords,
}
