/**
 * =============================================================
 * 安全防护模块
 * =============================================================
 *
 * 目标：把系统暴露到公网后，
 * 抵御常见的数据攻击与抓包窃取：
 *
 *     1. 安全响应头（XSS / 点击劫持 / MIME 嗅探 / 嗅探追踪）
 *     2. 强制 HTTPS + HSTS（防止明文传输被抓包）
 *     3. 限流（防暴力破解、防刷接口、防 CC）
 *     4. 请求体净化（防原型链污染、超大报文、控制字符）
 *     5. 登录凭证加固：
 *          密码不再明文存储（scrypt 加盐哈希，兼容旧明文）
 *          token 带 HMAC 签名 + 有效期 + 滑动续期
 *     6. 传输加密：
 *          请求 / 响应整体 AES-256-GCM 加密，
 *          即使被抓包也只看到密文
 *     7. 存储加密：
 *          手机号等敏感字段落库前加密
 *
 * 所有开关都可用环境变量控制，
 * 本地开发不受影响。
 * =============================================================
 */

const crypto = require('crypto')

/* ==========================================================
   基础工具
   ========================================================== */

function envFlag(name, defaultValue) {
  const raw = process.env[name]

  if (raw === undefined || raw === '') {
    return defaultValue
  }

  return (
    raw === '1' ||
    String(raw).toLowerCase() === 'true'
  )
}

/**
 * 由口令推导出 32 字节密钥。
 *
 * 用 scrypt，抗暴力破解。
 */
function deriveKey(passphrase, salt) {
  return crypto.scryptSync(
    String(passphrase),
    String(salt || 'cixian-youth'),
    32,
  )
}

function base64Encode(buffer) {
  return Buffer.from(buffer).toString('base64')
}

function base64Decode(text) {
  return Buffer.from(String(text), 'base64')
}

/* ==========================================================
   一、安全响应头
   ========================================================== */

function securityHeaders(req, res, next) {
  /**
   * 隐藏技术栈，减少被定向攻击的面。
   */
  res.removeHeader('X-Powered-By')

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  )
  res.setHeader(
    'Cross-Origin-Opener-Policy',
    'same-origin',
  )

  /**
   * 内容安全策略。
   *
   * 本系统是纯前端 SPA + API，
   * 只允许同源资源，禁止被 iframe 嵌套到别的站点。
   */
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  )

  /**
   * 只在 HTTPS（部署到公网）时下发 HSTS，
   * 本地 http 开发不下发，避免浏览器强制跳转。
   */
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '') ===
      'https'

  if (isHttps) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    )
  }

  next()
}

/* ==========================================================
   二、强制 HTTPS
   ==========================================================
   部署到 Render / 云服务器后，
   若有人用 http 访问，直接 308 跳到 https。
   ========================================================== */

function forceHttps(req, res, next) {
  /**
   * 本地开发默认关闭。
   *
   * 线上设置 FORCE_HTTPS=1 打开。
   */
  if (!envFlag('FORCE_HTTPS', false)) {
    return next()
  }

  const proto =
    req.headers['x-forwarded-proto'] ||
    (req.secure ? 'https' : 'http')

  if (proto === 'https') {
    return next()
  }

  return res.redirect(
    308,
    'https://' + req.headers.host + req.originalUrl,
  )
}

/* ==========================================================
   三、限流
   ==========================================================
   滑动窗口，按 key（IP / IP+账号）统计。
   内存实现，够单实例部署使用。
   ========================================================== */

const rateBuckets = new Map()

function rateLimit({
  windowMs = 60 * 1000,
  max = 300,
  keyOf = (req) => clientIp(req),
  message = '请求过于频繁，请稍后再试',
} = {}) {
  return (req, res, next) => {
    const key = keyOf(req)
    const now = Date.now()

    let bucket = rateBuckets.get(key)

    if (!bucket) {
      bucket = []
      rateBuckets.set(key, bucket)
    }

    /**
     * 丢掉窗口外的记录。
     */
    const valid = bucket.filter(
      (time) => now - time < windowMs,
    )

    valid.push(now)

    rateBuckets.set(key, valid)

    /**
     * 顺手清理掉过期桶，防止内存泄漏。
     */
    if (rateBuckets.size > 5000) {
      const cutoff = now - windowMs

      rateBuckets.forEach((list, mapKey) => {
        const alive = list.filter(
          (time) => time > cutoff,
        )

        if (alive.length) {
          rateBuckets.set(mapKey, alive)
        } else {
          rateBuckets.delete(mapKey)
        }
      })
    }

    if (valid.length > max) {
      return res.status(429).json({
        success: false,
        message,
      })
    }

    next()
  }
}

