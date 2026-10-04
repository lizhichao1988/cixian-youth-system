/**
 * =============================================================
 * 认证 / 权限 / 回收站 / 操作日志
 * =============================================================
 *
 * 本模块独立于 server.js，
 * 通过依赖注入的方式拿到 NocoDB 配置，
 * 避免把 server.js 撑得更大、更难维护。
 *
 * 提供的能力：
 *
 *     1. 登录校验（账号表在 NocoDB 里）
 *     2. 登录态（内存 session + token）
 *     3. 三级权限：管理员 / 县级 / 乡镇
 *     4. 回收站：删除任何业务记录前先存快照，
 *        管理员可以恢复，县级不能恢复
 *     5. 操作日志
 * =============================================================
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/**
 * 安全防护：
 *
 *     密码加盐哈希校验（兼容旧明文）
 *     token 签名 + 有效期
 */
const security = require('./security')

/**
 * 角色优先级。
 *
 * 数字越大权限越高。
 */
const ROLE_LEVEL = {
  town: 1,
  county: 2,
  admin: 3,
}

const ROLE_LABEL = {
  admin: '系统管理员',
  county: '县级管理员',
  town: '乡镇管理员',
}

/**
 * =========================================================
 * 本地数据文件
 * =========================================================
 *
 * 回收站与操作日志
 * 不适合写进 NocoDB（会污染业务表），
 * 因此存成本地 JSON 文件。
 */
const DATA_DIR = path.join(__dirname, 'data')

const RECYCLE_FILE = path.join(DATA_DIR, 'recycle.json')
const LOG_FILE = path.join(DATA_DIR, 'operation-logs.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback
    }

    const text = fs.readFileSync(filePath, 'utf8')

    if (!text.trim()) {
      return fallback
    }

    return JSON.parse(text)
  } catch (error) {
    console.error('读取本地数据文件失败：', filePath, error.message)
    return fallback
  }
}

function writeJsonFile(filePath, value) {
  try {
    ensureDataDir()
    fs.writeFileSync(
      filePath,
      JSON.stringify(value, null, 2),
      'utf8',
    )
    return true
  } catch (error) {
    console.error('写入本地数据文件失败：', filePath, error.message)
    return false
  }
}

function readRecycleBin() {
  const list = readJsonFile(RECYCLE_FILE, [])
  return Array.isArray(list) ? list : []
}

function writeRecycleBin(list) {
  return writeJsonFile(RECYCLE_FILE, list)
}

function readLogs() {
  const list = readJsonFile(LOG_FILE, [])
  return Array.isArray(list) ? list : []
}

function writeLogs(list) {
  return writeJsonFile(LOG_FILE, list)
}

/**
 * 追加一条操作日志。
 *
 * 只保留最近 500 条，
 * 避免文件无限增长。
 */
function appendLog(entry) {
  const logs = readLogs()

  logs.unshift({
    ...entry,
    time: new Date().toISOString(),
  })

  writeLogs(logs.slice(0, 500))
}

/**
 * =========================================================
 * 登录态
 * =========================================================
 *
 * token -> 用户信息。
 *
 * 重启后端会清空，
 * 前端发现 401 会自动退回登录页。
 */
const sessions = new Map()

function createSession(
  user,
  extra = {},
) {
  /**
   * token 带 HMAC 签名，
   * 别人伪造不出来；
   * 同时带有效期，
   * 过期自动失效。
   *
   * extra 用于挂会话级标记，
   * 例如 mustChangePassword（弱口令登录后必须改密）。
   */
  const { token, expiresAt } =
    security.createSecureToken()

  sessions.set(token, {
    ...user,
    ...extra,
    loginAt: new Date().toISOString(),
    expiresAt,
  })

  return token
}

/**
 * 清除会话上的「必须改密」标记。
 *
 * 改密成功后调用，
 * 用户不用重新登录就能继续使用系统。
 */
function clearMustChangePassword(token) {
  if (!token) {
    return
  }

  const session = sessions.get(
    String(token).trim(),
  )

  if (!session) {
    return
  }

  delete session.mustChangePassword

  sessions.set(
    String(token).trim(),
    session,
  )
}

