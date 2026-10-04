/**
 * =========================================================
 * 青少年数据仓储（有状态层）
 * =========================================================
 *
 * 从 server.js 拆出。
 *
 * 这里集中管理「进程内的青少年数据缓存」与
 *「帮扶子表 -> 所属青少年」的反查索引。
 *
 * 为什么用工厂函数而不是直接导出变量：
 *
 *     原来 cache / childIndexMap / childIndexBuiltAt
 *     是散落在 server.js 顶层的模块级可变变量，
 *     谁都能改、改了不知道谁受影响，
 *     并发刷新时还会互相覆盖。
 *
 *     现在它们被关在工厂闭包里，
 *     只能通过返回的 getCache / setCache 读写，
 *     外部代码拿不到引用，也就无法绕过规则乱改。
 *
 * 依赖全部通过参数注入（TABLE_IDS / getHeaders /
 * fetchTableRecords / canAccessYouth），
 * 所以这个模块可以脱离 server.js 单独测试。
 * =========================================================
 */

const {
  normalizeYouthRecords,
} = require('./normalizers')

function createYouthStore({
  TABLE_IDS,
  fetchTableRecords,
  canAccessYouth,
  cacheTTL = 60 * 1000,
}) {
  /**
   * 进程内缓存。
   *
   * 注意初始值必须是这个形状、不能是 null：
   *
   *     loadYouthData() 里直接读 cache.records
   *     判断是否已有缓存，
   *     初始为 null 会抛 TypeError。
   *
   * 不要直接把这个对象抛出去，
   * 外部一律通过 getCache() 拿快照、
   * 通过 setCache() 整体替换。
   */
  let cache = {
    records: null,
    statistics: null,
    loadedAt: 0,
  }

  function getCache() {
    return cache
  }

  function setCache(next) {
    cache = next
    return cache
  }

  /**
   * 清空缓存。
   *
   * 新增 / 修改 / 删除之后调用，
   * 让下一次读取重新从 NocoDB 拉最新数据。
   *
   * 原来路由里是六处手写的
   *     cache = { records: null, statistics: null, loadedAt: 0 }
   * 散落各处、写法还可能不一致，
   * 现在统一收敛成这一个方法。
   */
  function clearCache() {
    cache = {
      records: null,
      statistics: null,
      loadedAt: 0,
    }

    return cache
  }

  /* ---------------- 以下为原 server.js 逻辑 ---------------- */

  function buildStatistics(records) {
    const total =
      records.length

    const needHelpCount =
      records.filter(
        record =>
          record.needHelp === '是'
      ).length

    const needHelpNoCount =
      records.filter(
        record =>
          record.needHelp === '否'
      ).length

    const riskCount =
      records.filter(
        record =>
          Array.isArray(
            record.risks
          ) &&
          record.risks.length > 0
      ).length

    const helpNeedCount =
      records.filter(
        record =>
          Array.isArray(
            record.helpNeeds
          ) &&
          record.helpNeeds.length > 0
      ).length

    const pairingCount =
      records.filter(
        record =>
          Array.isArray(
            record.pairingRecords
          ) &&
          record.pairingRecords.length > 0
      ).length

    const helpRecordCount =
      records.reduce(
        (total, record) =>
          total +
          Number(
            record.helpRecordCount ||
              0
          ),
        0
      )

    return {
      total,
      needHelpCount,
      needHelpNoCount,
      riskCount,
      helpNeedCount,
      pairingCount,
      helpRecordCount
    }
  }

  /**
   * =========================================================
   * 按登录用户的数据权限过滤记录
   * =========================================================
   *
   * 乡镇管理员只能看到「归口单位 = 本乡镇」的记录，
   * 县级与管理员不受限制。
   *
   * 抽成独立函数的原因：
   *
   *     之前每段接口各自写一遍过滤，
   *     /api/youth/refresh 就漏掉了，
   *     乡镇账号一刷新就能拿到全县 1181 条数据。
   *     现在所有出口统一走这里，漏一处都不行。
   */
  function filterByScope(user, records) {
    if (
      !user ||
      user.role !== 'town' ||
      !Array.isArray(records)
    ) {
      return records
    }

    return records.filter(item =>
      canAccessYouth(user, item),
    )
  }

  /**
   * 统计数字也必须按可见范围计算。
   *
   * 否则乡镇账号虽然列表只看到本镇几十条，
   * 却能从 statistics 里读到全县的总数、风险数、帮扶数，
   * 一样是越权泄露。
   */
  function buildScopedStatistics(
    user,
    records,
  ) {
    return buildStatistics(
      filterByScope(user, records),
    )
  }

  /**
   * 按青少年 Id 找到记录（供帮扶模块的归属校验用）。
   */
  function findYouthById(id) {
    const target = String(id ?? '').trim()

    if (!target || !cache.records) {
      return null
    }

    return (
      cache.records.find(
        item =>
          String(item.key ?? '') ===
            target ||
          String(item._raw?.Id ?? '') ===
            target,
      ) || null
    )
  }

  /**
   * =========================================================
   * 帮扶子表记录 → 所属青少年的索引
   * =========================================================
   *
   * 用途：
   *
   *     帮扶 / 风险 / 结对 / 帮扶记录这些子表的
   *     新增、修改、删除接口此前完全没有归属校验，
   *     乡镇账号可以直接改删别的乡镇的数据。
   *
   *     要判断归属，就得从子表 id 反查它属于哪条青少年记录。
   *     这里直接用已经缓存好的青少年数据建索引，
   *     不需要额外请求 NocoDB。
   */
  let childIndexMap = new Map()
  let childIndexBuiltAt = 0

  function ensureChildIndex(data) {
    /**
     * 数据刷新过就重建索引。
     *
     * cache.loadedAt 是 Date.now() 时间戳，
     * 每次重新拉数据时都会变。
     */
    if (
      childIndexBuiltAt ===
        data.loadedAt &&
      childIndexMap.size > 0
    ) {
      return childIndexMap
    }

    const map = new Map()

    const records =
      Array.isArray(data?.records)
        ? data.records
        : []

    records.forEach(youth => {
      if (!youth || typeof youth !== 'object') {
        return
      }

      /**
       * 遍历青少年记录里的每一个数组字段，
       * 只要数组元素是带 id 的对象，就登记到索引里。
       *
       * 这样不用逐个字段名去猜，
       * 以后新增子表也自动覆盖。
       */
      Object.values(youth).forEach(value => {
        if (!Array.isArray(value)) {
          return
        }

        value.forEach(child => {
          if (
            child &&
            typeof child === 'object' &&
            child.id != null
          ) {
            map.set(
              String(child.id),
              youth,
            )
          }
        })
      })
    })

    childIndexMap = map
    childIndexBuiltAt = data.loadedAt

    return map
  }

  /**
   * 乡镇账号操作帮扶数据时，
   * 校验目标记录是否属于本乡镇。
   *
   * 原则：**查不到归属就拒绝**（fail closed），
   * 宁可让正常操作失败一次，
   * 也不能放行一次越权。
   */
  async function guardHelpScope(req, res, next) {
    const user = req.user

    /**
     * 县级 / 管理员不做限制。
     */
    if (!user || user.role !== 'town') {
      return next()
    }

    /**
     * 只读请求后面会单独处理（summary 已按范围计算），
     * 这里只拦写入类操作。
     */
    const method = String(
      req.method || '',
    ).toUpperCase()

    if (
      method === 'GET' ||
      method === 'HEAD' ||
      method === 'OPTIONS'
    ) {
      return next()
    }

    try {
      const data = await loadYouthData(false)
      const index = ensureChildIndex(data)

      let youth = null

      /**
       * 注意：
       *
       *     本函数是 app.use() 挂载的中间件，
       *     在中间件里 req.params 是空的
       *     （params 要等路由真正匹配时才填充），
       *     所以必须从 URL 里自己解析。
       *
       *     /api/help/pairings/1784        → [pairings, 1784]
       *     /api/help/help-records/12/photo → [help-records, 12, photo]
       *
       *     逐段尝试，命中即止，
       *     这样两种路径都能覆盖。
       */
      const path = String(
        req.originalUrl ||
          req.url ||
          '',
      ).split('?')[0]

      const parts = path
        .split('/')
        .filter(Boolean)

      const rest =
        parts[0] === 'api' &&
        parts[1] === 'help'
          ? parts.slice(2)
          : parts

      for (const segment of rest) {
        const candidate =
          String(segment).trim()

        if (!candidate) {
          continue
        }

        youth =
          index.get(candidate) ||
          findYouthById(candidate)

        if (youth) {
          break
        }
      }

      /**
       * 新增接口还没有记录 id，
       * 用请求体里的青少年 Id 判断归属。
       */
      if (!youth) {
        const bodyYouthId = String(
          req.body?.youthId ??
            req.body?.Id ??
            req.body?.id ??
            '',
        ).trim()

        if (bodyYouthId) {
          youth = findYouthById(bodyYouthId)
        }
      }

      if (!youth) {
        return res.status(403).json({
          success: false,
          message:
            '无法确认这条数据的归属单位，已拒绝操作。请刷新页面后重试。',
        })
      }

      if (!canAccessYouth(user, youth)) {
        return res.status(403).json({
          success: false,
          message:
            '只能操作本乡镇（归口单位）的数据',
        })
      }

      return next()
    } catch (error) {
      console.error(
        '帮扶数据归属校验失败：',
        error,
      )

      return res.status(403).json({
        success: false,
        message:
          '数据归属校验失败，已拒绝操作',
      })
    }
  }

  async function fetchAllYouthData() {
    const [
      youthRecords,
      categoryRecords,
      riskRecords,
      helpNeedRecords,
      pairingRecords,
      helpRecords
    ] = await Promise.all([
      fetchTableRecords(
        TABLE_IDS.youth
      ),
      fetchTableRecords(
        TABLE_IDS.categories
      ),
      fetchTableRecords(
        TABLE_IDS.risks
      ),
      fetchTableRecords(
        TABLE_IDS.helpNeeds
      ),
      fetchTableRecords(
        TABLE_IDS.pairings
      ),
      fetchTableRecords(
        TABLE_IDS.helpRecords
      )
    ])

    const records =
      normalizeYouthRecords(
        youthRecords,
        categoryRecords,
        riskRecords,
        helpNeedRecords,
        pairingRecords,
        helpRecords
      )

    return {
      records,
      statistics:
        buildStatistics(
          records
        ),
      loadedAt:
        new Date().toISOString()
    }
  }

  async function loadYouthData(
    force = false
  ) {
    const now =
      Date.now()

    if (
      !force &&
      cache.records &&
      now -
        cache.loadedAt <
        cacheTTL
    ) {
      return cache
    }

    const data =
      await fetchAllYouthData()

    cache = {
      ...data,
      loadedAt: now
    }

    return cache
  }

  return {
    buildStatistics,
    filterByScope,
    buildScopedStatistics,
    findYouthById,
    ensureChildIndex,
    guardHelpScope,
    fetchAllYouthData,
    loadYouthData,
    getCache,
    setCache,
    clearCache,
  }
}

module.exports = {
  createYouthStore,
}