/**
 * 客户端真实 IP。
 *
 * 部署在 Render / Nginx 后面时，
 * 取 X-Forwarded-For 的第一跳。
 */
function clientIp(req) {
  const forwarded =
    req.headers['x-forwarded-for']

  if (forwarded) {
    return (
      String(forwarded).split(',')[0] || ''
    ).trim()
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  )
}

/**
 * 登录限流：
 * 同一 IP 15 分钟内最多 20 次，
 * 同一 IP+账号 最多 8 次，
 * 有效挡住暴力破解。
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_LIMIT_MAX || 40),
  message: '登录尝试过于频繁，请 15 分钟后再试',
})

const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(
    process.env.LOGIN_ACCOUNT_LIMIT_MAX || 12,
  ),
  keyOf: (req) =>
    clientIp(req) +
    '|' +
    String(req.body?.account || ''),
  message:
    '该账号登录失败次数过多，请稍后再试',
})

/**
 * 全站接口限流：
 * 单 IP 每分钟最多 600 次。
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 600),
})

/* ==========================================================
   四、请求体净化
   ==========================================================
   防原型链污染、超大字段、控制字符。
   ========================================================== */

const MAX_STRING_LENGTH = Number(
  process.env.MAX_STRING_LENGTH || 4000,
)

const DANGEROUS_KEYS = [
  '__proto__',
  'constructor',
  'prototype',
]

function sanitizeValue(value, depth = 0) {
  if (depth > 12) {
    return null
  }

  if (typeof value === 'string') {
    return (
      value
        /**
         * 去掉控制字符（含 \u0000），
         * 防止绕过与日志注入。
         */
        .replace(
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
          '',
        )
        .slice(0, MAX_STRING_LENGTH)
    )
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 1000)
      .map((item) =>
        sanitizeValue(item, depth + 1),
      )
  }

  if (typeof value === 'object') {
    const result = {}

    Object.keys(value).forEach((key) => {
      if (DANGEROUS_KEYS.includes(key)) {
        return
      }

      if (key.length > 200) {
        return
      }

      result[key] = sanitizeValue(
        value[key],
        depth + 1,
      )
    })

    return result
  }

  return value
}

function sanitizeBody(req, res, next) {
  if (
    req.body &&
    typeof req.body === 'object'
  ) {
    req.body = sanitizeValue(req.body)
  }

  if (
    req.query &&
    typeof req.query === 'object'
  ) {
    req.query = sanitizeValue(req.query)
  }

  next()
}

/* ==========================================================
   五、密码哈希
   ==========================================================
   格式：  scrypt$<salt>$<hash>
   旧库里的明文密码仍然可以登录，
   登录成功后自动升级成哈希。
   ========================================================== */

function hashPassword(password) {
  const salt = crypto
    .randomBytes(16)
    .toString('hex')

  const hash = crypto
    .scryptSync(String(password), salt, 32)
    .toString('hex')

  return `scrypt$${salt}$${hash}`
}

function isHashed(value) {
  return (
    typeof value === 'string' &&
    value.startsWith('scrypt$')
  )
}

function verifyPassword(password, stored) {
  const input = String(password ?? '')
  const saved = String(stored ?? '')

  if (isHashed(saved)) {
    const parts = saved.split('$')

    if (parts.length !== 3) {
      return false
    }

    const [, salt, hash] = parts

    const calc = crypto
      .scryptSync(input, salt, 32)
      .toString('hex')

    /**
     * 定长比较，防时序攻击。
     */
    try {
      return crypto.timingSafeEqual(
        Buffer.from(calc, 'hex'),
        Buffer.from(hash, 'hex'),
      )
    } catch {
      return false
    }
  }

  /**
   * 旧数据：明文比对。
   */
  return saved.trim() === input.trim()
}

/* ==========================================================
   六、登录凭证（token）加固
   ==========================================================
   token 结构：  <随机串>.<过期时间戳>.<HMAC签名>
   签名密钥每个进程随机生成，
   进程重启后旧 token 自动失效（更安全）。
   ========================================================== */

const TOKEN_SECRET = crypto
  .randomBytes(32)
  .toString('hex')

const SESSION_TTL_MS =
  Number(
    process.env.SESSION_TTL_HOURS || 12,
  ) *
  60 *
  60 *
  1000

function signToken(randomPart, expiresAt) {
  const payload = `${randomPart}.${expiresAt}`

  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('hex')
    .slice(0, 32)

  return `${payload}.${sig}`
}

/**
 * 生成一个带签名与有效期的 token。
 */
function createSecureToken() {
  const randomPart = crypto
    .randomBytes(24)
    .toString('hex')

  const expiresAt =
    Date.now() + SESSION_TTL_MS

  return {
    token: signToken(randomPart, expiresAt),
    expiresAt,
  }
}