function getSession(token) {
  if (!token) {
    return null
  }

  const clean = String(token).trim()

  /**
   * 先校验签名与有效期。
   *
   * 伪造 / 篡改过的 token 直接拒绝，
   * 不用查会话表。
   */
  if (!security.verifySecureToken(clean)) {
    sessions.delete(clean)
    return null
  }

  const session = sessions.get(clean)

  if (!session) {
    return null
  }

  /**
   * 服务端有效期校验（防重放）。
   */
  if (
    session.expiresAt &&
    Date.now() > session.expiresAt
  ) {
    sessions.delete(clean)
    return null
  }

  /**
   * 滑动续期：
   * 用户一直在操作就不会掉线；
   * 长时间不动则自动登出。
   */
  session.expiresAt =
    Date.now() + security.SESSION_TTL_MS

  return session
}

function destroySession(token) {
  if (!token) {
    return
  }

  sessions.delete(String(token).trim())
}

/**
 * =========================================================
 * 中间件：解析登录态
 * =========================================================
 */
/**
 * =========================================================
 * 密码强度校验
 * =========================================================
 *
 * 规则（对新账号、改密码生效，不影响历史账号登录）：
 *
 *     1. 必填
 *     2. 至少 8 位
 *     3. 必须同时含字母和数字
 *     4. 不能是连续或重复的简单串（12345678 / 11111111 之类）
 *     5. 不能等于账号名
 *
 * @returns {string} 空串表示通过；非空是给用户看的错误提示
 */
function validatePassword(
  password,
  options = {},
) {
  const { required = false, account = '' } =
    options

  const value = String(password ?? '')

  if (!value) {
    return required
      ? '请设置密码'
      : ''
  }

  if (value.length < 8) {
    return '密码至少 8 位'
  }

  if (
    !/[A-Za-z]/.test(value) ||
    !/\d/.test(value)
  ) {
    return '密码必须同时包含字母和数字'
  }

  if (
    /^(?:(\d)\1{7,}|12345678|87654321|abcdefgh)$/i.test(
      value,
    )
  ) {
    return '密码过于简单，请换一个'
  }

  /**
   * 「单词 + 几个数字」这类组合。
   *
   * 典型就是系统里现在还在用的：
   *
   *     admin123 / county123 / town123 / password1
   *
   * 它们长度够、也含字母和数字，
   * 能绕过上面所有规则，
   * 但本质是字典词，
   * 撞库工具第一个就试这些。
   *
   * 因此单独识别出来。
   */
  if (/^[A-Za-z]+\d{1,4}$/.test(value)) {
    return (
      '密码不能是「英文单词 + 简单数字」' +
      '（例如 admin123），请换一个更复杂的'
    )
  }

  /**
   * 常见弱口令词根。
   */
  const WEAK_ROOTS = [
    'password',
    'admin',
    'qwerty',
    'abc123',
    'iloveyou',
    'letmein',
    'welcome',
    '123456',
    '000000',
    '111111',
  ]

  const lower = value.toLowerCase()

  /**
   * 只拦截「词根本身」和「词根 + 简单数字后缀」。
   *
   * 之前这里写的是 startsWith(root)，
   * 也就是只要以 admin / password 开头就判弱，
   * 结果连 Admin@2026#cixian 这种
   * 长度够、带符号、撞库工具未必试的密码
   * 也被一刀切拦下，
   * 管理员一登录就被锁、看不到任何数据。
   *
   * 现在先去掉特殊符号再看结构：
   *
   *     admin          弱
   *     admin123       弱（词根 + 1~4 位数字）
   *     admin@123      弱（符号去掉后同上）
   *     Admin@2026#cx  通过（词根后面还有复杂内容）
   */
  const stripped = lower.replace(
    /[^a-z0-9]/g,
    '',
  )

  if (
    WEAK_ROOTS.some((root) => {
      if (stripped === root) {
        return true
      }

      if (!stripped.startsWith(root)) {
        return false
      }

      const rest = stripped.slice(
        root.length,
      )

      /**
       * 词根后面只跟 1~4 位数字。
       *
       * 超过 4 位或者还带了别的字母，
       * 就认为不是简单字典词了。
       */
      return /^\d{1,4}$/.test(rest)
    })
  ) {
    return '密码包含常见弱口令，请换一个'
  }

  if (
    account &&
    value.toLowerCase() ===
      String(account).toLowerCase()
  ) {
    return '密码不能和账号相同'
  }

  return ''
}

