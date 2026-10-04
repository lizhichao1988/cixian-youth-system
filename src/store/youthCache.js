/**
 * =========================================================
 * 前端内存青少年缓存（结构化字典）
 * =========================================================
 *
 * 设计依据：完整对齐 src/utils/youthNormalizer.js 中
 * normalizeRecord() 的输出结构 —— 即“青少年基本信息表”
 * 的全部字段类型：
 *
 *   key            唯一 ID（字符串）
 *   sequence       序号
 *   name           姓名
 *   gender         性别
 *   birthday       出生年月
 *   political      政治面貌
 *   household      户籍地
 *   residence      常住地
 *   responsibleUnit 归口单位
 *   basic          个人基本情况
 *   phone          联系方式
 *   guardian       监护人姓名
 *   guardianPhone  监护人联系方式
 *   helpRequired   是否需要帮扶
 *   bigCategory    困难大类
 *   categories     困难小类
 *   timestamp      数据时间戳
 *   risks          风险排查记录[]
 *   helpNeed       帮扶需求摘要
 *   helpNeeds      帮扶需求记录[]
 *   pairing        是否结对帮扶
 *   pairingContact 结对帮扶联系人
 *   pairingPhone   结对帮扶联系电话
 *   pairingUnit    结对帮扶所属单位
 *   pairingRecords 结对帮扶记录[]
 *   helpRecordList 帮扶记录[]
 *   helpRecords    帮扶记录数量
 *   remark         备注
 *
 * 用法：
 *
 *   1. 新增 / 编辑保存成功后，
 *      把“服务器确认成功”的整条记录 cacheYouth() 进内存。
 *   2. 帮扶管理页等其它页面直接
 *      getCachedYouth(id) / mergeYouthCache(list) 读取，
 *      不需要等浏览器刷新，
 *      也不依赖服务器返回包是否完整。
 *   3. 支持多个人：内部用 Map（ID -> record）
 *      即“字典”结构，可同时缓存任意多条。
 */

function getYouthId(youth) {
  if (!youth || typeof youth !== 'object') {
    return ''
  }

  return String(
    youth.key ??
      youth.id ??
      youth.Id ??
      youth.ID ??
      '',
  ).trim()
}

/**
 * ID -> 标准化后的青少年记录。
 *
 * 这就是用户要的“结构变量缓存”。
 */
const youthMap = new Map()

/**
 * 「本会话内新增 / 编辑过」的人员 ID。
 *
 * 为什么要单独记一份：
 *
 *     帮扶页的 mergeYouthCache() 会把缓存里的记录
 *     补进列表里，好让刚新增的人立刻出现。
 *
 *     但缓存是全量加载时写进去的，
 *     如果换了个乡镇账号登录、
 *     而缓存里还留着上一个账号看过的全县数据，
 *     合并之后乡镇账号就能看到别的乡镇的人——
 *     这是实打实的越权。
 *
 *     所以只有新增 / 编辑时主动写入的记录
 *     才允许被补进列表，
 *     全量加载写进去的一律不算。
 */
const freshIds = new Set()

/**
 * 本会话内“刚新增、需要在帮扶页自动选中”的人员 ID。
 */
let pendingShowId = null

export function cacheYouth(
  record,
  options = {},
) {
  const id = getYouthId(record)

  if (!id) {
    return
  }

  youthMap.set(
    id,
    { ...record },
  )

  if (options.fresh) {
    freshIds.add(id)
  }
}

export function getCachedYouth(id) {
  if (!id) {
    return null
  }

  return (
    youthMap.get(
      String(id),
    ) || null
  )
}

export function removeCachedYouth(id) {
  if (!id) {
    return
  }

  youthMap.delete(
    String(id),
  )

  freshIds.delete(String(id))
}

export function syncYouthCache(list = []) {
  if (!Array.isArray(list)) {
    return
  }

  list.forEach((record) => {
    cacheYouth(record)
  })
}

/**
 * 用新列表整体替换缓存。
 *
 * 每次重新读取全量数据、
 * 以及切换登录账号时都必须走这个，
 * 不能用 syncYouthCache() 往里累加。
 *
 * 累加的后果：
 *
 *     管理员先看过的 1181 条留在缓存里，
 *     换成乡镇账号登录以后，
 *     后端只返回本乡镇 118 条，
 *     但缓存里那 1063 条还在，
 *     帮扶页一合并又全冒出来了。
 */
export function resetYouthCache(list = []) {
  youthMap.clear()

  freshIds.clear()

  syncYouthCache(list)
}

export function getAllCachedYouth() {
  return Array.from(
    youthMap.values(),
  )
}

/**
 * 把「本会话新增 / 编辑过」的记录合并进现有列表。
 *
 * 规则（和以前不一样，别改回去）：
 *
 *   1. 以传入的列表为准——
 *      列表是后端按账号权限返回的结果，
 *      它决定“你能看到谁”。
 *   2. 只有 freshIds 里的记录才补进列表，
 *      也就是本会话真正新增 / 编辑过、
 *      服务器已确认的那几条。
 *   3. 全量加载写进缓存的历史记录一律不补，
 *      否则换账号登录时会把上一个账号的数据带过来。
 */
export function mergeYouthCache(list = []) {
  const arr =
    Array.isArray(list)
      ? list
      : []

  const byId = new Map()

  arr.forEach((record) => {
    const id = getYouthId(record)

    if (id) {
      byId.set(
        id,
        record,
      )
    }
  })

  freshIds.forEach((id) => {
    const record =
      youthMap.get(id)

    if (record) {
      byId.set(id, record)
    }
  })

  return Array.from(
    byId.values(),
  )
}

export function setPendingShowYouth(id) {
  pendingShowId =
    id
      ? String(id)
      : null
}

export function consumePendingShowYouth() {
  const id = pendingShowId

  pendingShowId = null

  return id
}

export function clearYouthCache() {
  youthMap.clear()

  freshIds.clear()

  pendingShowId = null
}
