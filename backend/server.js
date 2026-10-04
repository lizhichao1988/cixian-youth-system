const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

/**
 * 安全防护模块：
 *
 *     安全响应头 / 强制 HTTPS / 限流 /
 *     请求体净化 / 传输加密 / 存储加密 /
 *     密码哈希 / token 签名
 */
const security = require('./security')

/**
 * 从 server.js 拆出去的三个模块。
 *
 *     lib/fields.js       字段处理（纯函数）
 *     lib/normalizers.js  NocoDB 记录标准化（纯函数）
 *     lib/youthStore.js   青少年数据缓存与权限过滤（有状态）
 *
 * 拆分前 server.js 接近 4800 行，
 * 数据加工、权限校验、HTTP 路由全堆在一个文件里，
 * 改一处要全文搜索、还容易误伤别处。
 *
 * 现在按职责分开，server.js 只剩：
 *     中间件装配 + 路由 + 请求编排
 */
const {
  cleanValue,
  getObjectText,
  sanitizeEmptyValues,
  normalizeDateFields,
  responsibleUnitForUser,
  normalizeNeedHelp,
  firstValue,
  getRecordFields,
} = require('./lib/fields')

const {
  normalizeCategoryRecord,
  normalizeRiskRecord,
  normalizeHelpNeedRecord,
  normalizePairingRecord,
  normalizeHelpRecord,
  getLinkedIds,
  buildRelationMap,
  normalizeYouthRecords,
} = require('./lib/normalizers')

const {
  createYouthStore,
} = require('./lib/youthStore')

const app = express()

/**
 * 隐藏 Express 标识，
 * 减少被定向攻击的可能。
 */
app.disable('x-powered-by')

/**
 * 部署在 Render / Nginx 后面时，
 * 需要信任代理才能拿到真实 IP 与 https 协议。
 */
app.set('trust proxy', 1)

/**
 * CORS：
 *
 * 默认放行所有来源（本地开发 / 单服务托管都够用）。
 * 前后端分离部署时，
 * 用环境变量 ALLOWED_ORIGIN 限定前端域名，
 * 多个域名用逗号分隔：
 *
 *     ALLOWED_ORIGIN=https://abc.vercel.app,https://xyz.com
 */
/**
 * 本系统是「前后端同服务」部署，
 * 前端页面和接口是同一个域名，
 * 根本不需要跨域。
 *
 * 之前默认放行所有来源（'*'）且带凭证，
 * 等于任何网站都能借用户浏览器调我们的接口。
 *
 * 现在的策略：
 *     没配 ALLOWED_ORIGIN → 不下发跨域头（只允许同源）
 *     配了 ALLOWED_ORIGIN → 只放行明确列出的域名
 */
const allowedOriginList =
  process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []

app.use(
  cors({
    origin:
      allowedOriginList.length > 0
        ? allowedOriginList
        : false,
    credentials: true,
  }),
)
/**
 * ====================================================
 * 安全防护链路（顺序不能乱）
 * ====================================================
 *
 *     1. 强制 HTTPS —— 公网部署后禁止明文访问
 *     2. 安全响应头 —— 防 XSS / 劫持 / 嗅探
 *     3. 解析请求体 —— 限制体积，防超大报文打爆内存
 *     4. 传输解密 —— 把前端加密的报文还原
 *     5. 请求体净化 —— 防原型链污染、超长字段
 *     6. 接口限流 —— 防刷接口 / CC
 * ====================================================
 */
app.use(security.forceHttps)
app.use(security.securityHeaders)

app.use(
  express.json({
    limit:
      process.env.MAX_BODY_SIZE || '2mb',
  }),
)

app.use(security.transportEncryption)
app.use(security.sanitizeBody)

/**
 * 登录接口单独加强限流，挡住暴力破解。
 */
app.use(
  '/api/auth/login',
  security.loginLimiter,
  security.loginAccountLimiter,
)

app.use('/api', security.apiLimiter)

const PORT = process.env.PORT || 3001

/**
 * NocoDB 连接信息全部走环境变量，
 * 方便部署到外网（Render / 自有服务器）。
 *
 * 本地开发留默认值即可。
 */
const NOCODB_BASE_URL =
  process.env.NOCODB_BASE_URL ||
  'http://localhost:8080'
const NOCODB_BASE_ID =
  process.env.NOCODB_BASE_ID ||
  'p0c8s7fcnd9d9d7'
const NOCODB_API_TOKEN =
  process.env.NOCODB_API_TOKEN

/**
 * 各数据表 ID 也支持环境变量覆盖。
 *
 * 把项目迁到 NocoDB Cloud 或其他实例后，
 * 表 ID 会变，
 * 直接通过环境变量传入即可，
 * 无需改代码：
 *
 *     NOCODB_TABLE_YOUTH=xxx
 *     NOCODB_TABLE_RISKS=xxx
 *     ...
 */
const TABLE_IDS = {
  youth:
    process.env.NOCODB_TABLE_YOUTH ||
    'mbmgr8u9zx2pvwg',
  categories:
    process.env.NOCODB_TABLE_CATEGORIES ||
    'mqmsvk541w2brim',
  risks:
    process.env.NOCODB_TABLE_RISKS ||
    'mgz6zcrrf3d43ww',
  helpNeeds:
    process.env.NOCODB_TABLE_HELP_NEEDS ||
    'msx90v3yrypspvf',
  pairings:
    process.env.NOCODB_TABLE_PAIRINGS ||
    'mcg4nw1ilc0rk7x',
  helpRecords:
    process.env.NOCODB_TABLE_HELP_RECORDS ||
    'ms1xje77xaep3ww',
  accounts:
    process.env.NOCODB_TABLE_ACCOUNTS ||
    'm22wdvsuh1px8lw',
}
const RISK_YOUTH_LINK_FIELD_ID = 'c6ting7y677mclx'

/**
 * =========================================================
 * 认证 / 权限 / 回收站
 * =========================================================
 *
 * 必须尽早注册：
 *
 *     它内部会注册一个登录态中间件，
 *     必须排在所有业务路由前面，
 *     这样后面的接口才能拿到当前登录用户。
 */
const {
  registerAuthRoutes,
  attachUser,
  requireAuth,
  recordDeletion,
  canAccessYouth,
} = require('./authApi')

/**
 * 青少年写入辅助模块。
 *
 * 负责：
 *
 *     困难类别关联写入
 *     困难大类写入
 *     帮扶需求写入
 *     结对帮扶写入
 *     新增青少年
 */
const {
  createYouthWriter,
} = require('./youthWrite')

/**
 * =========================================================
 * 对外错误文案脱敏
 * =========================================================
 *
 * 之前所有接口出错时都直接把 error.message 返回给前端，
 * 里面可能带上 NocoDB 地址、表结构、SQL 片段、堆栈等内部信息。
 *
 * 现在统一走这里：
 *
 *     开发环境：保留原始信息，方便排查
 *     生产环境：只回一句通用提示，细节写进服务端日志
 */
function publicError(error, fallback) {
  const isProduction =
    process.env.NODE_ENV === 'production'

  if (!isProduction) {
    return (
      error?.message || fallback
    )
  }

  console.error(
    '[接口内部错误]',
    fallback,
    error?.message || error,
  )

  return fallback
}

/**
 * =========================================================
 * 登录态解析（必须最早）
 * =========================================================
 *
 * 放在这里而不是 registerAuthRoutes() 内部，
 * 是为了让下面的全局守卫能拿到 req.user。
 */
app.use(attachUser)

/**
 * =========================================================
 * 全局接口鉴权（安全兜底，务必放在所有业务路由之前）
 * =========================================================
 *
 * 背景（2026-10-04 修复）：
 *
 *     本文件里的业务路由（青少年 / 帮扶 / 风险 / 结对 / 回收站 …）
 *     此前**没有挂登录校验**，
 *     authApi 里的 requireAuth 只保护了它自己注册的几条路由。
 *
 *     实测后果（未登录时）：
 *         GET    /api/youth          → 200，直接返回全部 1181 条台账
 *         GET    /api/help/summary   → 200
 *         POST   /api/youth          → 进入写流程（仅因参数校验失败）
 *         DELETE /api/youth/:id      → 进入删除流程
 *
 *     也就是说系统一挂到公网，
 *     任何人不需要账号就能拖走甚至删除全部未成年人数据。
 *
 * 处理：
 *
 *     在这里统一加一层守卫，
 *     只有白名单接口允许匿名访问，
 *     其余 /api/* 一律要求有效登录态。
 *
 * 白名单：
 *     /api/health       容器健康检查（Docker healthcheck）
 *     /api/auth/login   登录
 *     /api/auth/logout  登出
 *
 * 说明：
 *     前端每个请求都会带 x-auth-token（见 src/api/http.js），
 *     所以正常使用不受影响；
 *     未登录时返回 401，前端会自动退回登录页。
 */