function attachUser(req, res, next) {
  const token =
    req.headers['x-auth-token'] ||
    req.headers['authorization'] ||
    ''

  const cleanToken = String(token)
    .replace(/^Bearer\s+/i, '')
    .trim()

  req.user = getSession(cleanToken)
  req.token = cleanToken

  next()
}

/**
 * 要求已登录。
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: '请先登录',
    })
  }

  next()
}

/**
 * 要求指定角色及以上。
 */
function requireRole(role) {
  const need = ROLE_LEVEL[role] || 0

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '请先登录',
      })
    }

    const has = ROLE_LEVEL[req.user.role] || 0

    if (has < need) {
      return res.status(403).json({
        success: false,
        message: '当前账号没有该操作权限',
      })
    }

    next()
  }
}

/**
 * =========================================================
 * 乡镇归属判断
 * =========================================================
 *
 * 乡镇账号只能处理
 * 「户籍地」包含本乡镇名称的数据。
 */
function matchTown(text, town) {
  if (!town || town === '全部') {
    return true
  }

  return String(text || '').includes(town)
}

/**
 * 磁县统一乡镇 / 社区名录。
 *
 * 系统管理、帮扶管理、数据统计、
 * 乡镇数据隔离全部使用同一套口径。
 */
const TOWN_NAMES = [
  '磁州镇',
  '讲武城镇',
  '路村营镇',
  '时村营镇',
  '白土镇',
  '岳城镇',
  '陶泉乡',
  '北贾璧乡',
  '黄沙镇',
  '观台镇',
  '都党乡',
]

/**
 * 旧乡镇名 -> 新乡镇名。
 *
 * 历史数据里可能存在旧写法，
 * 统一映射后再做隔离判断。
 */
const TOWN_ALIAS = {
  时村营乡: '时村营镇',
  路村营乡: '路村营镇',
  林坛镇: '社区',
  林坦镇: '社区',
  贾璧乡: '北贾璧乡',
}

/**
 * 标准化乡镇名。
 */
function normalizeTownName(town) {
  const text = String(town || '').trim()

  if (!text) {
    return ''
  }

  return TOWN_ALIAS[text] || text
}

/**
 * 从地址里提取乡镇 / 社区。
 *
 * 优先匹配“镇 / 乡”，
 * 都没有再判断“社区”。
 *
 * 例如：
 *
 *     邯郸市磁县磁州镇务本社区  ->  磁州镇
 *     邯郸市磁县某某社区        ->  社区
 */
function extractTown(text) {
  const value = String(text || '')

  if (!value) {
    return ''
  }

  for (const town of TOWN_NAMES) {
    if (value.includes(town)) {
      return town
    }
  }

  /**
   * 旧写法也要认。
   */
  const aliasKeys = Object.keys(
    TOWN_ALIAS,
  )

  for (const key of aliasKeys) {
    if (value.includes(key)) {
      return TOWN_ALIAS[key]
    }
  }

  if (value.includes('社区')) {
    return '社区'
  }

  return ''
}

/**
 * 判断某条青少年数据
 * 是否属于当前登录用户可见范围。
 *
 * 乡镇账号只能看到
 * 「归口单位」等于本账号所属乡镇的数据。
 *
 * 县级与管理员不受限制。
 *
 * @param {object} user   登录用户（req.user）
 * @param {object} youth  已归一化的青少年记录，
 *                         需包含 responsibleUnit 字段
 */
function canAccessYouth(user, youth) {
  if (!user) {
    return true
  }

  if (user.role !== 'town') {
    return true
  }

  const town =
    normalizeTownName(user.town)

  if (!town || town === '全部') {
    return true
  }

  /**
   * 归口单位直接比对，
   * 不再从户籍地 / 常住地文本里推断乡镇。
   *
   * 这样“社区”账号上传、户籍地却是
   * 其他乡镇的数据，也能正确归属到社区。
   */
  const unit =
    normalizeTownName(
      youth?.responsibleUnit ||
        youth?.归口单位 ||
        '',
    )

  if (!unit) {
    /**
     * 归口单位为空的数据
     * 只对管理员 / 县级可见，
     * 乡镇账号看不到，避免越权。
     */
    return false
  }

  return unit === town
}

/**
 * =========================================================
 * 回收站
 * =========================================================
 */
