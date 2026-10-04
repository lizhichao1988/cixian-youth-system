/**
 * =========================================================
 * 青少年写入辅助模块
 * =========================================================
 *
 * 负责几件 server.js 原本没有做、
 * 但业务上必须落库的事情：
 *
 * 1. 困难类别（关联表）写入
 *
 *      “困难类别”在 NocoDB 里是一张独立的表，
 *      青少年基本信息表通过链接字段关联它。
 *
 *      实测结论：
 *      PATCH 直接写链接字段不会生效（返回 200 但不改），
 *      必须走 links 接口：
 *
 *          解绑  DELETE /links/{字段}/records/{青少年Id}  body:[{Id:n}]
 *          绑定  POST   /links/{字段}/records/{青少年Id}  body:{Id:n}
 *
 * 2. 困难大类（单选字段）写入
 *
 * 3. 帮扶需求写入
 *
 *      “帮扶需求”也是独立表。
 *      一人一档详情页里编辑的那一行需求，
 *      有则改、无则建，并自动建立关联。
 *
 * 4. 结对帮扶写入
 *
 *      同上，有则改、无则建。
 *
 * 5. 新增青少年
 *
 * 为什么要单独拆一个文件？
 *
 *     server.js 已经三千多行，
 *     继续往里堆会让主文件不可维护。
 *     这里只做“写入”，读取仍然在 server.js。
 * =========================================================
 */

/**
 * 青少年基本信息表上的三个链接字段 ID。
 *
 * 这三个 ID 来自 NocoDB 元数据，千万不要随意改。
 */
const security = require('./security')