const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/logout',
])

/**
 * 弱口令账号被锁定后，
 * 仍然允许访问的接口。
 *
 * 只给这三条活路：
 *     改密码      否则永远出不来
 *     查会话信息  前端要知道当前是谁、要不要改密
 *     退出登录    改不了可以走人
 *
 * 其余业务接口一律拒绝，
 * 这样「必须改密」才是真的强制，
 * 而不是关掉弹窗就能绕过。
 */
const PASSWORD_CHANGE_PATHS = new Set([
  '/api/auth/change-password',
  '/api/auth/session',
  '/api/auth/logout',
])

app.use('/api', (req, res, next) => {
  /**
   * 注意：挂在 '/api' 上以后，
   * req.path 已经被削掉了前缀，
   * 必须用 originalUrl 才能拿到完整路径。
   */
  const fullPath = String(
    req.originalUrl || '',
  ).split('?')[0]

  if (PUBLIC_API_PATHS.has(fullPath)) {
    return next()
  }

  return requireAuth(
    req,
    res,
    () => {
      /**
       * 登录成功但密码太弱：
       *
       *     只允许改密码 / 查会话 / 退出，
       *     其余接口全部拦下。
       *
       * 423 是 HTTP 标准里的 Locked，
       * 语义上正好对应「账号被锁定」。
       */
      if (
        req.user?.mustChangePassword &&
        !PASSWORD_CHANGE_PATHS.has(
          fullPath,
        )
      ) {
        return res
          .status(423)
          .json({
            success: false,
            code: 'PASSWORD_CHANGE_REQUIRED',
            message:
              '当前密码不符合安全要求，请先修改密码后再使用系统',
          })
      }

      return next()
    },
  )
})

/**
 * 登录 / 账号 / 回收站 / 日志路由。
 *
 * 注册在全局守卫之后，
 * 因此 /api/auth/* 同样受守卫保护：
 *
 *     未登录          -> 401
 *     弱口令未改密    -> 423（仅放行改密 / 会话 / 登出）
 */
registerAuthRoutes(
  app,
  {
    NOCODB_BASE_URL,
    TABLE_IDS,
    getHeaders,
  },
)


const CACHE_TTL = 60 * 1000


/**
 * 青少年写入工具。
 *
 * 困难类别是独立的关联表，
 * 帮扶需求 / 结对帮扶也是独立表，
 * 这些写入都不适合直接塞进主表 PATCH。
 */
const youthWriter =
  createYouthWriter({
    NOCODB_BASE_URL,
    TABLE_IDS,
    getHeaders,
  })

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  }

  if (NOCODB_API_TOKEN) {
    headers['xc-token'] = NOCODB_API_TOKEN
    headers.Authorization = 'Bearer ' + NOCODB_API_TOKEN
  }

  return headers
}


async function fetchTableRecords(tableId) {
  const records = []
  const limit = 1000

  let offset = 0

  while (true) {
    const url =
      NOCODB_BASE_URL +
      '/api/v2/tables/' +
      tableId +
      '/records' +
      '?offset=' +
      offset +
      '&limit=' +
      limit

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    })

    if (!response.ok) {
      const text = await response.text()

      throw new Error(
        '读取 NocoDB 表 ' +
          tableId +
          ' 失败：' +
          response.status +
          ' ' +
          text
      )
    }

    const result = await response.json()

    const pageRecords =
      Array.isArray(result?.list)
        ? result.list
        : Array.isArray(result?.records)
          ? result.records
          : Array.isArray(result)
            ? result
            : []

    records.push(...pageRecords)

    if (pageRecords.length < limit) {
      break
    }

    offset += limit
  }

  return records
}

// ============================================================
// 青少年及关联数据标准化
// ------------------------------------------------------------
// 记录标准化已迁到 lib/normalizers.js，
// 数据缓存与权限过滤已迁到 lib/youthStore.js，
// 这里只保留「装配」。
//
// RiskPage 已经直接复用 /api/youth 返回的 allYouthData。
// 因此这里不再提供风险排查专用分页接口。
// 风险排查页面的分页属于前端展示分页，
// 不再单独从后端分页读取青少年数据。
// ============================================================

/**
 * =========================================================
 * 青少年数据仓储装配
 * =========================================================
 *
 * 缓存、子表索引、数据权限过滤全部在 lib/youthStore.js 内部，
 * 外部拿不到引用，只能通过这里解构出的方法访问。
 *
 * 原来散落在路由里的六处
 *     cache = { records: null, statistics: null, loadedAt: 0 }
 * 已统一替换为 clearCache()。
 */
const youthStore = createYouthStore({
  TABLE_IDS,
  fetchTableRecords,
  canAccessYouth,
  cacheTTL: CACHE_TTL,
})

const {
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
} = youthStore

/**
 * =========================================================
 * 单条青少年数据的归属校验
 * =========================================================
 *
 * 覆盖所有 /api/youth/:youthId/... 路由：
 *
 *     风险排查 / 帮扶需求 / 结对帮扶 / 帮扶记录
 *     的查询与写入都走这类路径。
 *
 * 修复前的实测结果：
 *
 *     讲武城镇账号请求 /api/youth/899/risks
 *     （899 属于磁州镇）
 *     直接返回了完整数据，
 *     连姓名、排查结论都能看到。
 *
 *     原因是列表接口 /api/youth 做了按镇过滤，
 *     但「按 id 查单条」这一路完全没有校验，
 *     只要猜到 id 就能看。
 *
 *     id 是自增整数，
 *     遍历一遍就能把全县数据拖走，
 *     比列表越权更隐蔽。
 *
 * 处理：
 *
 *     乡镇账号访问任何单条数据时，
 *     先反查这条数据属于哪个乡镇，
 *     不是本镇一律 403；
 *     查不到归属同样拒绝（fail closed）。
 *
 * 只处理数字 id，
 * /api/youth/refresh 这类接口不受影响。
 */
async function guardYouthScope(
  req,
  res,
  next,
) {
  const user = req.user

  /**
   * 县级 / 管理员不做限制。
   */
  if (!user || user.role !== 'town') {
    return next()
  }

  const youthId = String(
    req.params?.youthId ?? '',
  ).trim()

  /**
   * 只处理数字 id。
   *
   * /api/youth/refresh 这类接口也会匹配到
   * :youthId，但它的 id 不是数字，
   * 直接放行交给真正的路由处理，
   * 否则刷新接口会被误拦。
   *
   * （path-to-regexp 新版本已不支持
   *   :youthId(\\d+) 这种内联正则写法，
   *   所以判断放在这里。）
   */
  if (!/^\d+$/.test(youthId)) {
    return next()
  }

  try {
    /**
     * 先确保缓存里有数据，
     * findYouthById 依赖这份缓存做反查。
     */
    await loadYouthData(false)

    const youth = findYouthById(youthId)

    if (!youth) {
      return res.status(403).json({
        success: false,
        message:
          '无法确认这条数据的归属单位，已拒绝访问。请刷新页面后重试。',
      })
    }

    if (
      !canAccessYouth(user, youth)
    ) {
      return res.status(403).json({
        success: false,
        message:
          '只能查看或操作本乡镇（归口单位）的数据',
      })
    }

    return next()
  } catch (error) {
    console.error(
      '单条数据归属校验失败：',
      error,
    )

    return res.status(403).json({
      success: false,
      message:
        '数据归属校验失败，已拒绝访问',
    })
  }
}

/**
 * 必须挂在所有 /api/youth/... 路由之前。
 */
app.use(
  '/api/youth/:youthId',
  guardYouthScope,
)


app.get(
  '/api/health',
  async (
    req,
    res
  ) => {
    res.json({
      success: true,
      message:
        '服务器运行正常',
      time:
        new Date().toISOString()
    })
  }
)

