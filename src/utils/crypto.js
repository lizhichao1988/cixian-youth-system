/**
 * ============================================================
 * 前端传输加密
 * ============================================================
 *
 * 与后端 backend/security.js 配套：
 *
 *     请求体：明文 JSON  ->  AES-256-GCM  ->  base64
 *     响应体：base64     ->  AES-256-GCM  ->  明文 JSON
 *
 * 报文格式（与后端完全一致）：
 *
 *     base64( IV(12字节) + 认证标签(16字节) + 密文 )
 *
 * 开启条件：
 *
 *     1. 构建时配置了 VITE_PAYLOAD_ENC_KEY
 *     2. 浏览器支持 crypto.subtle（https 或 localhost）
 *
 * 未开启时行为与原来完全一致，不会报错。
 *
 * 说明：
 * 前端是公开可下载的 JS，密钥无法做到绝对保密，
 * 这里的目的是让“随手抓包”看不到明文数据，
 * 真正的传输安全仍由 HTTPS 保证。
 * ============================================================
 */

const ENC_KEY =
  import.meta.env.VITE_PAYLOAD_ENC_KEY || ''

const ENC_SALT =
  import.meta.env.VITE_PAYLOAD_ENC_SALT ||
  'cixian-youth-transport'

/**
 * 浏览器是否支持 Web Crypto。
 *
 * http 非 localhost 环境下 crypto.subtle 不可用，
 * 此时自动降级为明文（由 HTTPS 兜底）。
 */
const SUBTLE =
  typeof globalThis.crypto !==
    'undefined' &&
  globalThis.crypto.subtle
    ? globalThis.crypto.subtle
    : null

export const TRANSPORT_ENCRYPTION_ENABLED =
  Boolean(ENC_KEY) && Boolean(SUBTLE)

/* ==========================================================
   编码工具
   ========================================================== */

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)

  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

function fromBase64(text) {
  const binary = atob(String(text))

  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

/* ==========================================================
   密钥派生
   ==========================================================
   与后端 scrypt 不同，浏览器端用 PBKDF2：
   只要两端最终得到同一把 32 字节密钥即可，
   而密钥本身由环境变量提供（已足够随机），
   因此这里只做一次标准派生。
   ========================================================== */

let cachedKey = null

async function getKey() {
  if (cachedKey) {
    return cachedKey
  }

  const material =
    await SUBTLE.importKey(
      'raw',
      new TextEncoder().encode(ENC_KEY),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey'],
    )

  cachedKey = await SUBTLE.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(
        ENC_SALT,
      ),
      iterations: 100000,
      hash: 'SHA-256',
    },
    material,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )

  return cachedKey
}

/**
 * 加密一段明文字符串，
 * 返回 base64 密文。
 */
export async function encryptString(
  plainText,
) {
  if (!TRANSPORT_ENCRYPTION_ENABLED) {
    return plainText
  }

  const key = await getKey()

  const iv = globalThis.crypto.getRandomValues(
    new Uint8Array(12),
  )

  const cipherBuffer =
    await SUBTLE.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128,
      },
      key,
      new TextEncoder().encode(plainText),
    )

  /**
   * Web Crypto 把认证标签拼在密文尾部，
   * 这里拆出来，按后端的顺序重新组装：
   *
   *     IV + TAG + 密文
   */
  const cipher = new Uint8Array(cipherBuffer)

  const body = cipher.subarray(
    0,
    cipher.length - 16,
  )

  const tag = cipher.subarray(
    cipher.length - 16,
  )

  const combined = new Uint8Array(
    12 + 16 + body.length,
  )

  combined.set(iv, 0)
  combined.set(tag, 12)
  combined.set(body, 28)

  return toBase64(combined)
}

/**
 * 解密 base64 密文，还原明文字符串。
 */
export async function decryptString(
  cipherText,
) {
  if (!TRANSPORT_ENCRYPTION_ENABLED) {
    return cipherText
  }

  const raw = fromBase64(cipherText)

  if (raw.length < 28) {
    throw new Error('密文长度不合法')
  }

  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const body = raw.subarray(28)

  /**
   * 后端输出的顺序是 IV + TAG + 密文，
   * Web Crypto 需要的是“密文 + TAG”，
   * 这里重新拼回去。
   */
  const cipher = new Uint8Array(
    body.length + 16,
  )

  cipher.set(body, 0)
  cipher.set(tag, body.length)

  const key = await getKey()

  const plainBuffer =
    await SUBTLE.decrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128,
      },
      key,
      cipher,
    )

  return new TextDecoder().decode(
    plainBuffer,
  )
}

/**
 * 把请求体加密成 { d: "密文" }。
 *
 * 不能直接发裸字符串：
 * Express 5 的 express.json 默认 strict 模式
 * 只接受对象 / 数组，裸字符串会被判为 400。
 */
export async function encryptRequestBody(
  bodyText,
) {
  const cipher = await encryptString(
    bodyText,
  )

  return JSON.stringify({ d: cipher })
}

/**
 * 把响应体解密成对象。
 */
export async function decryptResponseData(
  cipherText,
) {
  const plain = await decryptString(
    cipherText,
  )

  return JSON.parse(plain)
}