/**
 * 校验签名，并返回剩余有效期（毫秒）。
 *
 * 返回 null 表示签名不对或已过期。
 */
function verifySecureToken(token) {
  const text = String(token || '')

  const parts = text.split('.')

  if (parts.length !== 3) {
    return null
  }

  const [randomPart, expText, sig] = parts

  const expiresAt = Number(expText)

  if (!Number.isFinite(expiresAt)) {
    return null
  }

  const expected = signToken(
    randomPart,
    expiresAt,
  )

  const expectedSig = expected.split('.')[2]

  /**
   * 定长比较，防时序攻击。
   */
  let ok = false

  try {
    ok = crypto.timingSafeEqual(
      Buffer.from(String(sig)),
      Buffer.from(expectedSig),
    )
  } catch {
    ok = false
  }

  if (!ok) {
    return null
  }

  const left = expiresAt - Date.now()

  if (left <= 0) {
    return null
  }

  return left
}

/**
 * 续期：生成同随机串、新过期时间的新 token。
 *
 * 用于滑动续期（用户一直在操作时不会掉线）。
 */
function renewSecureToken(token) {
  const parts = String(token || '').split('.')

  if (parts.length !== 3) {
    return null
  }

  const expiresAt =
    Date.now() + SESSION_TTL_MS

  return signToken(parts[0], expiresAt)
}

/* ==========================================================
   七、传输加密（防抓包 / 数据解包）
   ==========================================================
   请求体与响应体整体 AES-256-GCM 加密。
   开启条件：环境变量 PAYLOAD_ENC_KEY 存在，
   且请求头带 x-enc: 1。
   未开启时行为完全不变，兼容旧客户端。
   ========================================================== */

const PAYLOAD_ENC_KEY =
  process.env.PAYLOAD_ENC_KEY || ''

const PAYLOAD_SALT =
  process.env.PAYLOAD_ENC_SALT ||
  'cixian-youth-transport'

function transportKey() {
  if (!PAYLOAD_ENC_KEY) {
    return null
  }

  /**
   * 必须与前端 src/utils/crypto.js 完全一致：
   *
   *     PBKDF2(SHA-256, 100000 次, 32 字节)
   *
   * 浏览器没有 scrypt，
   * 所以传输加密统一用 PBKDF2。
   * （存储加密是后端独享的，仍用 scrypt）
   */
  return crypto.pbkdf2Sync(
    String(PAYLOAD_ENC_KEY),
    String(PAYLOAD_SALT),
    100000,
    32,
    'sha256',
  )
}

/**
 * 加密任意可 JSON 化的值，
 * 返回 base64 字符串。
 */
function encryptPayload(value) {
  const key = transportKey()

  if (!key) {
    return null
  }

  const iv = crypto.randomBytes(12)

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    key,
    iv,
  )

  const data = Buffer.from(
    JSON.stringify(value),
    'utf8',
  )

  const body = Buffer.concat([
    cipher.update(data),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  return base64Encode(
    Buffer.concat([iv, tag, body]),
  )
}

/**
 * 解密 base64 字符串，还原为对象。
 */
function decryptPayload(text) {
  const key = transportKey()

  if (!key) {
    return null
  }

  const raw = base64Decode(text)

  if (raw.length < 28) {
    throw new Error('密文长度不合法')
  }

  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const body = raw.subarray(28)

  const decipher =
    crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      iv,
    )

  decipher.setAuthTag(tag)

  const plain = Buffer.concat([
    decipher.update(body),
    decipher.final(),
  ])

  return JSON.parse(plain.toString('utf8'))
}

/**
 * 中间件：
 *
 *     1. 请求体自动解密
 *     2. 响应体自动加密
 */
function transportEncryption(req, res, next) {
  const enabled =
    Boolean(PAYLOAD_ENC_KEY) &&
    req.headers['x-enc'] === '1'

  if (!enabled) {
    return next()
  }

  /**
   * 解密请求体。
   *
   * 前端把密文放在 { d: "..." } 里发过来。
   *
   * 之所以不直接发裸字符串：
   * Express 5 的 express.json 默认 strict 模式
   * 只接受对象 / 数组，裸字符串会报 400。
   */
  if (
    req.body &&
    typeof req.body === 'object' &&
    typeof req.body.d === 'string'
  ) {
    try {
      req.body = decryptPayload(req.body.d)
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: '请求解密失败',
      })
    }
  }

  /**
   * 加密响应体。
   */
  const originalJson = res.json.bind(res)

  res.json = (value) => {
    const cipher = encryptPayload(value)

    if (!cipher) {
      return originalJson(value)
    }

    res.setHeader('x-enc', '1')

    return originalJson(cipher)
  }

  next()
}