app.get(
  '/api/youth',
  async (
    req,
    res
  ) => {
    try {
      const force =
        req.query.refresh === '1' ||
        req.query.refresh === 'true'

      const data =
        await loadYouthData(
          force
        )

      /**
       * =====================================================
       * 乡镇账号数据隔离
       * =====================================================
       *
       * 乡镇管理员只能看到
       * 「归口单位」等于本账号所属乡镇的数据。
       *
       * 县级与管理员不受限制。
       *
       * 统计数字同样按可见范围重算，
       * 不再直接返回全县的 data.statistics。
       */
      const user = req.user

      const visibleRecords =
        filterByScope(
          user,
          data.records,
        )

      res.json({
        success: true,
        count:
          visibleRecords.length,
        statistics:
          buildScopedStatistics(
            user,
            data.records,
          ),
        records:
          visibleRecords,
        loadedAt:
          data.loadedAt,
        scope:
          user
            ? {
                role: user.role,
                town: user.town,
              }
            : null,
      })
    } catch (
      error
    ) {
      console.error(
        '读取青少年数据失败：',
        error
      )

      res.status(500).json({
        success: false,
        message:
          publicError(
            error,
            '读取青少年数据失败',
          ),
      })
    }
  }
)

app.get(
  '/api/youth/refresh',
  async (
    req,
    res
  ) => {
    try {
      const data =
        await loadYouthData(
          true
        )

      /**
       * 这里以前**完全没有做权限过滤**，
       * 乡镇账号一调刷新就能拿到全县 1181 条数据。
       *
       * 现在和 /api/youth 保持一致：
       * 记录与统计都按登录账号的数据范围输出。
       */
      const user = req.user

      const visibleRecords =
        filterByScope(
          user,
          data.records,
        )

      res.json({
        success: true,
        count:
          visibleRecords.length,
        statistics:
          buildScopedStatistics(
            user,
            data.records,
          ),
        records:
          visibleRecords,
        loadedAt:
          data.loadedAt,
        scope:
          user
            ? {
                role: user.role,
                town: user.town,
              }
            : null,
      })
    } catch (
      error
    ) {
      console.error(
        '刷新青少年数据失败：',
        error
      )

      res.status(500).json({
        success: false,
        message:
          publicError(
            error,
            '刷新青少年数据失败',
          ),
      })
    }
  }
)

/* =========================================================
   风险排查记录 CRUD
   ---------------------------------------------------------
   数据关系：

   青少年基本信息表 1
          ↓
   风险排查处置表 N

   一个青少年可以有多条风险排查记录。

   本模块负责：
   1. 查询某个青少年的全部风险排查记录
   2. 新增一条风险排查记录
   3. 修改已有风险排查记录
   4. 删除已有风险排查记录
   ========================================================= */


/* ---------------------------------------------------------
   查询某个青少年的全部风险排查记录
   --------------------------------------------------------- */
app.get(
  '/api/youth/:youthId/risks',
  async (req, res) => {
    const youthId =
      String(
        req.params.youthId || ''
      ).trim()

    if (!youthId) {
      return res.status(400).json({
        success: false,
        message: '缺少青少年记录ID',
      })
    }

    try {
      /*
       * 这里暂时采用现有项目已经验证过的读取方式：
       *
       * 1. 读取风险排查处置表全部记录
       * 2. 根据每条记录中的
       *    “青少年基本信息表”关系字段判断所属人员
       *
       * 这样可以兼容你目前已经建立好的 NocoDB 关系。
       */

      const riskRecords =
        await fetchTableRecords(
          TABLE_IDS.risks
        )

      const youthRisks =
        riskRecords
          .filter((record) => {
            const fields =
              getRecordFields(
                record
              )

            /*
             * 风险排查处置表中的反向关联字段。
             *
             * 你当前数据库中：
             * 风险排查处置表
             *     ↓
             * 青少年基本信息表
             */
            const youthRelation =
              firstValue(
                fields,
                [
                  '青少年基本信息表',
                  '青少年基本信息表s',
                  '青少年信息表',
                  '青少年'
                ]
              )

            const linkedIds =
              getLinkedIds(
                youthRelation
              )

            return linkedIds.includes(
              youthId
            )
          })
          .map(
            normalizeRiskRecord
          )

      return res.json({
        success: true,
        youthId,
        count:
          youthRisks.length,
        records:
          youthRisks,
      })
    } catch (error) {
      console.error(
        '读取风险排查记录失败：',
        error
      )

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          '读取风险排查记录失败',
      })
    }
  }
)


/* ---------------------------------------------------------
   新增一条风险排查记录

   POST
   /api/youth/:youthId/risks

   一个青少年可以有多条风险排查记录。

   新增流程：

   1. 根据 youthId 找到青少年基本信息
   2. 自动生成 Title
   3. 创建风险排查记录
   4. 使用 NocoDB Link API 建立关联
   5. 如果关联失败，则删除刚刚创建的风险记录
   6. 清除缓存
   7. 返回完整结果

   Title 格式：

   序号 + 姓名 + 排查日期 + 的排查

   例如：

   123宋建2026-09-26的排查
   --------------------------------------------------------- */
