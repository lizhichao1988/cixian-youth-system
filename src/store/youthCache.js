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
 * 本会话内“刚新增、需要在帮扶页自动选中”的人员 ID。
 */
let pendingShowId = null

export function cacheYouth(record) {
  const id = getYouthId(record)

  if (!id) {
    return
  }

  youthMap.set(
    id,
    { ...record },
  )
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
}

export function syncYouthCache(list = []) {
  if (!Array.isArray(list)) {
    return
  }

  list.forEach((record) => {
    cacheYouth(record)
  })
}

export function getAllCachedYouth() {
  return Array.from(
    youthMap.values(),
  )
}

/**
 * 把内存缓存合并进现有列表：
 *
 *   以 ID 去重；
 *   缓存里的记录（最新、服务器已确认）覆盖列表里的旧数据；
 *   缓存里有、列表里还没有的（刚新增尚未进列表的极端情况）
 *   也一并补进去。
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

  youthMap.forEach((record, id) => {
    /**
     * 缓存是“最新、服务器已确认”的版本，
     * 一律以它为准（覆盖或补位）。
     */
    byId.set(
      id,
      record,
    )
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

  pendingShowId = null
}
