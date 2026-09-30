/**
 * =========================================================
 * 生成安全密钥
 * =========================================================
 *
 * 生成两把随机密钥并写入环境变量文件：
 *
 *   PAYLOAD_ENC_KEY  传输加密（前后端共用）
 *                    同时写入 backend/.env 与根目录 .env
 *                    根目录那份供 Vite 打包时使用：
 *                    VITE_PAYLOAD_ENC_KEY
 *
 *   DATA_ENC_KEY     存储加密（仅后端）
 *
 * 用法：
 *
 *     node scripts/gen-keys.mjs
 *
 * 已经存在同名配置时不会覆盖，
 * 避免把历史加密数据变成读不出来的乱码。
 * =========================================================
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
)

const BACKEND_ENV = path.join(
  ROOT,
  'backend',
  '.env',
)

const FRONTEND_ENV = path.join(ROOT, '.env')

function readLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return []
  }

  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
}

function hasKey(lines, key) {
  return lines.some((line) =>
    line
      .trim()
      .startsWith(key + '='),
  )
}

function appendLines(filePath, lines) {
  const existing =
    readLines(filePath)

  const text =
    existing.length &&
    existing[existing.length - 1] !== ''
      ? '\n' + lines.join('\n') + '\n'
      : lines.join('\n') + '\n'

  fs.appendFileSync(filePath, text, 'utf8')
}

const payloadKey = crypto
  .randomBytes(32)
  .toString('base64')

const dataKey = crypto
  .randomBytes(32)
  .toString('base64')

const backendLines = readLines(BACKEND_ENV)

const additions = []

if (!hasKey(backendLines, 'PAYLOAD_ENC_KEY')) {
  additions.push(
    'PAYLOAD_ENC_KEY=' + payloadKey,
  )
} else {
  console.log(
    'PAYLOAD_ENC_KEY 已存在，保持原值',
  )
}

if (!hasKey(backendLines, 'DATA_ENC_KEY')) {
  additions.push('DATA_ENC_KEY=' + dataKey)
} else {
  console.log(
    'DATA_ENC_KEY 已存在，保持原值',
  )
}

if (additions.length) {
  appendLines(BACKEND_ENV, additions)
  console.log(
    '已写入 backend/.env：',
    additions
      .map((line) => line.split('=')[0])
      .join(', '),
  )
}

/**
 * 前端只需要传输加密的那一把。
 *
 * 注意变量名必须带 VITE_ 前缀，
 * 否则 Vite 不会把它打进前端包。
 */
const frontendLines =
  readLines(FRONTEND_ENV)

if (
  !hasKey(frontendLines, 'VITE_PAYLOAD_ENC_KEY')
) {
  /**
   * 和后端保持一致：
   * 若后端已经有值（本次没生成新的），
   * 就把后端那份复制过来。
   */
  const backendPayload =
    readLines(BACKEND_ENV).find((line) =>
      line
        .trim()
        .startsWith('PAYLOAD_ENC_KEY='),
    ) || ''

  /**
   * 不能用 split('=')：
   * base64 里本身就含有 '=' 填充符，
   * 会被截断导致前后端密钥不一致。
   */
  const matched =
    backendPayload.match(
      /^PAYLOAD_ENC_KEY=(.*)$/,
    )

  const value =
    matched?.[1] || payloadKey

  appendLines(FRONTEND_ENV, [
    'VITE_PAYLOAD_ENC_KEY=' + value,
  ])

  console.log(
    '已写入 .env：VITE_PAYLOAD_ENC_KEY',
  )
} else {
  console.log(
    'VITE_PAYLOAD_ENC_KEY 已存在，保持原值',
  )
}

console.log('\n完成。')