app.post(
  '/api/youth/:youthId/risks',
  async (req, res) => {
    const youthId =
      String(
        req.params.youthId || ''
      ).trim()

    if (!youthId) {
      return res.status(400).json({
        success: false,
        message: '缺少青少年记录ID',
      })
    }

    const body =
      req.body &&
      typeof req.body === 'object'
        ? req.body
        : {}

    try {
      console.log(
        '===================================='
      )

      console.log(
        '开始新增风险排查记录'
      )

      console.log(
        '所属青少年ID：',
        youthId
      )

      /*
       * =====================================================
       * 第一步：找到青少年基本信息
       * =====================================================
       *
       * 这里读取青少年基本信息表，
       * 用来取得：
       *
       * - 序号
       * - 姓名
       *
       * 这样风险排查处置表中的 Title
       * 就可以自动生成。
       */
      const youthRecords =
        await fetchTableRecords(
          TABLE_IDS.youth
        )

      const youthRecord =
        youthRecords.find(
          (record) =>
            String(
              record.id ||
                record.Id ||
                ''
            ) === youthId
        )

      if (!youthRecord) {
        return res.status(404).json({
          success: false,
          message:
            '没有找到对应的青少年基本信息记录',
          youthId,
        })
      }

      const youthFields =
        getRecordFields(
          youthRecord
        )

      const sequence =
        cleanValue(
          firstValue(
            youthFields,
            [
              '序号',
              '编号',
            ]
          )
        )

      const youthName =
        cleanValue(
          firstValue(
            youthFields,
            [
              '姓名',
              'Name',
            ]
          )
        )

      /*
       * =====================================================
       * 第二步：整理排查日期
       * =====================================================
       */
      const rawDate =
        body.date ||
        ''

      const riskDate =
        String(
          rawDate
        )
          .trim()
          .slice(0, 10)

      /*
       * =====================================================
       * 第三步：自动生成 Title
       * =====================================================
       *
       * 格式：
       *
       * 序号 + 姓名 + 排查日期 + 的排查
       *
       * 例如：
       *
       * 123宋建2026-09-26的排查
       */
      const riskTitle =
        [
          sequence,
          youthName,
          riskDate,
          '的排查',
        ]
          .filter(
            (value) =>
              value !== ''
          )
          .join('')

      /*
       * =====================================================
       * 第四步：组装风险排查字段
       * =====================================================
       */
      const riskFields = {
        Title:
          riskTitle,

        /**
         * 排查日期留空时写 null。
         *
         * 之前写空字符串会被 NocoDB 拒绝：
         *
         *     400 The date / time value is invalid.
         *
         * 结果“新增人员”时只要顺带填了一条
         * 没选排查日期的风险记录，
         * 整个保存就会失败。
         */
        排查日期:
          riskDate || null,

        是否存在风险:
          normalizeNeedHelp(
            body.hasRisk ||
              body.status ||
              '否'
          ) || '否',

        风险隐患描述:
          body.description ||
          '',

        处置情况:
          body.handling ||
          '',

        排查人:
          body.inspector ||
          '',

        备注:
          body.remark ||
          '',
      }

      console.log(
        '青少年姓名：',
        youthName
      )

      console.log(
        '青少年序号：',
        sequence
      )

      console.log(
        '自动生成 Title：',
        riskTitle
      )

      console.log(
        '风险记录字段：',
        riskFields
      )

      /*
       * =====================================================
       * 第五步：创建风险排查记录
       * =====================================================
       */
      const createUrl =
        NOCODB_BASE_URL +
        '/api/v2/tables/' +
        TABLE_IDS.risks +
        '/records'

      const createResponse =
        await fetch(
          createUrl,
          {
            method: 'POST',
            headers:
              getHeaders(),
            body:
              JSON.stringify(
                riskFields
              ),
          }
        )

      const createText =
        await createResponse.text()

      if (!createResponse.ok) {
        console.error(
          '创建风险排查记录失败：',
          createResponse.status,
          createText
        )

        return res.status(
          createResponse.status
        ).json({
          success: false,
          message:
            '创建风险排查记录失败：' +
            createResponse.status,
          detail:
            createText,
        })
      }

      let createdRecord = null

      try {
        createdRecord =
          createText
            ? JSON.parse(
                createText
              )
            : null
      } catch {
        createdRecord = null
      }

      /*
       * =====================================================
       * 第六步：取得新建风险记录 ID
       * =====================================================
       */
      const riskId =
        String(
          createdRecord?.Id ||
            createdRecord?.id ||
            createdRecord?.record?.Id ||
            createdRecord?.record?.id ||
            ''
        )

      if (!riskId) {
        console.error(
          '风险记录已经创建，但没有取得记录ID：',
          createdRecord
        )

        return res.status(500).json({
          success: false,
          message:
            '风险记录创建成功，但没有取得新记录ID',
          record:
            createdRecord,
        })
      }

      console.log(
        '风险排查记录创建成功'
      )

      console.log(
        '风险记录ID：',
        riskId
      )

      /*
       * =====================================================
       * 第七步：建立青少年关联
       * =====================================================
       *
       * 当前关系：
       *
       * 青少年基本信息表
       *       1
       *       ↓
       *       N
       * 风险排查处置表
       *
       * 风险表中的：
       *
       * 青少年基本信息表
       *
       * 是反向关联字段。
       *
       * 当前已经确定该字段 ID：
       *
       * c6ting7y677mclx
       */
      const linkUrl =
        NOCODB_BASE_URL +
        '/api/v2/tables/' +
        TABLE_IDS.risks +
        '/links/' +
        RISK_YOUTH_LINK_FIELD_ID +
        '/records/' +
        riskId

      console.log(
        '正在建立青少年关联：'
      )

      console.log(
        'Link API：',
        linkUrl
      )

      console.log(
        '关联青少年ID：',
        youthId
      )

      const linkResponse =
        await fetch(
          linkUrl,
          {
            method: 'POST',
            headers:
              getHeaders(),
            body:
              JSON.stringify({
                Id: youthId,
              }),
          }
        )

      const linkText =
        await linkResponse.text()

      if (!linkResponse.ok) {
        console.error(
          '建立青少年关联失败：',
          linkResponse.status,
          linkText
        )

        /*
         * ===================================================
         * 非常重要：
         *
         * 如果“创建风险记录”成功，
         * 但“建立关联”失败，
         *
         * 绝不能留下一个孤立的风险记录。
         *
         * 所以这里自动删除刚刚创建的记录。
         * ===================================================
         */
        try {
          const rollbackUrl =
            NOCODB_BASE_URL +
            '/api/v2/tables/' +
            TABLE_IDS.risks +
            '/records/' +
            riskId

          const rollbackResponse =
            await fetch(
              rollbackUrl,
              {
                method: 'DELETE',
                headers:
                  getHeaders(),
              }
            )

          console.log(
            '关联失败后的风险记录回滚状态：',
            rollbackResponse.status
          )
        } catch (
          rollbackError
        ) {
          console.error(
            '回滚风险记录失败：',
            rollbackError
          )
        }

        return res.status(
          linkResponse.status
        ).json({
          success: false,
          message:
            '风险排查记录创建成功，但建立青少年关联失败',
          youthId,
          riskId,
          detail:
            linkText,
        })
      }

      console.log(
        '青少年关联建立成功'
      )

      /*
       * =====================================================
       * 第八步：清除缓存
       * =====================================================
       *
       * 下一次读取青少年数据时，
       * 重新从 NocoDB 读取。
       *
       * 这样：
       *
       * 风险记录
       * ↓
       * 青少年关系字段
       * ↓
       * 前端 risks
       *
       * 会重新同步。
       */
      clearCache()

     /*
      * =====================================================
      * 第九步：构造返回给前端的完整风险记录
      * =====================================================
      *
      * 注意：
      *
      * NocoDB 的新增接口在当前环境下，
      * 返回结果不能保证包含完整的字段内容。
      *
      * 但是我们在创建记录之前已经拥有完整的：
      *
      *     riskFields
      *
      * 同时已经取得了 NocoDB 创建成功后的：
      *
      *     riskId
      *
      * 因此这里直接使用：
      *
      *     riskFields + riskId
      *
      * 构造“刚刚真正保存成功”的风险记录。
      *
      * 这样：
      *
      *     不需要再次 GET NocoDB
      *     不需要重新读取整个青少年数据
      *     不需要等待缓存刷新
      *
      * 前端拿到的就是刚刚成功写入数据库的最终数据。
      * =====================================================
      */

      const savedRiskRecord = {
        id: Number(riskId),

        title:
          riskFields.Title ||
          riskTitle ||
          '',

        date:
          riskFields['排查日期'] ||
          '',

        /*
        * 当前系统前端统一使用 status 表示：
        *
        * 是否存在风险
        */
        status:
          riskFields['是否存在风险'] ||
          '',

        /*
        * 同时保留 hasRisk，
        * 方便前端统一标准化。
        */
        hasRisk:
          riskFields['是否存在风险'] ||
          '',

        description:
          riskFields['风险隐患描述'] ||
          '',

        handling:
          riskFields['处置情况'] ||
          '',

        inspector:
          riskFields['排查人'] ||
          '',

        remark:
          riskFields['备注'] ||
          '',

        /*
        * 新建记录的 CreatedAt 此时
        * 不一定能从 NocoDB POST 返回值中取得。
        *
        * 前端排序首先按照排查日期，
        * 同一天时可以使用这个时间。
        */
        createdAt:
          new Date().toISOString(),

        /*
        * 保留 NocoDB 创建响应，
        * 以后如果需要扩展可以继续使用。
        */
        raw:
          createdRecord,
      }

      console.log(
        '返回前端的完整风险记录：',
        savedRiskRecord
      )

      /*
      * =====================================================
      * 第十步：返回成功结果
      * =====================================================
      */
      return res.status(201).json({
        success: true,

        message:
          '风险排查记录新增并关联成功',

        youthId,

        riskId,

        youthName,

        sequence,

        title:
          riskTitle,

        record:
          savedRiskRecord,
      })


    } catch (error) {
      console.error(
        '新增风险排查记录失败：',
        error
      )

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          '新增风险排查记录失败',
      })
    }
  }
)

/* ---------------------------------------------------------
   修改已有风险排查记录

   PUT
   /api/risks/:riskId

   说明：
   1. 这里只修改风险排查记录自身字段
   2. 不重新修改青少年关联关系
   3. 排查日期统一保存为 YYYY-MM-DD
   4. 修改成功后清除青少年数据缓存
   --------------------------------------------------------- */