function recordDeletion({
  kind,
  tableKey,
  kindLabel,
  recordId,
  record,
  youthId,
  youthName,
  user,
}) {
  const list = readRecycleBin()

  list.unshift({
    id: crypto.randomUUID(),
    kind,

    /**
     * 后端表键名。
     *
     * 恢复时要靠它找到对应的 NocoDB 表。
     */
    tableKey:
      tableKey || kind,

    kindLabel: kindLabel || kind,
    recordId: String(recordId),
    record: record || {},
    youthId: youthId ? String(youthId) : '',
    youthName: youthName || '',
    deletedBy: user?.account || '',
    deletedByName: user?.name || '',
    deletedAt: new Date().toISOString(),
  })

  writeRecycleBin(list.slice(0, 1000))

  appendLog({
    user: user?.account || '',
    name: user?.name || '',
    action: '删除',
    target: `${kindLabel || kind} #${recordId}`,
    detail: youthName ? `所属：${youthName}` : '',
  })
}

function registerAuthRoutes(app, deps) {
  const {
    NOCODB_BASE_URL,
    TABLE_IDS,
    getHeaders,
  } = deps

  const ACCOUNT_TABLE =
    TABLE_IDS.accounts

  /**
   * 登录态中间件不再在这里注册。
   *
   * 原因：
   *     registerAuthRoutes() 在 server.js 里
   *     曾经排在全局守卫之前，
   *     导致 /api/auth/* 全部绕过守卫，
   *     弱口令账号登录后仍能直接调用
   *     账号管理这类高危接口。
   *
   * 现在由 server.js 统一在最前面注册 attachUser，
   * 保证 auth 路由和业务路由一样受守卫保护。
   */

  /* =======================================================
     登录
     POST /api/auth/login
     ======================================================= */
  app.post('/api/auth/login', async (req, res) => {
    const account = String(
      req.body?.account ?? '',
    ).trim()

    const password = String(
      req.body?.password ?? '',
    ).trim()

    if (!account || !password) {
      return res.status(400).json({
        success: false,
        message: '请输入账号和密码',
      })
    }

    try {
      const response = await fetch(
        NOCODB_BASE_URL +
          '/api/v2/tables/' +
          ACCOUNT_TABLE +
          '/records?limit=200',
        { headers: getHeaders() },
      )

      if (!response.ok) {
        return res.status(500).json({
          success: false,
          message: '账号表读取失败',
        })
      }

      const data = await response.json()
      const list = data?.list || []

      const found = list.find(
        (item) =>
          String(item['账号'] || '').trim() ===
          account,
      )

      if (!found) {
        return res.status(401).json({
          success: false,
          message: '账号不存在',
        })
      }

      const storedPassword = String(
        found['密码'] || '',
      )

      /**
       * 密码校验。
       *
       * 库里可能是历史明文，
       * 也可能是新的 scrypt 哈希，
       * 两种都支持。
       */
      if (
        !security.verifyPassword(
          password,
          storedPassword,
        )
      ) {
        return res.status(401).json({
          success: false,
          message: '密码错误',
        })
      }

      /**
       * 登录成功后，
       * 把明文密码自动升级成哈希，
       * 以后数据库里不再有明文口令。
       *
       * 升级失败也不影响本次登录。
       */
      if (
        !security.isHashed(
          storedPassword,
        )
      ) {
        try {
          await fetch(
            NOCODB_BASE_URL +
              '/api/v2/tables/' +
              ACCOUNT_TABLE +
              '/records',
            {
              method: 'PATCH',
              headers: getHeaders(),
              body: JSON.stringify([
                {
                  Id: Number(found['Id']),
                  密码:
                    security.hashPassword(
                      password,
                    ),
                },
              ]),
            },
          )
        } catch {
          /* 升级失败不影响登录 */
        }
      }

      if (
        String(found['状态'] || '').trim() ===
        '停用'
      ) {
        return res.status(403).json({
          success: false,
          message: '该账号已停用',
        })
      }

      const user = {
        id: found['Id'],
        account: String(found['账号'] || ''),
        name: String(found['姓名'] || ''),
        role: String(found['角色'] || 'town'),
        town: normalizeTownName(
          found['乡镇'],
        ),
      }

      /**
       * 弱口令检测。
       *
       * 这里是唯一能拿到用户明文密码的时机，
       * 所以直接在登录时判断：
       *
       *     密码不符合强度要求 -> 允许登录，
       *     但会话打上 mustChangePassword 标记。
       *
       * 之后所有业务接口都会被全局守卫拦下，
       * 只能先改密码才能继续使用。
       *
       * 这样做的好处是不用改数据库表结构
       * （NocoDB 加字段要重建元数据，风险大），
       * 现有 admin123 / county123 / town123
       * 这类历史弱口令会自动被标记，
       * 改完强密码后下次登录即恢复正常。
       */
      const weakReason =
        validatePassword(password, {
          account: user.account,
        })

      const mustChangePassword =
        Boolean(weakReason)

      const token = createSession(user, {
        mustChangePassword,
      })

      appendLog({
        user: user.account,
        name: user.name,
        action: '登录',
        target: '-',
      })

      return res.json({
        success: true,
        message: '登录成功',
        token,
        mustChangePassword,
        weakReason: weakReason || '',
        user: {
          ...user,
          mustChangePassword,
          roleLabel:
            ROLE_LABEL[user.role] || user.role,
        },
      })
    } catch (error) {
      console.error('登录失败：', error)

      return res.status(500).json({
        success: false,
        message: '登录失败：' + error.message,
      })
    }
  })

  /* =======================================================
     退出登录
     POST /api/auth/logout
     ======================================================= */
  app.post('/api/auth/logout', (req, res) => {
    if (req.user) {
      appendLog({
        user: req.user.account,
        name: req.user.name,
        action: '退出登录',
        target: '-',
      })
    }

    destroySession(req.token)

    return res.json({
      success: true,
      message: '已退出登录',
    })
  })

  /* =======================================================
     当前登录信息
     GET /api/auth/session
     ======================================================= */
  app.get('/api/auth/session', (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未登录',
      })
    }

    return res.json({
      success: true,
      mustChangePassword: Boolean(
        req.user.mustChangePassword,
      ),
      user: {
        ...req.user,
        roleLabel:
          ROLE_LABEL[req.user.role] ||
          req.user.role,
      },
    })
  })

  /* =======================================================
     修改自己的密码
     POST /api/auth/change-password
     =======================================================

     入参：
         oldPassword   原密码
         newPassword   新密码

     规则：
         1. 必须登录
         2. 原密码必须正确
         3. 新密码必须满足强度要求
         4. 新密码不能和原密码相同
         5. 改完清除会话标记，无需重新登录

     这个接口是「弱口令登录后唯一被放行」的业务接口，
     否则弱口令账号会被全局守卫锁死在系统外面。
     ======================================================= */
  app.post(
    '/api/auth/change-password',
    async (req, res) => {
      const user = req.user

      if (!user) {
        return res.status(401).json({
          success: false,
          message: '请先登录',
        })
      }

      const oldPassword = String(
        req.body?.oldPassword ?? '',
      ).trim()

      const newPassword = String(
        req.body?.newPassword ?? '',
      )

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message:
            '请填写原密码和新密码',
        })
      }

      /**
       * 新密码强度校验。
       */
      const reason = validatePassword(
        newPassword,
        {
          required: true,
          account: user.account,
        },
      )

      if (reason) {
        return res.status(400).json({
          success: false,
          message: reason,
        })
      }

      if (oldPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message:
            '新密码不能和原密码相同',
        })
      }

      try {
        const response =
          await fetch(
            NOCODB_BASE_URL +
              '/api/v2/tables/' +
              ACCOUNT_TABLE +
              '/records?limit=200',
            { headers: getHeaders() },
          )

        if (!response.ok) {
          return res.status(500).json({
            success: false,
            message: '账号表读取失败',
          })
        }

        const data = await response.json()

        const found = (
          data?.list || []
        ).find(
          (item) =>
            String(
              item['账号'] || '',
            ).trim() ===
            String(
              user.account || '',
            ).trim(),
        )

        if (!found) {
          return res.status(404).json({
            success: false,
            message: '账号不存在',
          })
        }

        /**
         * 原密码必须正确，
         * 防止别人拿到已登录的浏览器改密码。
         */
        if (
          !security.verifyPassword(
            oldPassword,
            String(found['密码'] || ''),
          )
        ) {
          return res.status(400).json({
            success: false,
            message: '原密码不正确',
          })
        }

        const patchResponse =
          await fetch(
            NOCODB_BASE_URL +
              '/api/v2/tables/' +
              ACCOUNT_TABLE +
              '/records',
            {
              method: 'PATCH',
              headers: getHeaders(),
              body: JSON.stringify([
                {
                  Id: Number(found['Id']),
                  密码:
                    security.hashPassword(
                      newPassword,
                    ),
                },
              ]),
            },
          )

        if (!patchResponse.ok) {
          const text =
            await patchResponse.text()

          console.error(
            '修改密码失败：',
            patchResponse.status,
            text,
          )

          return res.status(500).json({
            success: false,
            message: '密码保存失败',
          })
        }

        /**
         * 改密成功，解除本次会话的锁定状态。
         */
        clearMustChangePassword(
          req.token,
        )

        appendLog({
          user: user.account,
          name: user.name,
          action: '修改密码',
          target: '-',
        })

        return res.json({
          success: true,
          message: '密码修改成功',
        })
      } catch (error) {
        console.error(
          '修改密码失败：',
          error,
        )

        return res.status(500).json({
          success: false,
          message: '修改密码失败',
        })
      }
    },
  )

  /* =======================================================
     账号列表（管理员）
     GET /api/auth/accounts
     ======================================================= */
  app.get(
    '/api/auth/accounts',
    requireRole('admin'),
    async (req, res) => {
      try {
        const response = await fetch(
          NOCODB_BASE_URL +
            '/api/v2/tables/' +
            ACCOUNT_TABLE +
            '/records?limit=200',
          { headers: getHeaders() },
        )

        const data = await response.json()
        const list = data?.list || []

        return res.json({
          success: true,
          records: list.map((item) => {
            const rawPassword =
              String(item['密码'] || '')

            return {
            id: item['Id'],
            account: item['账号'] || '',
            name: item['姓名'] || '',

            /**
             * 密码已经哈希过的账号，
             * 不再把哈希串返回给前端，
             * 避免被编辑后“把哈希再哈希一次”
             * 导致账号无法登录。
             *
             * 管理员留空即表示不修改密码。
             */
            password: security.isHashed(
              rawPassword,
            )
              ? ''
              : rawPassword,
            role: item['角色'] || '',
            roleLabel:
              ROLE_LABEL[item['角色']] ||
              item['角色'] ||
              '',
            town: item['乡镇'] || '',
            status: item['状态'] || '启用',
            }
          }),
        })
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: '读取账号失败',
        })
      }
    },
  )

  /* =======================================================
     新增账号（管理员）
     POST /api/auth/accounts
     ======================================================= */
  app.post(
    '/api/auth/accounts',
    requireRole('admin'),
    async (req, res) => {
      const body = req.body ?? {}

      const account = String(
        body.account ?? '',
      ).trim()

      if (!account) {
        return res.status(400).json({
          success: false,
          message: '请填写账号',
        })
      }

      /**
       * =====================================================
       * 密码强度校验（新增）
       * =====================================================
       *
       * 以前这里写的是
       *
       *     密码: hashPassword(body.password || '123456')
       *
       * 管理员建账号时如果不填密码，
       * 系统就默默给一个 **123456**，
       * 而且不告诉任何人。
       *
       * 乡镇账号一旦是 123456，
       * 等于全县台账对任何猜到账号名的人敞开。
       *
       * 现在：密码必填、且必须满足强度要求。
       */
      const passwordError =
        validatePassword(
          body.password,
          { required: true },
        )

      if (passwordError) {
        return res.status(400).json({
          success: false,
          message: passwordError,
        })
      }

      try {
        const response = await fetch(
          NOCODB_BASE_URL +
            '/api/v2/tables/' +
            ACCOUNT_TABLE +
            '/records',
          {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              Title: account,
              账号: account,
              姓名: body.name || account,
              /**
               * 新账号的密码直接以哈希形式落库，
               * 数据库里不再出现明文口令。
               *
               * 已通过上面的强度校验，
               * 不再有 123456 这种默认口令。
               */
              密码: security.hashPassword(
                body.password,
              ),
              角色: body.role || 'town',
              乡镇:
                body.role === 'town'
                  ? body.town || ''
                  : '全部',
              状态: body.status || '启用',
            }),
          },
        )

        if (!response.ok) {
          const text = await response.text()

          return res.status(500).json({
            success: false,
            message:
              '新增账号失败：' +
              text.slice(0, 200),
          })
        }

        appendLog({
          user: req.user.account,
          name: req.user.name,
          action: '新增账号',
          target: account,
        })

        return res.json({
          success: true,
          message: '账号新增成功',
        })
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: error.message,
        })
      }
    },
  )

  /* =======================================================
     修改账号（管理员）
     PUT /api/auth/accounts/:id
     ======================================================= */
  app.put(
    '/api/auth/accounts/:id',
    requireRole('admin'),
    async (req, res) => {
      const id = String(req.params.id ?? '')
      const body = req.body ?? {}

      const fields = { Id: Number(id) }

      if (body.name !== undefined) {
        fields['姓名'] = body.name
      }

      /**
       * 密码留空表示不修改。
       *
       * 非空则加密后写入。
       */
      if (
        body.password !== undefined &&
        String(body.password).trim() !== ''
      ) {
        /**
         * 改密码时同样过一遍强度校验
         * （不填密码表示保持原密码不变，这种情况不校验）。
         */
        const updateError =
          validatePassword(
            body.password,
            {
              account:
                body.account || '',
            },
          )

        if (updateError) {
          return res
            .status(400)
            .json({
              success: false,
              message: updateError,
            })
        }

        fields['密码'] =
          security.hashPassword(
            body.password,
          )
      }

      if (body.role !== undefined) {
        fields['角色'] = body.role
        fields['乡镇'] =
          body.role === 'town'
            ? body.town || ''
            : '全部'
      }

      if (body.town !== undefined) {
        fields['乡镇'] = body.town
      }

      if (body.status !== undefined) {
        fields['状态'] = body.status
      }

      try {
        const response = await fetch(
          NOCODB_BASE_URL +
            '/api/v2/tables/' +
            ACCOUNT_TABLE +
            '/records',
          {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify([fields]),
          },
        )

        if (!response.ok) {
          const text = await response.text()

          return res.status(500).json({
            success: false,
            message:
              '修改账号失败：' +
              text.slice(0, 200),
          })
        }

        appendLog({
          user: req.user.account,
          name: req.user.name,
          action: '修改账号',
          target: '#' + id,
        })

        return res.json({
          success: true,
          message: '账号修改成功',
        })
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: error.message,
        })
      }
    },
  )

  /* =======================================================
     删除账号（管理员）
     DELETE /api/auth/accounts/:id
     ======================================================= */
  app.delete(
    '/api/auth/accounts/:id',
    requireRole('admin'),
    async (req, res) => {
      const id = String(req.params.id ?? '')

      try {
        const response = await fetch(
          NOCODB_BASE_URL +
            '/api/v2/tables/' +
            ACCOUNT_TABLE +
            '/records',
          {
            method: 'DELETE',
            headers: getHeaders(),
            body: JSON.stringify([
              { Id: Number(id) },
            ]),
          },
        )

        if (!response.ok) {
          return res.status(500).json({
            success: false,
            message: '删除账号失败',
          })
        }

        appendLog({
          user: req.user.account,
          name: req.user.name,
          action: '删除账号',
          target: '#' + id,
        })

        return res.json({
          success: true,
          message: '账号删除成功',
        })
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: error.message,
        })
      }
    },
  )

  /* =======================================================
     回收站列表
     =======================================================
     管理员、县级都可以看，
     但只有管理员能恢复。
     ======================================================= */
  /**
   * 回收站里存的是被删除记录的**完整快照**（含姓名、住址等），
   * 之前只要求“已登录”，乡镇账号也能看到全县的删除记录。
   *
   * 现在收紧为县级及以上：
   *     县级 / 管理员：可查看
   *     管理员：可恢复
   *     乡镇：不可查看
   */
  app.get(
    '/api/system/recycle',
    requireRole('county'),
    (req, res) => {
      return res.json({
        success: true,
        canRestore: req.user.role === 'admin',
        records: readRecycleBin(),
      })
    },
  )

  /* =======================================================
     恢复已删除数据（仅管理员）
     POST /api/system/recycle/:id/restore
     ======================================================= */
  app.post(
    '/api/system/recycle/:id/restore',
    requireRole('admin'),
    async (req, res) => {
      const id = String(req.params.id ?? '')
      const list = readRecycleBin()

      const target = list.find(
        (item) => item.id === id,
      )

      if (!target) {
        return res.status(404).json({
          success: false,
          message: '未找到该删除记录',
        })
      }

      try {
        /**
         * 重新写回对应的业务表，
         * 并恢复与青少年的关联。
         */
        const tableId =
          TABLE_IDS[
            target.tableKey
          ] ||
          TABLE_IDS[target.kind]

        if (!tableId) {
          return res.status(400).json({
            success: false,
            message:
              '未知的数据类型，无法恢复',
          })
        }

        /**
         * 恢复时不能把系统字段一起写回去。
         *
         * NocoDB 会直接拒绝：
         *
         *     Column "CreatedAt" is auto generated
         *     and cannot be updated
         *
         * 因此这里只保留业务字段。
         */
        const SYSTEM_FIELDS =
          [
            'Id',
            'CreatedAt',
            'UpdatedAt',
          ]

        const payload = {}

        Object.entries(
          target.record
            ?.rawFields || {},
        ).forEach(
          ([key, value]) => {
            if (
              SYSTEM_FIELDS.includes(
                key,
              )
            ) {
              return
            }

            /**
             * 关联字段由下面的
             * “青少年基本信息表”单独处理。
             */
            if (
              key.startsWith(
                '_nc_',
              ) ||
              key ===
                '青少年基本信息表'
            ) {
              return
            }

            payload[key] =
              value
          },
        )

        /**
         * 恢复关联。
         */
        if (target.youthId) {
          payload['青少年基本信息表'] = {
            Id: Number(target.youthId),
          }
        }

        const response = await fetch(
          NOCODB_BASE_URL +
            '/api/v2/tables/' +
            tableId +
            '/records',
          {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
          },
        )

        if (!response.ok) {
          const text = await response.text()

          return res.status(500).json({
            success: false,
            message:
              '恢复失败：' + text.slice(0, 200),
          })
        }

        const next = list.filter(
          (item) => item.id !== id,
        )

        writeRecycleBin(next)

        /**
         * 清掉帮扶模块的缓存，
         * 否则前端重新查询时
         * 读到的还是删除前的旧缓存，
         * 看起来像“恢复没生效”。
         */
        try {
          const helpModule =
            require('./helpApi')

          if (
            typeof helpModule.clearHelpCacheAll ===
            'function'
          ) {
            helpModule.clearHelpCacheAll(
              target.kind,
            )
          }
        } catch {
          /* 缓存清不掉不影响恢复结果 */
        }

        appendLog({
          user: req.user.account,
          name: req.user.name,
          action: '恢复数据',
          target: `${target.kindLabel} #${target.recordId}`,
          detail:
            target.youthName || '',
        })

        return res.json({
          success: true,
          message: '数据已恢复',
        })
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: error.message,
        })
      }
    },
  )

  /* =======================================================
     彻底删除回收站记录（仅管理员）
     DELETE /api/system/recycle/:id
     ======================================================= */
  app.delete(
    '/api/system/recycle/:id',
    requireRole('admin'),
    (req, res) => {
      const id = String(req.params.id ?? '')
      const list = readRecycleBin()

      writeRecycleBin(
        list.filter((item) => item.id !== id),
      )

      return res.json({
        success: true,
        message: '已彻底删除',
      })
    },
  )

  /* =======================================================
     清空回收站（仅管理员）
     DELETE /api/system/recycle
     ======================================================= */
  app.delete(
    '/api/system/recycle',
    requireRole('admin'),
    (req, res) => {
      writeRecycleBin([])

      return res.json({
        success: true,
        message: '回收站已清空',
      })
    },
  )

  /* =======================================================
     操作日志
     GET /api/system/logs
     ======================================================= */
  /**
   * 操作日志同样只给县级及以上查看。
   */
  app.get(
    '/api/system/logs',
    requireRole('county'),
    (req, res) => {
      return res.json({
        success: true,
        records: readLogs(),
      })
    },
  )
}

module.exports = {
  registerAuthRoutes,
  attachUser,
  requireAuth,
  requireRole,
  recordDeletion,
  appendLog,
  canAccessYouth,
  matchTown,
  extractTown,
  normalizeTownName,
  TOWN_NAMES,
  ROLE_LEVEL,
  ROLE_LABEL,
}