const LINK_FIELD_IDS = {
  category: 'cd4skg38n743c7m',
  helpNeed: 'c4dh6pa0l5h7r19',
  pairing: 'cac1qz9ezx3u2hy',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 帮扶需求记录的 Title（NocoDB 列表 / 链接字段展示用）。
 *
 * 格式：序号 + 姓名 + 的需求
 *
 *   例：序号 1183、姓名 王海  ->  "1183王海的需求"
 *
 * 注意：这里用「序号」而不是 NocoDB 的 Id，
 * 因为业务上对外展示的是序号。
 */
function buildHelpNeedTitle(youth) {
  const seq = String(
    youth?.['序号'] ?? '',
  ).trim()

  const name = String(
    youth?.['姓名'] ?? '',
  ).trim()

  return `${seq}${name}的需求`
}

/**
 * 结对帮扶记录的 Title（NocoDB 列表 / 链接字段展示用）。
 *
 * 格式：序号 - 姓名 - 是/否
 *
 *   例：序号 1183、姓名 王海、已结对 -> "1183-王海-是"
 *
 * pairedLabel 只取「是 / 否」。
 */
function buildPairingTitle(
  youth,
  pairedLabel,
) {
  const seq = String(
    youth?.['序号'] ?? '',
  ).trim()

  const name = String(
    youth?.['姓名'] ?? '',
  ).trim()

  const flag =
    pairedLabel === '否' ? '否' : '是'

  return `${seq}-${name}-${flag}`
}

function createYouthWriter({
  NOCODB_BASE_URL,
  TABLE_IDS,
  getHeaders,
}) {
  /* =====================================================
     基础请求
     ===================================================== */

  async function request(
    url,
    options = {},
  ) {
    const response = await fetch(
      url,
      {
        ...options,
        headers: {
          ...getHeaders(),
          ...(options.headers ||
            {}),
        },
      },
    )

    const text =
      await response.text()

    let data = null

    try {
      data = text
        ? JSON.parse(text)
        : null
    } catch {
      data = null
    }

    if (!response.ok) {
      throw new Error(
        'NocoDB 请求失败：' +
          response.status +
          ' ' +
          String(text).slice(0, 300),
      )
    }

    return data
  }

  function recordsUrl(tableId) {
    return (
      NOCODB_BASE_URL +
      '/api/v2/tables/' +
      tableId +
      '/records'
    )
  }

  function linkUrl(
    youthId,
    linkFieldId,
  ) {
    return (
      NOCODB_BASE_URL +
      '/api/v2/tables/' +
      TABLE_IDS.youth +
      '/links/' +
      linkFieldId +
      '/records/' +
      youthId
    )
  }

  /**
   * 把 NocoDB 返回的各种链接结构
   * 统一成 [{Id:'1'},{Id:'2'}]。
   */
  function normalizeLinked(
    value,
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return []
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => ({
          Id: String(
            item?.Id ??
              item?.id ??
              item ??
              '',
          ),
        }))
        .filter(
          (item) => item.Id,
        )
    }

    if (
      typeof value === 'object'
    ) {
      const id =
        value.Id ?? value.id

      return id
        ? [{ Id: String(id) }]
        : []
    }

    if (
      typeof value === 'number'
    ) {
      return [
        { Id: String(value) },
      ]
    }

    return []
  }

  /* =====================================================
     困难类别索引
     ===================================================== */

  let categoryIndex = null

  async function getCategoryIndex(
    force = false,
  ) {
    if (
      !force &&
      categoryIndex &&
      Date.now() -
        categoryIndex.loadedAt <
        5 * 60 * 1000
    ) {
      return categoryIndex
    }

    const response =
      await fetch(
        recordsUrl(
          TABLE_IDS.categories,
        ) + '?limit=200',
        {
          headers: getHeaders(),
        },
      )

    const data =
      await response.json()

    const rows = data?.list ?? []

    const byName = new Map()
    const byId = new Map()

    rows.forEach((row) => {
      const id = row?.Id ?? row?.id

      const name = String(
        row?.['小类名称'] ?? '',
      ).trim()

      if (!id || !name) {
        return
      }

      const item = {
        id: String(id),
        name,
        bigCategory:
          String(
            row?.['大类'] ?? '',
          ).trim(),
      }

      byId.set(item.id, item)

      if (!byName.has(name)) {
        byName.set(name, item)
      }
    })

    categoryIndex = {
      byName,
      byId,
      loadedAt: Date.now(),
    }

    return categoryIndex
  }

  /* =====================================================
     读取单条青少年记录
     ===================================================== */

  async function getYouthRecord(
    youthId,
  ) {
    return await request(
      recordsUrl(
        TABLE_IDS.youth,
      ) +
        '/' +
        encodeURIComponent(
          youthId,
        ),
      { method: 'GET' },
    )
  }

  /* =====================================================
     写入
     ===================================================== */

  async function patchRows(
    tableId,
    rows,
  ) {
    if (!rows.length) {
      return null
    }

    /**
     * 手机号等敏感字段落库前加密。
     */
    const safeRows = rows.map(
      (row) =>
        security.encryptSensitiveFields({
          ...row,
        }),
    )

    return await request(
      recordsUrl(tableId),
      {
        method: 'PATCH',
        body: JSON.stringify(
          safeRows,
        ),
      },
    )
  }

  async function createRow(
    tableId,
    fields,
  ) {
    /**
     * 同上，写入前加密敏感字段。
     */
    const safeFields =
      security.encryptSensitiveFields({
        ...fields,
      })

    return await request(
      recordsUrl(tableId),
      {
        method: 'POST',
        body: JSON.stringify(
          safeFields,
        ),
      },
    )
  }

  function extractId(parsed) {
    if (Array.isArray(parsed)) {
      return (
        parsed[0]?.Id ??
        parsed[0]?.id ??
        null
      )
    }

    return (
      parsed?.Id ??
      parsed?.id ??
      null
    )
  }

  async function unlink(
    youthId,
    linkFieldId,
    targetId,
  ) {
    await request(
      linkUrl(
        youthId,
        linkFieldId,
      ),
      {
        method: 'DELETE',
        body: JSON.stringify([
          {
            Id: Number(
              targetId,
            ),
          },
        ]),
      },
    )
  }

  async function link(
    youthId,
    linkFieldId,
    targetId,
  ) {
    await request(
      linkUrl(
        youthId,
        linkFieldId,
      ),
      {
        method: 'POST',
        body: JSON.stringify({
          Id: Number(targetId),
        }),
      },
    )
  }

  /* =====================================================
     1. 困难类别 / 困难大类
     ===================================================== */

  async function syncCategory(
    youthId,
    {
      smallCategory,
      bigCategory,
    } = {},
  ) {
    const result = {
      bigCategory: false,
      smallCategory: false,
    }

    const index =
      await getCategoryIndex()

    const target =
      smallCategory
        ? index.byName.get(
            String(
              smallCategory,
            ).trim(),
          )
        : null

    /**
     * 大类：
     *
     * 优先使用前端传来的值，
     * 没传就用小类所在的大类。
     */
    const nextBigCategory =
      String(
        bigCategory ?? '',
      ).trim() ||
      target?.bigCategory ||
      ''

    if (nextBigCategory) {
      await patchRows(
        TABLE_IDS.youth,
        [
          {
            Id: Number(youthId),
            困难大类:
              nextBigCategory,
          },
        ],
      )

      result.bigCategory = true
    }

    if (!target) {
      return result
    }

    const youth =
      await getYouthRecord(
        youthId,
      )

    const current =
      normalizeLinked(
        youth?.['困难类别'],
      )

    for (const item of current) {
      if (
        item.Id !==
        String(target.id)
      ) {
        await unlink(
          youthId,
          LINK_FIELD_IDS.category,
          item.Id,
        )
      }
    }

    const alreadyLinked =
      current.some(
        (item) =>
          item.Id ===
          String(target.id),
      )

    if (!alreadyLinked) {
      await link(
        youthId,
        LINK_FIELD_IDS.category,
        target.id,
      )
    }

    result.smallCategory = true

    return result
  }

  /* =====================================================
     2. 帮扶需求
     ===================================================== */

  async function syncHelpNeed(
    youthId,
    text,
  ) {
    const value =
      String(text ?? '').trim()

    const youth =
      await getYouthRecord(
        youthId,
      )

    const linked =
      normalizeLinked(
        youth?.[
          '帮扶需求记录'
        ],
      )

    /**
     * Title 用于 NocoDB 列表 / 青少年表「帮扶需求记录」
     * 链接字段展示：
     *
     *     "1183王海的需求"
     */
    const title =
      buildHelpNeedTitle(youth)

    if (
      !value ||
      value === '暂无'
    ) {
      /**
       * 清空需求。
       *
       * 已经存在的需求记录只清空描述，
       * 不删除记录本身。
       */
      if (linked.length) {
        await patchRows(
          TABLE_IDS.helpNeeds,
          [
            {
              Id: Number(
                linked[0].Id,
              ),
              需求描述: '',
              Title: title,
            },
          ],
        )
      }

      return {
        action: 'clear',
      }
    }

    if (linked.length) {
      await patchRows(
        TABLE_IDS.helpNeeds,
        [
          {
            Id: Number(
              linked[0].Id,
            ),
            需求描述: value,
            数据时间戳: today(),
            Title: title,
          },
        ],
      )

      return {
        action: 'update',
        id: linked[0].Id,
      }
    }

    const created =
      await createRow(
        TABLE_IDS.helpNeeds,
        {
          需求描述: value,
          提出日期: today(),
          数据时间戳: today(),
          Title: title,
          青少年基本信息表: {
            Id: Number(youthId),
          },
        },
      )

    return {
      action: 'create',
      id: extractId(created),
    }
  }

  /* =====================================================
     3. 结对帮扶
     ===================================================== */

  async function syncPairing(
    youthId,
    {
      paired,
      contact,
      phone,
      unit,
    } = {},
  ) {
    const youth =
      await getYouthRecord(
        youthId,
      )

    const linked =
      normalizeLinked(
        youth?.[
          '结对帮扶记录'
        ],
      )

    const pairValue =
      String(paired ?? '').trim()

    const hasDetail =
      String(contact ?? '').trim() ||
      String(phone ?? '').trim() ||
      String(unit ?? '').trim()

    if (
      pairValue === '否' &&
      !hasDetail
    ) {
      if (linked.length) {
        await patchRows(
          TABLE_IDS.pairings,
          [
            {
              Id: Number(
                linked[0].Id,
              ),
              是否结对帮扶: '否',
              数据时间戳: today(),
              Title:
                buildPairingTitle(
                  youth,
                  '否',
                ),
            },
          ],
        )

        return { action: 'update' }
      }

      return { action: 'none' }
    }

    const fields = {
      是否结对帮扶:
        pairValue === '否'
          ? '否'
          : '是',
      帮扶联系人:
        String(
          contact ?? '',
        ).trim(),
      联系电话:
        String(
          phone ?? '',
        ).trim(),
      所属单位:
        String(unit ?? '').trim(),
      数据时间戳: today(),

      /**
       * Title 用于 NocoDB 列表 / 青少年表「结对帮扶记录」
       * 链接字段展示：
       *
       *     "1183-王海-是"
       */
      Title:
        buildPairingTitle(
          youth,
          pairValue === '否'
            ? '否'
            : '是',
        ),
    }

    if (linked.length) {
      await patchRows(
        TABLE_IDS.pairings,
        [
          {
            Id: Number(
              linked[0].Id,
            ),
            ...fields,
          },
        ],
      )

      return { action: 'update' }
    }

    const created =
      await createRow(
        TABLE_IDS.pairings,
        {
          ...fields,
          开始日期: today(),
          帮扶状态: '进行中',
          青少年基本信息表: {
            Id: Number(youthId),
          },
        },
      )

    return {
      action: 'create',
      id: extractId(created),
    }
  }

  /* =====================================================
     清空帮扶信息
     =====================================================

     当“是否需要帮扶”选择“否”时，

     把帮扶需求、结对帮扶的明细全部清空，

     避免数据库里还残留之前填过的内容。

     清空项：

       帮扶需求记录  -> 需求描述置空

       结对帮扶记录  -> 是否结对帮扶=否，

                         帮扶联系人 / 联系电话 / 所属单位 置空
     */
  async function clearHelpInfo(youthId) {
    const youth = await getYouthRecord(youthId)

    const result = {
      help: false,
      pairing: false,
      record: false,
    }

    /**
     * 1. 帮扶需求
     */
    const helpLinked = normalizeLinked(
      youth?.['帮扶需求记录'],
    )

    if (helpLinked.length) {
      await patchRows(TABLE_IDS.helpNeeds, [
        {
          Id: Number(helpLinked[0].Id),
          需求描述: '',
          数据时间戳: today(),
        },
      ])
      result.help = true
    }

    /**
     * 2. 结对帮扶
     */
    const pairLinked = normalizeLinked(
      youth?.['结对帮扶记录'],
    )

    if (pairLinked.length) {
      await patchRows(TABLE_IDS.pairings, [
        {
          Id: Number(pairLinked[0].Id),
          是否结对帮扶: '否',
          帮扶联系人: '',
          联系电话: '',
          所属单位: '',
          数据时间戳: today(),
        },
      ])
      result.pairing = true
    }

    /**
     * 3. 帮扶记录
     *
     * 一名青少年可能有多条帮扶记录，
     * 逐条清空内容。
     */
    const recordLinked = normalizeLinked(
      youth?.['帮扶记录'],
    )

    if (recordLinked.length) {
      await patchRows(
        TABLE_IDS.helpRecords,
        recordLinked.map((item) => ({
          Id: Number(item.Id),
          帮扶内容: '',
          帮扶联系人: '',
          帮扶方式: '',
          帮扶物资: '',
          帮扶金额: null,
          备注: '',
          帮扶照片: null,
          数据时间戳: today(),
        })),
      )
      result.record = true
    }

    return {
      action: 'cleared',
      ...result,
    }
  }

  /* =====================================================
     4. 新增青少年
     ===================================================== */

  /**
   * 计算下一个序号。
   *
   * 读取整表太慢，这里只取总数。
   */
  async function nextSequence() {
    const response =
      await fetch(
        recordsUrl(
          TABLE_IDS.youth,
        ) + '?limit=1',
        {
          headers: getHeaders(),
        },
      )

    const data =
      await response.json()

    /**
     * 同样要兼容两种分页字段。
     *
     * 只认 totalRows 的话，
     * 遇到返回 total 的数据源会算成 0，
     * 新增青少年的序号就永远是 1，
     * 整张表出现一堆重复序号。
     */
    const total = Number(
      data?.pageInfo?.totalRows ??
        data?.pageInfo?.total ??
        0,
    )

    return total + 1
  }

  /**
   * fields 已经是中文字段名。
   */
  async function createYouth(
    fields,
  ) {
    const sequence =
      await nextSequence()

    const payload = {
      ...fields,
      序号: sequence,
      数据时间戳: today(),
    }

    const created =
      await createRow(
        TABLE_IDS.youth,
        payload,
      )

    const youthId =
      extractId(created)

    if (!youthId) {
      throw new Error(
        '新增青少年失败：NocoDB 没有返回新记录 ID',
      )
    }

    return {
      id: String(youthId),
      sequence,
    }
  }

  return {
    getCategoryIndex,
    syncCategory,
    syncHelpNeed,
    syncPairing,
    clearHelpInfo,
    createYouth,
    normalizeLinked,
  }
}

module.exports = {
  createYouthWriter,
  LINK_FIELD_IDS,
}