app.put(
  '/api/risks/:riskId',
  async (req, res) => {
    const riskId =
      String(
        req.params.riskId || ''
      ).trim()

    if (!riskId) {
      return res.status(400).json({
        success: false,
        message: '缺少风险排查记录ID',
      })
    }

    const body =
      req.body &&
      typeof req.body === 'object'
        ? req.body
        : {}

    /*
     * =====================================================
     * 第一步：整理需要修改的字段
     * =====================================================
     */
    const updateFields = {}

    /*
     * Title
     */
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'title'
      )
    ) {
      updateFields.Title =
        String(
          body.title || ''
        ).trim()
    }

    /*
     * 排查日期
     *
     * 无论前端传：
     *
     * 2026-09-26
     *
     * 还是：
     *
     * 2026-09-26T00:00:00.000Z
     *
     * 最终统一保存：
     *
     * 2026-09-26
     */
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'date'
      )
    ) {
      const rawDate =
        body.date || ''

      /**
       * 留空写 null，不能写空字符串，
       * 否则 NocoDB 会报日期格式错误。
       */
      updateFields.排查日期 =
        String(
          rawDate
        )
          .trim()
          .slice(0, 10) || null
    }

    /*
     * 是否存在风险
     *
     * 前端可能传：
     *
     * hasRisk
     *
     * 或：
     *
     * status
     *
     * 两种写法都兼容。
     */
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'hasRisk'
      ) ||
      Object.prototype.hasOwnProperty.call(
        body,
        'status'
      )
    ) {
      updateFields.是否存在风险 =
        normalizeNeedHelp(
          body.hasRisk ||
            body.status ||
            '否'
        ) || '否'
    }

    /*
     * 风险隐患描述
     */
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'description'
      )
    ) {
      updateFields.风险隐患描述 =
        body.description || ''
    }

    /*
     * 处置情况
     */
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'handling'
      )
    ) {
      updateFields.处置情况 =
        body.handling || ''
    }

    /*
     * 排查人
     */
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'inspector'
      )
    ) {
      updateFields.排查人 =
        body.inspector || ''
    }

    /*
     * 备注
     */
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'remark'
      )
    ) {
      updateFields.备注 =
        body.remark || ''
    }

    /*
     * =====================================================
     * 第二步：检查是否真的有字段需要修改
     * =====================================================
     */
    if (
      Object.keys(
        updateFields
      ).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          '没有可修改的风险排查字段',
      })
    }

    /*
     * =====================================================
     * 第三步：构造 NocoDB PATCH 地址
     * =====================================================
     */
    const url =
      NOCODB_BASE_URL +
      '/api/v2/tables/' +
      TABLE_IDS.risks +
      '/records'

    /*
     * NocoDB 修改记录时：
     *
     * Id 用来指定要修改哪一条记录
     */
    const requestBody = {
      Id: riskId,
      ...updateFields,
    }

    try {
      console.log(
        '===================================='
      )

      console.log(
        '开始修改风险排查记录'
      )

      console.log(
        '风险记录ID：',
        riskId
      )

      console.log(
        '风险记录修改字段：',
        updateFields
      )

      /*
       * ===================================================
       * 第四步：调用 NocoDB 修改记录
       * ===================================================
       */
      const response =
        await fetch(
          url,
          {
            method: 'PATCH',
            headers:
              getHeaders(),
            body:
              JSON.stringify(
                requestBody
              ),
          }
        )

      const responseText =
        await response.text()

      /*
       * ===================================================
       * 第五步：判断 NocoDB 是否修改成功
       * ===================================================
       */
      if (!response.ok) {
        console.error(
          '修改风险排查记录失败：',
          response.status,
          responseText
        )

        return res.status(
          response.status
        ).json({
          success: false,
          message:
            '修改风险排查记录失败：' +
            response.status,
          detail:
            responseText,
        })
      }

      /*
       * ===================================================
       * 第六步：解析 NocoDB 返回结果
       * ===================================================
       *
       * 非常重要的一个坑：
       *
       * NocoDB v2 的“批量修改记录”接口
       *
       *     PATCH /api/v2/tables/{tableId}/records
       *
       * 成功以后只会返回记录 ID，例如：
       *
       *     [ { "Id": 6 } ]
       *
       * 或者：
       *
       *     { "Id": 6 }
       *
       * 它不会返回任何一个业务字段。
       *
       * 所以这里绝对不能：
       *
       *     直接把 NocoDB 的返回值
       *     当成“修改成功以后的完整风险记录”
       *     返回给前端。
       *
       * 否则前端拿到的就是：
       *
       *     {
       *       id: 'xxx',
       *       date: '',
       *       status: '',
       *       description: '',
       *       handling: '',
       *       inspector: '',
       *       remark: '',
       *     }
       *
       * 前端再用这条“全是空字符串”的记录
       * 覆盖本地已经保存好的数据，
       * 界面上刚刚编辑过的风险排查记录就会显示为空。
       *
       * 正确做法：
       *
       *     NocoDB 真正返回的字段
       *              +
       *     本地刚刚成功写入的 updateFields
       *              ⇓
       *     合并成一条“确定已经保存成功”的完整记录
       * ===================================================
       */
      let updatedRecord = null

      try {
        updatedRecord =
          responseText
            ? JSON.parse(
                responseText
              )
            : null
      } catch {
        updatedRecord = null
      }

      /*
       * ---------------------------------------------------
       * 兼容 NocoDB 的多种返回结构：
       *
       * 1. [ { Id: 6 } ]           数组
       * 2. { Id: 6 }               对象
       * 3. { record: { Id: 6 } }   嵌套对象
       * ---------------------------------------------------
       */
      const nocoRecord =
        Array.isArray(
          updatedRecord
        )
          ? updatedRecord[0]
          : updatedRecord &&
                typeof updatedRecord ===
                  'object' &&
                updatedRecord.record &&
                typeof updatedRecord.record ===
                  'object'
            ? updatedRecord.record
            : updatedRecord

      /*
       * NocoDB 真正返回的字段。
       *
       * 如果它只返回 Id，
       * 这里就只有一个 Id，
       * 后面的 updateFields 会补齐所有业务字段。
       */
      const nocoFields =
        nocoRecord &&
        typeof nocoRecord === 'object' &&
        !Array.isArray(
          nocoRecord
        )
          ? nocoRecord
          : {}

      /*
       * ---------------------------------------------------
       * 组装真正要返回给前端的完整风险记录
       * ---------------------------------------------------
       *
       * 顺序很重要：
       *
       *     1. 先放 NocoDB 返回的字段
       *     2. 再放本地刚刚成功写入的字段（优先级更高）
       *
       * 因为 updateFields 就是刚刚确认写入数据库成功的内容，
       * 它是当前这一次修改最可信的数据来源。
       * ---------------------------------------------------
       */
      const mergedRecord = {
        ...nocoFields,
        ...updateFields,
      }

      const serverRecord = {
        id:
          riskId,

        title:
          mergedRecord.Title ||
          mergedRecord.title ||
          '',

        /*
         * 排查日期。
         *
         * 已经被统一成 YYYY-MM-DD。
         */
        date:
          mergedRecord['排查日期'] ||
          '',

        /*
         * 是否存在风险。
         *
         * 当前前端统一使用 status，
         * 同时保留 hasRisk 方便前端标准化。
         */
        status:
          mergedRecord['是否存在风险'] ||
          '',

        hasRisk:
          mergedRecord['是否存在风险'] ||
          '',

        description:
          mergedRecord['风险隐患描述'] ||
          '',

        handling:
          mergedRecord['处置情况'] ||
          '',

        inspector:
          mergedRecord['排查人'] ||
          '',

        remark:
          mergedRecord['备注'] ||
          '',

        /*
         * 修改已有记录不会改变“添加时间”。
         *
         * NocoDB 的修改接口不返回 CreatedAt，
         * 这里能取到就返回，取不到就交给前端继续沿用
         * 本地已经保存的 createdAt。
         */
        createdAt:
          mergedRecord.CreatedAt ||
          mergedRecord.createdAt ||
          mergedRecord['创建时间'] ||
          '',

        /*
         * 保留 NocoDB 原始返回值，
         * 方便以后排查问题。
         */
        raw:
          updatedRecord,
      }

      /*
       * ===================================================
       * 第七步：清除缓存
       *
       * 风险排查记录属于青少年关联数据。
       *
       * 修改成功后必须让下一次读取重新访问 NocoDB，
       * 避免前端继续看到旧数据。
       * ===================================================
       */
      clearCache()

      console.log(
        '风险排查记录修改成功：',
        riskId
      )

      console.log(
        '风险数据缓存已清除'
      )

      console.log(
        '===================================='
      )

      console.log(
        '返回前端的完整风险记录：',
        serverRecord
      )

      /*
       * ===================================================
       * 第八步：返回前端
       * ===================================================
       *
       * 返回给前端的必须是上面组装好的
       * serverRecord，
       *
       * 而不是 NocoDB 只带 Id 的原始返回值。
       * ===================================================
       */
      return res.json({
        success: true,

        message:
          '风险排查记录修改成功',

        id:
          riskId,

        record:
          serverRecord,
      })
    } catch (error) {
      console.error(
        '修改风险排查记录失败：',
        error
      )

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          '修改风险排查记录失败',
      })
    }
  }
)


/* ---------------------------------------------------------
   删除风险排查记录

   DELETE
   /api/risks/:riskId
   --------------------------------------------------------- */