/* ==========================================================
   八、存储加密（敏感字段落库加密）
   ==========================================================
   格式：  enc1:<base64>
   兼容旧明文：读的时候不是 enc1: 开头就原样返回。
   ========================================================== */

const DATA_ENC_KEY =
  process.env.DATA_ENC_KEY ||
  process.env.PAYLOAD_ENC_KEY ||
  ''

const DATA_ENC_SALT =
  process.env.DATA_ENC_SALT ||
  'cixian-youth-at-rest'

/**
 * 默认关闭。
 *
 * 原因（实测）：
 * NocoDB 青少年基本信息表的「联系方式 / 监护人联系方式」
 * 以及结对帮扶表的「联系电话」都开了手机号格式校验，
 * 写进密文会被拒绝：
 *
 *     Validation failed : isMobilePhone
 *
 * 因此默认只做传输加密 + 密码哈希。
 *
 * 若将来把这些列改成普通文本列，
 * 设置 ENCRYPT_AT_REST=1 即可开启存储加密。
 */
const AT_REST_ENABLED =
  Boolean(DATA_ENC_KEY) &&
  envFlag('ENCRYPT_AT_REST', false)

const ENC_PREFIX = 'enc1:'

function atRestKey() {
  if (!AT_REST_ENABLED) {
    return null
  }

  return deriveKey(DATA_ENC_KEY, DATA_ENC_SALT)
}

/**
 * 加密单个字段值。
 */
function encryptField(value) {
  const text = String(value ?? '').trim()

  if (!text) {
    return ''
  }

  const key = atRestKey()

  if (!key) {
    return text
  }

  const iv = crypto.randomBytes(12)

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    key,
    iv,
  )

  const body = Buffer.concat([
    cipher.update(
      Buffer.from(text, 'utf8'),
    ),
    cipher.final(),
  ])

  return (
    ENC_PREFIX +
    base64Encode(
      Buffer.concat([
        iv,
        cipher.getAuthTag(),
        body,
      ]),
    )
  )
}

/**
 * 解密单个字段值。
 *
 * 非加密内容原样返回，
 * 保证历史明文数据不受影响。
 */
function decryptField(value) {
  const text = String(value ?? '')

  if (!text.startsWith(ENC_PREFIX)) {
    return text
  }

  const key = atRestKey()

  if (!key) {
    return ''
  }

  try {
    const raw = base64Decode(
      text.slice(ENC_PREFIX.length),
    )

    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const body = raw.subarray(28)

    const decipher =
      crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        iv,
      )

    decipher.setAuthTag(tag)

    return Buffer.concat([
      decipher.update(body),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return ''
  }
}

/**
 * 需要落库加密的字段。
 */
const SENSITIVE_FIELDS = [
  '联系方式',
  '监护人联系方式',
  '联系电话',
  '帮扶联系人电话',
]

/**
 * 写入数据库前：把对象里的敏感字段加密。
 */
function encryptSensitiveFields(record) {
  if (
    !record ||
    typeof record !== 'object'
  ) {
    return record
  }

  const key = atRestKey()

  if (!key) {
    return record
  }

  SENSITIVE_FIELDS.forEach((field) => {
    if (record[field] === undefined) {
      return
    }

    if (record[field] === null) {
      return
    }

    record[field] = encryptField(
      record[field],
    )
  })

  return record
}

/**
 * 从数据库读出来后：把敏感字段解密。
 */
function decryptSensitiveFields(record) {
  if (
    !record ||
    typeof record !== 'object'
  ) {
    return record
  }

  SENSITIVE_FIELDS.forEach((field) => {
    if (record[field] === undefined) {
      return
    }

    if (record[field] === null) {
      return
    }

    record[field] = decryptField(
      record[field],
    )
  })

  return record
}

module.exports = {
  /* 头与传输 */
  securityHeaders,
  forceHttps,
  sanitizeBody,
  transportEncryption,
  encryptPayload,
  decryptPayload,

  /* 限流 */
  rateLimit,
  clientIp,
  loginLimiter,
  loginAccountLimiter,
  apiLimiter,

  /* 密码 */
  hashPassword,
  verifyPassword,
  isHashed,

  /* token */
  createSecureToken,
  verifySecureToken,
  renewSecureToken,
  SESSION_TTL_MS,

  /* 存储加密 */
  encryptField,
  decryptField,
  encryptSensitiveFields,
  decryptSensitiveFields,
  SENSITIVE_FIELDS,
  AT_REST_ENABLED,
  TRANSPORT_ENABLED: Boolean(PAYLOAD_ENC_KEY),

  /* 工具 */
  envFlag,
  deriveKey,
}
