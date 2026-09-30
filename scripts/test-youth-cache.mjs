/**
 * 前端内存青少年缓存 —— 单元测试（不依赖网络 / NocoDB）
 *
 * 验证用户提出的两条诉求的核心逻辑：
 *   1. 新增人员立刻进内存缓存，帮扶管理页可直接读取；
 *   2. 支持多个人（字典结构），合并去重正确；
 *   3. 刚新增的人员可被“待展示”标记消费，进入帮扶页自动选中。
 *
 * 运行：
 *   node scripts/test-youth-cache.mjs
 */

import {
  cacheYouth,
  getCachedYouth,
  removeCachedYouth,
  syncYouthCache,
  mergeYouthCache,
  setPendingShowYouth,
  consumePendingShowYouth,
  clearYouthCache,
} from '../src/store/youthCache.js'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(
    `${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`,
  )
}

function makeYouth(id, over = {}) {
  return {
    key: String(id),
    name: `人员${id}`,
    gender: '男',
    household: '邯郸市磁县讲武城镇',
    responsibleUnit: '讲武城镇',
    helpRequired: '是',
    bigCategory: '常态关爱类',
    categories: '助学',
    pairing: '是',
    pairingContact: '李老师',
    pairingPhone: '13700000000',
    pairingUnit: '讲武城镇中学',
    remark: '',
    ...over,
  }
}

clearYouthCache()

// 1. 新增一条立刻可查
cacheYouth(makeYouth(1269))
check(
  '缓存新增后可查',
  getCachedYouth(1269)?.name === '人员1269',
  `name=${getCachedYouth(1269)?.name}`,
)

// 2. 多个人（字典）
cacheYouth(makeYouth(1270))
cacheYouth(makeYouth(1271))
check(
  '支持多个人',
  getCachedYouth(1270) && getCachedYouth(1271),
  '1270/1271 均在缓存',
)

// 3. 合并：缓存里的新人补进列表
const serverList = [makeYouth(1), makeYouth(2)]
const merged = mergeYouthCache(serverList)
const hasNew = merged.some((y) => y.key === '1269')
check(
  'mergeYouthCache 把刚新增补进列表',
  hasNew && merged.length === 5,
  `列表长度=${merged.length}`,
)

// 4. 合并去重：缓存覆盖旧数据（同一 ID）
cacheYouth(makeYouth(1, { name: '服务器最新名' }))
const merged2 = mergeYouthCache(serverList)
const updated = merged2.find((y) => y.key === '1')
check(
  'mergeYouthCache 去重且缓存覆盖',
  updated?.name === '服务器最新名',
  `name=${updated?.name}`,
)

// 5. 删除
removeCachedYouth(1271)
check(
  '删除后查不到',
  getCachedYouth(1271) === null,
)

// 6. 待展示标记（新增 -> 进入帮扶页自动选中）
clearYouthCache()
cacheYouth(makeYouth(2001))
setPendingShowYouth(2001)
const pending = consumePendingShowYouth()
check(
  '待展示标记可被消费',
  pending === '2001' && getCachedYouth(pending)?.name === '人员2001',
  `pending=${pending}`,
)
check(
  '待展示标记消费后清空',
  consumePendingShowYouth() === null,
)

// 7. syncYouthCache 批量同步（模拟刷新后加载）
clearYouthCache()
syncYouthCache([makeYouth(3001), makeYouth(3002)])
check(
  'syncYouthCache 批量同步',
  getCachedYouth(3001) && getCachedYouth(3002),
)

const failed = results.filter((r) => !r.ok)
console.log(
  `\n结果：${results.length - failed.length}/${results.length} 通过`,
)
process.exit(failed.length ? 1 : 0)