app.delete(
  '/api/risks/:riskId',
  async (req, res) => {
    const riskId =
      String(
        req.params.riskId || ''
      ).trim()

    if (!riskId) {
      return res.status(400).json({
        success: false,
        message: '缺少风险排查记录ID',
      })
    }

    /*
     * =====================================================
     * 删除失败 404 的真正原因
     * =====================================================
     *
     * NocoDB v2 并没有“单条删除”路由：
     *
     *     DELETE /api/v2/tables/{tableId}/records/{id}
     *
     * 这个地址会直接返回：
     *
     *     404 Cannot DELETE
     *
     * 必须使用“批量删除”形式：
     *
     *     DELETE /api/v2/tables/{tableId}/records
     *     body：[ { Id: 记录ID } ]
     *
     * 所以这里改成批量删除接口。
     * =====================================================
     */
    const url =
      NOCODB_BASE_URL +
      '/api/v2/tables/' +
      TABLE_IDS.risks +
      '/records'

    try {
      console.log(
        '正在删除风险排查记录：',
        riskId
      )

      /*
       * =====================================================
       * 删除前先留一份快照
       * =====================================================
       *
       * 这样管理员日后可以在「系统管理 → 回收站」
       * 把这条记录恢复回来。
       *
       * 读快照失败不能影响正常删除，
       * 所以这里吞掉异常。
       */
      let snapshot = null

      try {
        const snapshotResponse =
          await fetch(
            NOCODB_BASE_URL +
              '/api/v2/tables/' +
              TABLE_IDS.risks +
              '/records/' +
              riskId,
            {
              headers:
                getHeaders(),
            },
          )

        if (
          snapshotResponse.ok
        ) {
          snapshot =
            await snapshotResponse.json()
        }
      } catch (snapshotError) {
        snapshot = null
      }

      const response =
        await fetch(
          url,
          {
            method: 'DELETE',
            headers:
              getHeaders(),
            body:
              JSON.stringify([
                {
                  Id: Number(
                    riskId
                  ),
                },
              ]),
          }
        )

      const responseText =
        await response.text()

      if (!response.ok) {
        console.error(
          '删除风险排查记录失败：',
          response.status,
          responseText
        )

        return res.status(
          response.status
        ).json({
          success: false,
          message:
            '删除风险排查记录失败：' +
            response.status,
          detail:
            responseText,
        })
      }

      clearCache()

      console.log(
        '风险排查记录删除成功：',
        riskId
      )

      recordDeletion({
        kind: 'risks',
        kindLabel:
          '风险排查记录',
        recordId: riskId,
        record: {
          ...(snapshot || {}),
          rawFields:
            snapshot || {},
        },
        youthId:
          snapshot?.青少年基本信息表?.[0]
            ?.Id || '',
        youthName:
          req.body?.youthName || '',
        user: req.user,
      })

      return res.json({
        success: true,
        message:
          '风险排查记录删除成功',
        id: riskId,
      })
    } catch (error) {
      console.error(
        '删除风险排查记录失败：',
        error
      )

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          '删除风险排查记录失败',
      })
    }
  }
)

app.put('/api/youth/:id', async (req, res) => {
  const youthId = String(req.params.id || '').trim()

  if (!youthId) {
    return res.status(400).json({
      success: false,
      message: '缺少青少年记录ID',
    })
  }

  const body =
    req.body && typeof req.body === 'object'
      ? req.body
      : {}

  /**
   * =====================================================
   * 乡镇账号越权保护
   * =====================================================
   *
   * 乡镇账号只能编辑
   * “归口单位等于本乡镇”的数据。
   *
   * 县级与管理员不受限制。
   */
  if (
    req.user &&
    req.user.role === 'town'
  ) {
    let rawRecord = null

    try {
      const response =
        await fetch(
          NOCODB_BASE_URL +
            '/api/v2/tables/' +
            TABLE_IDS.youth +
            '/records/' +
            encodeURIComponent(
              youthId,
            ),
          {
            headers:
              getHeaders(),
          },
        )

      if (response.ok) {
        rawRecord =
          await response.json()
      }
    } catch (fetchError) {
      rawRecord = null
    }

    if (!rawRecord) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            '未找到该青少年记录',
        })
    }

    if (
      !canAccessYouth(
        req.user,
        rawRecord,
      )
    ) {
      return res
        .status(403)
        .json({
          success: false,
          message:
            '只能编辑本乡镇（归口单位）的数据',
        })
    }
  }

  // 只允许修改青少年基本信息表中的这些字段
  const allowedFields = [
    '姓名',
    '性别',
    '出生年月',
    '政治面貌',
    '户籍地',
    '常住地',
    '个人基本情况',
    '联系方式',
    '监护人姓名',
    '监护人联系方式',
    '是否需要帮扶',
    '备注',
  ]

  const updateFields = {}

  for (const field of allowedFields) {
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        field,
      )
    ) {
      updateFields[field] =
        body[field] == null
          ? ''
          : body[field]
    }
  }

  /**
   * 前端统一使用“基本情况”，
   * 但 NocoDB 青少年基本信息表里的真实字段名是
   * “个人基本情况”。
   *
   * 实测：
   * 直接写“基本情况”返回 200 但不会保存，
   * 所以这里必须转换成真实字段名。
   */
  if (
    Object.prototype.hasOwnProperty.call(
      updateFields,
      '基本情况',
    )
  ) {
    if (
      !Object.prototype.hasOwnProperty.call(
        updateFields,
        '个人基本情况',
      )
    ) {
      updateFields['个人基本情况'] =
        updateFields['基本情况']
    }

    delete updateFields['基本情况']
  }

  // 统一“是否需要帮扶”的值
  if (
    Object.prototype.hasOwnProperty.call(
      updateFields,
      '是否需要帮扶',
    )
  ) {
    const normalized =
      normalizeNeedHelp(
        updateFields['是否需要帮扶'],
      )

    if (normalized) {
      updateFields['是否需要帮扶'] =
        normalized
    }
  }

  /**
   * 归口单位根据登录账号角色填写：
   *
   *     管理员     -> 系统管理员
   *     县级管理员 -> 县级管理员
   *     乡镇 / 社区 -> 账号所属乡镇（社区）
   *
   * 这样“编辑的数据”也跟随录入人，
   * 乡镇账号数据隔离才能稳定生效。
   */
  const responsibleUnit =
    responsibleUnitForUser(
      req.user,
    )

  if (responsibleUnit) {
    updateFields['归口单位'] =
      responsibleUnit
  }

  /**
   * 清洗空值。
   *
   * 编辑时把某一项清空，
   * 前端同样会提交空字符串。
   *
   * 日期列收到空字符串会报 400，
   * 这里统一转成 null。
   */
  normalizeDateFields(updateFields)
  sanitizeEmptyValues(updateFields)

  /**
   * 关联表字段。
   *
   * 这几项不在青少年基本信息表里，
   * 需要单独写入各自的关联表：
   *
   *     困难类别   -> 困难类别表（链接字段）
   *     帮扶需求   -> 帮扶需求表
   *     结对帮扶   -> 结对帮扶信息表
   */
  const hasCategoryChange =
    body.categories !== undefined ||
    body.bigCategory !== undefined

  const hasHelpNeedChange =
    body.helpNeed !== undefined

  const hasPairingChange =
    body.pairing !== undefined ||
    body.pairingContact !== undefined ||
    body.pairingPhone !== undefined ||
    body.pairingUnit !== undefined

  if (
    Object.keys(updateFields).length ===
      0 &&
    !hasCategoryChange &&
    !hasHelpNeedChange &&
    !hasPairingChange
  ) {
    return res.status(400).json({
      success: false,
      message: '没有可保存的字段',
    })
  }

  // NocoDB API v2 的更新接口：
  // PATCH /api/v2/tables/{tableId}/records
  //
  // 记录 ID 放在请求体中的 Id 字段，
  // 而不是放在 URL 的 /records/{id} 后面。
  const url =
    NOCODB_BASE_URL +
    '/api/v2/tables/' +
    TABLE_IDS.youth +
    '/records'

  /**
   * 手机号等敏感字段落库前加密。
   *
   * 这样即使数据库被拖走，
   * 也拿不到明文号码。
   */
  const requestBody =
    security.encryptSensitiveFields({
      Id: youthId,
      ...updateFields,
    })

  console.log(
    '正在写入 NocoDB：',
    youthId,
  )

  console.log(
    'NocoDB 写入地址：',
    url,
  )

  console.log(
    '写入字段：',
    updateFields,
  )

  console.log(
    'NocoDB 请求体：',
    requestBody,
  )

  try {
    let updatedRecord = null

    /**
     * 主表字段写入。
     *
     * 只有确实有主表字段时才请求，
     * 否则 NocoDB 会因为没有可更新字段而报错。
     */
    if (
      Object.keys(updateFields).length >
      0
    ) {
      const response = await fetch(
        url,
        {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify(
            requestBody,
          ),
        },
      )

      const responseText =
        await response.text()

      if (!response.ok) {
        console.error(
          'NocoDB 写入失败：',
          response.status,
          responseText,
        )

        return res.status(
          response.status,
        ).json({
          success: false,
          message:
            'NocoDB 写入失败：' +
            response.status,
          detail: responseText,
        })
      }

      try {
        updatedRecord =
          responseText
            ? JSON.parse(
                responseText,
              )
            : null
      } catch {
        updatedRecord = null
      }
    }

    /**
     * ----------------------------------------------------
     * 关联表写入
     * ----------------------------------------------------
     *
     * 这几步以前完全没有做，
     * 所以才会出现：
     *
     *     困难类别改了，前端显示变了，
     *     刷新又变回去（数据库没写）。
     *
     *     帮扶需求改了，刷新也变回去。
     */
    const syncResult = {}

    if (hasCategoryChange) {
      syncResult.category =
        await youthWriter.syncCategory(
          youthId,
          {
            smallCategory:
              body.categories,
            bigCategory:
              body.bigCategory,
          },
        )
    }

    if (hasHelpNeedChange) {
      syncResult.helpNeed =
        await youthWriter.syncHelpNeed(
          youthId,
          body.helpNeed,
        )
    }

    if (hasPairingChange) {
      syncResult.pairing =
        await youthWriter.syncPairing(
          youthId,
          {
            paired: body.pairing,
            contact:
              body.pairingContact,
            phone: body.pairingPhone,
            unit: body.pairingUnit,
          },
        )
    }

    /**
     * ----------------------------------------------------
     * 是否需要帮扶 = 否：清空所有帮扶信息
     * ----------------------------------------------------
     *
     * 前端在选“否”时已经把帮扶相关输入框禁用，
     * 这里负责把数据库里残留的帮扶需求、
     * 结对帮扶明细（联系人 / 电话 / 单位）真正清空，
     * 保持前后端一致。
     */
    if (
      updateFields['是否需要帮扶'] ===
      '否'
    ) {
      syncResult.helpCleared =
        await youthWriter.clearHelpInfo(
          youthId,
        )
    }

    /**
     * 关键修复：
     *
     * 青少年写入会同步创建 / 更新
     * 结对帮扶信息表、帮扶需求表里的记录
     * （见 youthWrite.syncPairing / syncHelpNeed）。
     *
     * 但这几张表被帮扶管理模块整体缓存了
     * （helpApi.js 的 helpCache），
     * youthWrite 并不会去清那个缓存，
     * 导致「编辑 / 新增人员后，
     * 帮扶管理右侧读不到刚写的数据」。
     *
     * 这里在写入成功后主动清掉对应缓存，
     * 下一次读取会从 NocoDB 重新拉取最新数据。
     */
    if (
      hasPairingChange ||
      updateFields['是否需要帮扶'] ===
        '否'
    ) {
      if (
        typeof clearHelpCacheAll ===
        'function'
      ) {
        clearHelpCacheAll('pairings')
      }
    }

    if (
      hasHelpNeedChange ||
      updateFields['是否需要帮扶'] ===
        '否'
    ) {
      if (
        typeof clearHelpCacheAll ===
        'function'
      ) {
        clearHelpCacheAll('help-needs')
      }
    }

    if (
      updateFields['是否需要帮扶'] ===
      '否'
    ) {
      if (
        typeof clearHelpCacheAll ===
        'function'
      ) {
        clearHelpCacheAll('help-records')
      }
    }

    // 写入成功以后立即清除后端缓存。
    // 下一次读取时会重新从 NocoDB 获取最新数据。
    clearCache()

    console.log(
      'NocoDB 写入成功：',
      youthId,
      syncResult,
    )

    return res.json({
      success: true,
      message: '数据库保存成功',
      id: youthId,
      fields: updateFields,
      syncResult,
      record: updatedRecord,
    })
  } catch (error) {
    console.error(
      '调用 NocoDB 写入接口失败：',
      error,
    )

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        '调用 NocoDB 写入接口失败',
    })
  }
})

/* =========================================================
   删除青少年（含回收站快照）

   DELETE
   /api/youth/:id

   与风险排查记录删除保持一致：

   1. 乡镇账号先做越权校验
      （只能删除本乡镇 / 社区的数据）
   2. 删除前先留一份完整快照
   3. 用 NocoDB v2 批量删除接口真正删除
   4. 写入回收站，管理员可以恢复

   删除只针对“青少年基本信息表”主记录。
   风险排查 / 帮扶需求 / 结对帮扶等子记录
   通过关联字段挂在主记录上，
   主记录删除后前端不会再展示，
   因此这里不级联删除子表，避免误伤。
   ========================================================= */
app.delete(
  '/api/youth/:id',
  async (req, res) => {
    const youthId =
      String(
        req.params.id || '',
      ).trim()

    if (!youthId) {
      return res.status(400).json({
        success: false,
        message: '缺少青少年记录ID',
      })
    }

    try {
      /**
       * 乡镇账号越权校验：
       * 只能删除本乡镇（归口单位）的数据。
       */
      if (
        req.user &&
        req.user.role === 'town'
      ) {
        let rawRecord = null

        try {
          const response =
            await fetch(
              NOCODB_BASE_URL +
                '/api/v2/tables/' +
                TABLE_IDS.youth +
                '/records/' +
                encodeURIComponent(
                  youthId,
                ),
              {
                headers:
                  getHeaders(),
              },
            )

          if (response.ok) {
            rawRecord =
              await response.json()
          }
        } catch {
          rawRecord = null
        }

        if (
          !rawRecord ||
          !canAccessYouth(
            req.user,
            rawRecord,
          )
        ) {
          return res
            .status(403)
            .json({
              success: false,
              message:
                '只能删除本乡镇（归口单位）的数据',
            })
        }
      }

      /**
       * 删除前先留一份快照，
       * 方便管理员在「系统管理 → 回收站」恢复。
       */
      let snapshot = null

      try {
        const snapshotResponse =
          await fetch(
            NOCODB_BASE_URL +
              '/api/v2/tables/' +
              TABLE_IDS.youth +
              '/records/' +
              encodeURIComponent(
                youthId,
              ),
            {
              headers:
                getHeaders(),
            },
          )

        if (
          snapshotResponse.ok
        ) {
          snapshot =
            await snapshotResponse.json()
        }
      } catch {
        snapshot = null
      }

      const response =
        await fetch(
          NOCODB_BASE_URL +
            '/api/v2/tables/' +
            TABLE_IDS.youth +
            '/records',
          {
            method: 'DELETE',
            headers:
              getHeaders(),
            body: JSON.stringify([
              {
                Id: Number(
                  youthId,
                ),
              },
            ]),
          },
        )

      const responseText =
        await response.text()

      if (!response.ok) {
        console.error(
          '删除青少年失败：',
          response.status,
          responseText,
        )

        return res
          .status(response.status)
          .json({
            success: false,
            message:
              '删除青少年数据失败：' +
              response.status,
            detail: responseText,
          })
      }

      clearCache()

      recordDeletion({
        kind: 'youth',
        kindLabel:
          '青少年基本信息',
        recordId: youthId,
        record: {
          ...(snapshot || {}),
          rawFields:
            snapshot || {},
        },
        youthId,
        youthName:
          snapshot?.['姓名'] ||
          snapshot?.fields?.['姓名'] ||
          '',
        user: req.user,
      })

      console.log(
        '青少年删除成功：',
        youthId,
      )

      return res.json({
        success: true,
        message: '已删除',
        id: youthId,
      })
    } catch (error) {
      console.error(
        '删除青少年失败：',
        error,
      )

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          '删除青少年数据失败',
      })
    }
  },
)

/* =========================================================
   新增青少年
   =========================================================

   POST /api/youth

   保存顺序：

       1. 在青少年基本信息表创建记录
       2. 建立困难类别关联
       3. 写入帮扶需求
       4. 写入结对帮扶
       5. 强制刷新缓存，并把标准化后的新记录返回给前端

   返回标准化记录，
   前端拿到以后直接放进列表即可实时显示。
   ========================================================= */
app.post(
  '/api/youth',
  async (req, res) => {
    const body =
      req.body &&
      typeof req.body === 'object'
        ? req.body
        : {}

    if (
      !String(
        body['姓名'] ?? '',
      ).trim()
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: '姓名不能为空',
        })
    }

    const fields = {}

    const allowedFields = [
      '姓名',
      '性别',
      '出生年月',
      '政治面貌',
      '户籍地',
      '常住地',
      '个人基本情况',
      '联系方式',
      '监护人姓名',
      '监护人联系方式',
      '是否需要帮扶',
      '备注',
    ]

    for (const field of allowedFields) {
      if (
        Object.prototype.hasOwnProperty.call(
          body,
          field,
        )
      ) {
        fields[field] =
          body[field] == null
            ? ''
            : body[field]
      }
    }

    if (
      body['基本情况'] !==
      undefined
    ) {
      fields['个人基本情况'] =
        body['基本情况']
    }

    if (
      fields['是否需要帮扶'] !==
      undefined
    ) {
      fields['是否需要帮扶'] =
        normalizeNeedHelp(
          fields['是否需要帮扶'],
        ) || '否'
    }

    /**
     * 归口单位根据登录账号角色填写：
     *
     *     管理员     -> 系统管理员
     *     县级管理员 -> 县级管理员
     *     乡镇 / 社区 -> 账号所属乡镇（社区）
     *
     * 管理员 / 县级账号不再按户籍地推算，
     * 而是固定为角色标签，
     * 这样“录入的数据”天然归属到录入人。
     */
    const responsibleUnit =
      responsibleUnitForUser(
        req.user,
      )

    if (responsibleUnit) {
      fields['归口单位'] =
        responsibleUnit
    }

    /**
     * 清洗空值，
     * 避免空字符串写进日期列导致 NocoDB 报 400。
     */
    normalizeDateFields(fields)
    sanitizeEmptyValues(fields)

    /**
     * 建档时间（数据时间戳）：
     * 新录入的人员自动写入“今天”，
     * 这样纵向对比趋势图能如实反映
     * 后续每月新增人数，而不是都堆在导入日。
     */
    if (
      !String(
        fields['数据时间戳'] ?? '',
      ).trim()
    ) {
      fields['数据时间戳'] =
        new Date()
          .toISOString()
          .slice(0, 10)
    }

    try {
      const created =
        await youthWriter.createYouth(
          fields,
        )

      const syncResult = {}

      if (
        body.categories ||
        body.bigCategory
      ) {
        syncResult.category =
          await youthWriter.syncCategory(
            created.id,
            {
              smallCategory:
                body.categories,
              bigCategory:
                body.bigCategory,
            },
          )
      }

      if (
        body.helpNeed &&
        String(
          body.helpNeed,
        ).trim() &&
        String(
          body.helpNeed,
        ).trim() !== '暂无'
      ) {
        syncResult.helpNeed =
          await youthWriter.syncHelpNeed(
            created.id,
            body.helpNeed,
          )
      }

      if (
        body.pairing === '是' ||
        body.pairingContact ||
        body.pairingPhone ||
        body.pairingUnit
      ) {
        syncResult.pairing =
          await youthWriter.syncPairing(
            created.id,
            {
              paired:
                body.pairing,
              contact:
                body.pairingContact,
              phone:
                body.pairingPhone,
              unit: body.pairingUnit,
            },
          )
      }

      /**
       * 关键修复：
       *
       * 与编辑一致 —— 青少年写入会同步创建
       * 结对帮扶 / 帮扶需求记录（youthWrite），
       * 但帮扶模块的 helpCache 不会因此失效，
       * 导致「新增人员后帮扶管理右侧读不到」。
       *
       * 这里主动清掉对应缓存。
       */
      if (
        body.pairing === '是' ||
        body.pairingContact ||
        body.pairingPhone ||
        body.pairingUnit
      ) {
        if (
          typeof clearHelpCacheAll ===
          'function'
        ) {
          clearHelpCacheAll('pairings')
        }
      }

      if (
        body.helpNeed &&
        String(body.helpNeed).trim() &&
        String(body.helpNeed).trim() !==
          '暂无'
      ) {
        if (
          typeof clearHelpCacheAll ===
          'function'
        ) {
          clearHelpCacheAll('help-needs')
        }
      }

      /**
       * 强制刷新，
       * 把新建的这条记录标准化后返回。
       */
      clearCache()

      const data =
        await loadYouthData(true)

      const record =
        data.records.find(
          (item) =>
            String(
              item.key,
            ) ===
            String(
              created.id,
            ),
        ) || null

      return res.json({
        success: true,
        message: '新增人员保存成功',
        id: created.id,
        syncResult,
        record,
      })
    } catch (error) {
      console.error(
        '新增青少年失败：',
        error,
      )

      const rawMessage = String(
        error?.message || '',
      )

      /**
       * NocoDB 的日期报错对用户来说看不懂，
       * 这里换成一句能看懂的提示。
       */
      const isDateError =
        /date \/ time|date|time/i.test(
          rawMessage,
        ) &&
        /invalid/i.test(rawMessage)

      return res
        .status(
          isDateError ? 400 : 500,
        )
        .json({
          success: false,
          message: isDateError
            ? '日期格式不正确：出生年月等日期项请按 年-月-日 填写，不填请留空'
            : rawMessage ||
              '新增青少年失败',
        })
    }
  },
)

/* =========================================================
   帮扶管理模块
   =========================================================

   结对帮扶 / 帮扶需求 / 帮扶记录
   的增删改查与照片上传。

   统一放在独立文件里，
   避免 server.js 继续膨胀。

   注意：
   必须注册在 app.listen 之前、
   且在所有 /api/youth/... 路由之后，
   这样才不会抢占已有的
   GET /api/youth/:youthId/risks。
   ========================================================= */
const {
  registerHelpRoutes,
  clearHelpCacheAll,
} = require('./helpApi')

/**
 * =========================================================
 * 帮扶模块的数据归属校验
 * =========================================================
 *
 * 必须注册在 registerHelpRoutes 之前，
 * 否则 Express 会先命中业务路由，守卫就形同虚设。
 *
 * 只拦「乡镇账号的写入操作」：
 *     新增（POST）  用请求体里的青少年 Id 判断
 *     修改（PUT）   用路径里的子表记录 Id 反查归属
 *     删除（DELETE）同上
 *     上传 / 删除照片 用路径里的帮扶记录 Id 反查归属
 */
app.use('/api/help', guardHelpScope)

registerHelpRoutes(
  app,
  {
    NOCODB_BASE_URL,
    TABLE_IDS,
    getHeaders,
    recordDeletion,
    /**
     * 帮扶汇总（/api/help/summary）要按乡镇过滤，
     * 需要拿到青少年数据与判权函数。
     */
    loadYouthData,
    canAccessYouth,
    buildStatistics,
  },
)

/* =========================================================
   托管前端构建产物（单服务部署）
   =========================================================

   生产环境下前端 build 到项目根目录 dist/，
   这里把 dist 作为静态资源托管，
   并把非 /api 的请求全部回退到 index.html，
   实现“前端 + 后端同一个服务”的傻瓜式部署。

   本地开发时 dist 可能不存在，
   这段静默跳过，不影响接口调试。
   ========================================================= */
const distDir = path.join(
  __dirname,
  '..',
  'dist',
)

const fs = require('fs')

if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir),
  )

  /**
   * Express 5 的通配路由写法：
   * 所有非 /api 的 GET 都回退到 index.html，
   * 交给前端路由处理（SPA）。
   */
  app.get(
    '/{*splat}',
    (req, res, next) => {
      if (
        req.path.startsWith('/api')
      ) {
        return next()
      }

      res.sendFile(
        path.join(
          distDir,
          'index.html',
        ),
      )
    },
  )
}

app.listen(
  PORT,
  () => {
    console.log(
      '服务器已启动：http://localhost:' +
        PORT
    )
  }
)