/**
 * =========================================================
 * 青少年编辑 Hook
 * =========================================================
 *
 * 负责处理“一人一档”编辑区域的状态和业务规则。
 *
 * 这里不负责页面显示。
 * 页面显示仍然由 YouthForm.jsx 负责。
 *
 * 这里也不负责从服务器读取数据。
 * 数据读取仍然由 useYouthData.js 负责。
 *
 * 当前职责：
 *
 * 1. 保存当前正在编辑的人员
 * 2. 控制编辑抽屉的打开 / 关闭
 * 3. 打开编辑时统一整理数据
 * 4. 修改编辑字段
 * 5. 保存编辑结果
 * 6. 处理“是否需要帮扶”与“结对帮扶”的联动规则
 * 7. 同步风险排查记录
 *
 * 数据写入：
 *
 *     useYouthEditor
 *          ↓
 *     youthApi.js
 *          ↓
 *     server.js
 *          ↓
 *     NocoDB
 *
 * 本文件负责业务流程，
 * youthApi.js 负责 API 请求。
 * =========================================================
 */

import {
  useRef,
  useState,
} from 'react'

import {
  normalizeHelpRequired,
  getCategoryValue,
} from '../utils/categoryUtils'

import {
  createEmptyYouthRecord,
} from '../utils/youthUtils'

import {
  normalizePairingStatus,
} from '../utils/pairingUtils'

import {
  sortRisksLatestFirst,
} from '../utils/riskUtils'

import {
  updateYouthRecord,
  createYouthRecord,
  createRiskRecord,
  updateRiskRecord,
  deleteRiskRecord,
  deleteYouthRecord,
} from '../api/youthApi'

import {
  normalizeRecord,
} from '../utils/youthNormalizer'

import {
  cacheYouth,
  removeCachedYouth,
  setPendingShowYouth,
} from '../store/youthCache'


/**
 * =========================================================
 * 青少年编辑 Hook
 * =========================================================
 */
export function useYouthEditor({
  messageApi,
  setAllYouthData,
  onRecordSaved,
  onAfterSave,
}) {
  /**
   * 当前正在编辑的青少年记录。
   *
   * null 表示当前没有正在编辑的人员。
   */
  const [
    editRecord,
    setEditRecord,
  ] = useState(null)

  /**
   * 编辑抽屉是否打开。
   */
  const [
    editOpen,
    setEditOpen,
  ] = useState(false)

  /**
   * =========================================================
   * 编辑开始时的原始风险记录
   * =========================================================
   *
   * 为什么需要单独保存一份？
   *
   * 因为编辑过程中：
   *
   *     editRecord.risks
   *
   * 会不断发生变化。
   *
   * 保存时我们需要知道：
   *
   *     哪些风险记录是原来就存在的？
   *     哪些是新增加的？
   *     哪些是用户删除的？
   *
   * 所以打开编辑时，
   * 将当时的风险记录单独保存一份。
   */
  const [
    originalRisks,
    setOriginalRisks,
  ] = useState([])

  /**
   * =========================================================
   * 编辑入口
   * =========================================================
   *
   * 记录这一次编辑是从哪里打开的。
   *
   *     'list'     青少年列表 / 新增人员
   *     'detail'   一人一档详情页
   *
   * 保存成功以后，
   * App.jsx 会根据这个值决定要不要重新打开详情页。
   *
   * 使用 useRef：
   *
   * 它只是流程标记，不需要触发重新渲染。
   */
  const editSourceRef =
    useRef('list')

  /**
   * =========================================================
   * 打开编辑
   * =========================================================
   *
   * 打开编辑之前，对数据做一次前端统一处理。
   *
   * 这样 YouthForm.jsx 不需要知道 NocoDB 返回的数据
   * 可能是什么结构。
   *
   * options.source：
   *
   *     标记编辑入口。
   *
   *     YouthDrawers（一人一档详情页）
   *          ↓
   *     openEdit(record, { source: 'detail' })
   */
  function openEdit(
    record,
    options = {},
  ) {
    /*
     * 每次打开编辑都重新确定入口。
     *
     * 默认是列表入口，
     * 这样可以避免上一次的标记残留。
     */
    editSourceRef.current =
      options?.source === 'detail'
        ? 'detail'
        : 'list'

    const normalizedRisks =
      sortRisksLatestFirst(
        Array.isArray(record.risks)
          ? record.risks.map(
              (risk) => ({
                ...risk,
              }),
            )
          : [],
      )

    /**
     * 保存一份“编辑开始时”的风险记录。
     *
     * 后面保存时用它判断：
     *
     *     新增
     *     修改
     *     删除
     */
    setOriginalRisks(
      normalizedRisks.map(
        (risk) => ({
          ...risk,
        }),
      ),
    )

    setEditRecord({
      ...record,

      // “是否需要帮扶”统一转换成“是 / 否”
      helpRequired:
        normalizeHelpRequired(
          record.helpRequired,
        ) || '否',

      // 困难类别统一转换成前端使用的值
      categories:
        getCategoryValue(
          record.categories,
        ),

      // 风险记录始终保证是数组
      risks:
        normalizedRisks,
    })

    setEditOpen(true)
  }

  /**
   * =========================================================
   * 打开新增人员
   * =========================================================
   *
   * 新增人员的默认数据由 youthUtils.js 统一创建。
   *
   * 当前阶段：
   *
   *     这里只负责打开新增编辑界面。
   *
   *     真正的“新增数据库记录”将在下一阶段单独实现。
   */
  function openCreate(
    sequence,
  ) {
    const newRecord =
      createEmptyYouthRecord(
        sequence,
      )

    openEdit(
      newRecord,
    )
  }

  /**
   * =========================================================
   * 将前端编辑记录转换成数据库字段
   * =========================================================
   */
  function buildYouthUpdateFields(
    record,
  ) {
    const fields = {}

    /**
     * 基本信息字段。
     */
    fields['姓名'] =
      record.name ?? ''

    fields['性别'] =
      record.gender ?? ''

    fields['出生年月'] =
      record.birthday ?? ''

    fields['政治面貌'] =
      record.political ?? ''

    fields['户籍地'] =
      record.household ?? ''

    fields['常住地'] =
      record.residence ?? ''

    /**
     * NocoDB 青少年基本信息表里的真实字段名
     * 是“个人基本情况”。
     *
     * 以前这里写的是“基本情况”，
     * 后端再转成“基本情况”，
     * 结果数据库里根本没有这个字段，
     * 所以“个人基本情况”一直保存不进去。
     */
    fields['个人基本情况'] =
      record.basic ?? ''

    fields['联系方式'] =
      record.phone ?? ''

    fields['监护人姓名'] =
      record.guardian ?? ''

    fields['监护人联系方式'] =
      record.guardianPhone ?? ''

    fields['是否需要帮扶'] =
      record.helpRequired ?? '否'

    fields['备注'] =
      record.remark ?? ''

    return fields
  }

  /**
   * =========================================================
   * 关联表字段
   * =========================================================
   *
   * 这几项不在青少年基本信息表里：
   *
   *     困难类别 / 困难大类  -> 困难类别表（链接）
   *     帮扶需求             -> 帮扶需求表
   *     结对帮扶             -> 结对帮扶信息表
   *
   * 以前保存时根本没有带上这些字段，
   * 所以才会出现：
   *
   *     前端改了、刷新又变回去。
   */
  function buildYouthExtraFields(
    record,
  ) {
    return {
      categories:
        getCategoryValue(
          record.categories,
        ) || '',

      bigCategory:
        record.bigCategory || '',

      helpNeed:
        record.helpNeed || '暂无',

      pairing:
        normalizePairingStatus(
          record.pairing,
        ) || '否',

      pairingContact:
        record.pairingContact || '',

      pairingPhone:
        record.pairingPhone || '',

      pairingUnit:
        record.pairingUnit || '',
    }
  }

  /**
   * =========================================================
   * 获取风险记录 ID
   * =========================================================
   *
   * NocoDB 正常情况下使用 id。
   *
   * 这里同时兼容：
   *
   *     id
   *     Id
   *     ID
   *
   * 这样可以避免不同接口返回格式不同导致判断失败。
   */
  function getRiskId(
    risk,
  ) {
    const id =
      risk?.id ??
      risk?.Id ??
      risk?.ID ??
      ''

    return String(
      id,
    ).trim()
  }

  /**
   * =========================================================
   * 判断两个风险记录是否完全相同
   * =========================================================
   *
   * 注意：
   *
   * id 不参与比较。
   *
   * 我们只比较真正需要写入数据库的业务字段。
   */
  function isRiskChanged(
    oldRisk,
    newRisk,
  ) {
    const oldDate =
      oldRisk?.date ?? ''

    const newDate =
      newRisk?.date ?? ''

    const oldStatus =
      oldRisk?.hasRisk ??
      oldRisk?.status ??
      '否'

    const newStatus =
      newRisk?.hasRisk ??
      newRisk?.status ??
      '否'

    const oldDescription =
      oldRisk?.description ?? ''

    const newDescription =
      newRisk?.description ?? ''

    const oldHandling =
      oldRisk?.handling ?? ''

    const newHandling =
      newRisk?.handling ?? ''

    const oldInspector =
      oldRisk?.inspector ?? ''

    const newInspector =
      newRisk?.inspector ?? ''

    const oldRemark =
      oldRisk?.remark ?? ''

    const newRemark =
      newRisk?.remark ?? ''

    return (
      oldDate !== newDate ||
      oldStatus !== newStatus ||
      oldDescription !== newDescription ||
      oldHandling !== newHandling ||
      oldInspector !== newInspector ||
      oldRemark !== newRemark
    )
  }

  /**
   * =========================================================
   * 合并“服务器返回的风险记录”和“本地正在编辑的记录”
   * =========================================================
   *
   * 为什么需要单独写这个合并函数？
   *
   * 因为服务器返回的记录，
   * 并不保证每一个字段都是可靠的值。
   *
   * 最典型的情况：
   *
   * NocoDB 的修改接口
   *
   *     PATCH /api/v2/tables/xxx/records
   *
   * 只返回记录 ID：
   *
   *     [ { "Id": 6 } ]
   *
   * 业务字段全部没有返回。
   *
   * 如果这时候直接写：
   *
   *     {
   *       ...本地记录,
   *       ...服务器记录,
   *     }
   *
   * 那么服务器记录中的空字符串
   * 就会把本地刚刚编辑好的数据全部覆盖掉：
   *
   *     是否存在风险  → ''
   *     排查日期      → ''
   *     风险隐患描述  → ''
   *     处置情况      → ''
   *     排查人        → ''
   *     备注          → ''
   *
   * 于是界面上就出现：
   *
   *     “服务器提示保存成功，
   *       但风险排查记录显示为空”
   *
   * 所以这里统一规定：
   *
   *     服务器返回的空值（undefined / null / 空字符串）
   *     不允许覆盖本地已有的值。
   *
   * ---------------------------------------------------------
   * 会不会导致用户主动清空的字段清不掉？
   * ---------------------------------------------------------
   *
   * 不会。
   *
   * 因为用户在界面上把某个字段清空以后，
   *
   *     本地记录本身就已经是空字符串
   *
   * 合并以后的最终结果依然是空字符串。
   *
   * 只有“服务器返回空、本地有值”这种情况，
   * 才会保留本地的值。
   * =========================================================
   */
  function mergeServerRisk(
    localRisk,
    serverRisk,
  ) {
    const local =
      localRisk &&
      typeof localRisk === 'object'
        ? localRisk
        : {}

    const server =
      serverRisk &&
      typeof serverRisk === 'object'
        ? serverRisk
        : {}

    const merged = {
      ...local,
    }

    Object.keys(server).forEach(
      (key) => {
        const value = server[key]

        /*
         * 服务器没有返回这个字段。
         */
        if (
          value === undefined ||
          value === null
        ) {
          return
        }

        /*
         * 服务器返回了空字符串，
         * 说明这个字段不可靠，保留本地值。
         */
        if (
          typeof value === 'string' &&
          value.trim() === ''
        ) {
          return
        }

        /*
         * 服务器确实返回了有效值，
         * 以服务器为准。
         */
        merged[key] = value
      },
    )

    return merged
  }

 /**
 * =========================================================
 * 同步风险排查记录
 * =========================================================
 *
 * 核心规则：
 *
 * 1. 原来没有 ID，现在也没有 ID
 *       ↓
 *    新增数据库记录
 *
 * 2. 原来有 ID，现在仍然有 ID
 *       ↓
 *    判断是否修改
 *       ↓
 *    修改以后，以服务器返回的最终记录为准
 *
 * 3. 原来有 ID，现在不存在
 *       ↓
 *    删除数据库记录
 *
 * 最重要的原则：
 *
 *     数据库操作成功
 *          ↓
 *     才把最终结果写回前端
 *
 * 如果数据库保存失败：
 *
 *     不更新 allYouthData
 *
 * =========================================================
 */
async function syncRiskRecords(
  youthId,
  currentRisks,
) {
  const originalList =
    Array.isArray(
      originalRisks,
    )
      ? originalRisks
      : []

  const currentList =
    Array.isArray(
      currentRisks,
    )
      ? currentRisks
      : []

  /**
   * =======================================================
   * 当前最终风险记录
   * =======================================================
   *
   * 一开始先复制当前编辑界面中的数据。
   *
   * 后面：
   *
   * 新增：
   *     用服务器返回的记录替换
   *
   * 修改：
   *     用服务器返回的记录替换
   *
   * 删除：
   *     不进入这个数组
   * =======================================================
   */
  const savedRisks =
    currentList.map(
      (risk) => ({
        ...risk,
      }),
    )

  /**
   * =======================================================
   * 第一部分：新增 / 修改
   * =======================================================
   */
  for (
    let index = 0;
    index < currentList.length;
    index += 1
  ) {
    const currentRisk =
      currentList[index]

    const currentRiskId =
      getRiskId(
        currentRisk,
      )

    /**
     * =====================================================
     * 情况 A：新增
     * =====================================================
     */
    if (!currentRiskId) {
      const result =
        await createRiskRecord(
          youthId,
          currentRisk,
        )

      /**
       * 服务器返回的 record
       * 才是数据库真正创建成功的记录。
       */
      const savedRisk =
        result?.record

      const newRiskId =
        getRiskId(
          savedRisk,
        ) ||
        String(
          result?.riskId ??
            '',
        ).trim()

      if (!newRiskId) {
        throw new Error(
          '风险排查记录创建成功，但服务器没有返回数据库记录ID',
        )
      }

      /**
       * 如果服务器已经返回完整 record，
       * 直接使用服务器记录。
       *
       * 如果服务器没有返回完整字段，
       * 再使用当前编辑数据作为兜底。
       *
       * 注意：
       *
       * 这里必须使用 mergeServerRisk()，
       *
       * 不能用简单的对象展开，
       * 否则服务器返回的空值会把刚刚填写的内容冲掉。
       */
      savedRisks[index] = {
        ...mergeServerRisk(
          currentRisk,
          savedRisk,
        ),

        id: newRiskId,

        /**
         * 新增记录必须保留服务器返回的创建时间。
         *
         * 如果服务器没有返回创建时间，
         * 才使用当前成功保存时间作为兜底。
         */
        createdAt:
          savedRisk?.createdAt ||
          currentRisk?.createdAt ||
          new Date().toISOString(),
      }

      continue
    }

    /**
     * =====================================================
     * 情况 B：修改已有记录
     * =====================================================
     */
    const oldRisk =
      originalList.find(
        (item) =>
          getRiskId(
            item,
          ) === currentRiskId,
      )

    /**
     * 没有发生修改：
     *
     * 直接保留原来的记录。
     */
    if (
      oldRisk &&
      !isRiskChanged(
        oldRisk,
        currentRisk,
      )
    ) {
      savedRisks[index] = {
        ...currentRisk,

        /**
         * 无论如何都保留原来的创建时间。
         */
        createdAt:
          currentRisk?.createdAt ||
          oldRisk?.createdAt ||
          '',
      }

      continue
    }

    /**
     * =====================================================
     * 真正修改数据库
     * =====================================================
     */
    const result =
      await updateRiskRecord(
        currentRiskId,
        currentRisk,
      )

    /**
     * 修改成功以后：
     *
     * 绝对不能继续简单使用 currentRisk。
     *
     * 必须优先使用服务器返回的最终记录。
     *
     * 但是有一个前提：
     *
     *     服务器返回的“空值”不能覆盖本地值。
     *
     * 因为 NocoDB 的修改接口只返回记录 ID，
     * 简单展开会把刚刚保存好的风险数据全部清空。
     *
     * 所以统一交给 mergeServerRisk() 处理。
     */
    const serverRisk =
      result?.record

    /**
     * 如果服务器返回了完整记录，
     * 就使用服务器返回的数据。
     *
     * 如果没有返回完整记录，
     * 才使用当前编辑数据作为兜底。
     */
    const finalRisk = {
      ...mergeServerRisk(
        currentRisk,
        serverRisk,
      ),

      /**
       * ID 永远使用正在修改的数据库记录 ID。
       */
      id: currentRiskId,

      /**
       * 修改风险记录时：
       *
       * “添加时间”不能重新计算。
       *
       * 必须保留原来这条记录的 createdAt。
       *
       * 因为用户修改了一条旧记录，
       * 并不意味着这条记录重新添加了一次。
       */
      createdAt:
        serverRisk?.createdAt ||
        currentRisk?.createdAt ||
        oldRisk?.createdAt ||
        '',
    }

    savedRisks[index] =
      finalRisk
  }

  /**
   * =======================================================
   * 第二部分：删除
   * =======================================================
   *
   * originalList：
   *     打开编辑时数据库中已经存在的记录
   *
   * currentList：
   *     用户编辑完成以后仍然保留的记录
   *
   * 如果：
   *
   *     oldRisk 存在
   *
   * 但是：
   *
   *     currentList 中已经找不到这个 ID
   *
   * 就说明用户点击了“删除”。
   * =======================================================
   */
  for (
    const oldRisk of originalList
  ) {
    const oldRiskId =
      getRiskId(
        oldRisk,
      )

    if (!oldRiskId) {
      continue
    }

    const stillExists =
      currentList.some(
        (risk) =>
          getRiskId(
            risk,
          ) === oldRiskId,
      )

    /**
     * 当前编辑列表已经不存在：
     *
     *     ↓
     *
     * 真正删除数据库记录。
     */
    if (!stillExists) {
      await deleteRiskRecord(
        oldRiskId,
      )
    }
  }

  /**
   * =======================================================
   * 最终统一排序
   * =======================================================
   *
   * 新增：
   *     最新添加时间优先
   *
   * 历史：
   *     原来的 createdAt 保留
   *
   * 排查日期相同时：
   *     再比较 ID
   * =======================================================
   */
  return sortRisksLatestFirst(
    savedRisks,
  )
}
   

  /**
   * =========================================================
   * 保存编辑
   * =========================================================
   */
  async function saveEdit() {
    /**
     * ---------------------------------------------------------
     * 1. 检查姓名
     * ---------------------------------------------------------
     */
    if (
      !editRecord?.name?.trim()
    ) {
      messageApi.error(
        '姓名不能为空',
      )

      return
    }

    /**
     * ---------------------------------------------------------
     * 2. 标准化编辑记录
     * ---------------------------------------------------------
     */
    const normalizedEditRecord = {
      ...editRecord,

      // 统一“是否需要帮扶”
      helpRequired:
        normalizeHelpRequired(
          editRecord.helpRequired,
        ) || '否',

      // 统一“是否结对帮扶”
      pairing:
        normalizePairingStatus(
          editRecord.pairing,
        ) || '否',
    }

    /**
     * ---------------------------------------------------------
     * 3. 如果明确“不需要帮扶”
     * ---------------------------------------------------------
     */
    if (
      normalizedEditRecord.helpRequired ===
      '否'
    ) {
      normalizedEditRecord.helpNeed =
        '暂无'

      normalizedEditRecord.pairing =
        '否'

      normalizedEditRecord.pairingContact =
        ''

      normalizedEditRecord.pairingPhone =
        ''

      normalizedEditRecord.pairingUnit =
        ''
    }

    /**
     * ---------------------------------------------------------
     * 4. 判断当前是不是已经存在的数据库记录
     * ---------------------------------------------------------
     */
    const youthId =
      String(
        normalizedEditRecord.key ??
          '',
      ).trim()

    /**
     * 是不是新增人员？
     *
     * 数据库里已有的记录，
     * 它的 key 一定是纯数字 ID（例如 "31"）。
     *
     * 所以判断规则改成：
     *
     *     纯数字          -> 已有记录，走 PUT 更新
     *     其它任何形式    -> 新增人员，走 POST 新增
     *
     * 以前这里写的是 “以 youth- 开头才算新增”，
     * 但新增表单的 key 生成规则一变（例如时间戳），
     * 就会把“新增人员”误判成“修改已有记录”，
     * 拿一个不存在的 ID 去 PUT → 后端 400。
     */
    const isNewRecord =
      !/^\d+$/.test(youthId)

    /**
     * ---------------------------------------------------------
     * 5. 将前端字段转换成 NocoDB 字段
     * ---------------------------------------------------------
     */
    const updateFields =
      buildYouthUpdateFields(
        normalizedEditRecord,
      )

    /**
     * 关联表字段。
     */
    const extraFields =
      buildYouthExtraFields(
        normalizedEditRecord,
      )

    /**
     * ---------------------------------------------------------
     * 6. 提示正在保存
     * ---------------------------------------------------------
     */
    const hideLoading =
      messageApi.loading(
        '正在保存数据...',
        0,
      )

    try {
      /**
       * -------------------------------------------------------
       * 7-A. 新增人员
       * -------------------------------------------------------
       *
       * 数据库里还没有这条记录，
       * 走新建接口。
       *
       * 后端返回标准化后的新记录，
       * 前端直接放进列表即可实时显示。
       */
      if (isNewRecord) {
        const created =
          await createYouthRecord(
            updateFields,
            extraFields,
          )

        const newYouthId = String(
          created.id || '',
        )

        /**
         * 新增人员也可能同时填写了风险排查记录。
         */
        let createdRisks = []

        if (
          newYouthId &&
          Array.isArray(
            normalizedEditRecord.risks,
          ) &&
          normalizedEditRecord.risks
            .length > 0
        ) {
          createdRisks =
            await syncRiskRecords(
              newYouthId,
              normalizedEditRecord.risks,
            )
        }

        const createdRecord =
          normalizeRecord(
            /**
             * 兜底：如果服务器返回的记录不完整
             * （例如某些字段为空），
             * 直接用“刚才 POST 给服务器的那条本地数据”
             * 作为基础，保证缓存 / 页面里一定有用户填写的信息。
             *
             * 这正是用户要求的：
             * “把你 post 给服务器的那条新增记录，
             *  直接做一个结构变量缓存到内存中”。
             */
            created.record &&
            created.record.name
              ? created.record
              : {
                  ...normalizedEditRecord,
                  key: newYouthId,
                },
            0,
          )

        const savedNewRecord = {
          ...createdRecord,
          key:
            newYouthId ||
            createdRecord.key,
          risks:
            createdRisks.length > 0
              ? createdRisks
              : createdRecord.risks,
        }

        /**
         * 立刻把这条“服务器确认成功”的记录
         * 缓存进前端内存字典，
         * 帮扶管理页等其它页面可直接读取，
         * 切过去就能看到新增的人员。
         */
        /**
         * fresh: true 很关键。
         *
         * 只有标记为 fresh 的记录
         * 才会被合并进帮扶页的列表，
         * 这样新增的人能立刻出现，
         * 又不会把别的账号的数据带过来。
         */
        cacheYouth(
          savedNewRecord,
          { fresh: true },
        )

        /**
         * 标记“刚新增”，
         * 进入帮扶管理页时自动选中这个人，
         * 让用户立刻看到新增信息。
         */
        setPendingShowYouth(
          savedNewRecord.key,
        )

        setAllYouthData(
          (prev) => [
            savedNewRecord,
            ...prev,
          ],
        )

        setEditRecord(
          savedNewRecord,
        )

        setOriginalRisks(
          createdRisks.map(
            (risk) => ({
              ...risk,
            }),
          ),
        )

        setEditOpen(false)

        messageApi.success(
          '新增人员已保存到数据库',
        )

        if (
          typeof onAfterSave ===
          'function'
        ) {
          onAfterSave(
            savedNewRecord,
            editSourceRef.current,
          )
        }

        return
      }

      /**
       * -------------------------------------------------------
       * 7-B. 保存青少年主表
       * -------------------------------------------------------
       *
       * 先保存已经验证正常的普通字段，
       * 同时把困难类别 / 帮扶需求 / 结对帮扶
       * 一起交给后端写入各自的关联表。
       */
      await updateYouthRecord(
        youthId,
        {
          ...updateFields,
          ...extraFields,
        },
      )

      /**
       * -------------------------------------------------------
       * 8. 同步风险排查记录
       * -------------------------------------------------------
       *
       * 这里才真正处理：
       *
       *     新增
       *     修改
       *     删除
       *
       * 一对多风险记录。
       */
      const savedRisks =
        await syncRiskRecords(
          youthId,
          normalizedEditRecord.risks,
        )

      /**
       * -------------------------------------------------------
       * 9. 将数据库最终状态写回当前编辑记录
       * -------------------------------------------------------
       *
       * 特别重要：
       *
       * 新增风险记录在数据库中获得了真实 ID。
       *
       * 所以这里必须把新的 risks 写回去。
       */
      const savedRecord = {
        ...normalizedEditRecord,
        risks:
          savedRisks,
      }

      /**
       * -------------------------------------------------------
       * 10. 数据库成功后再更新前端列表
       * -------------------------------------------------------
       */
      /**
       * 同样标成 fresh：
       * 编辑保存后帮扶页要能立刻看到最新内容。
       */
      cacheYouth(
        savedRecord,
        { fresh: true },
      )

      setAllYouthData(
        (prev) =>
          prev.map(
            (item) =>
              item.key ===
              savedRecord.key
                ? savedRecord
                : item,
          ),
      )

      /**
       * -------------------------------------------------------
       * 11. 同步当前详情
       * -------------------------------------------------------
       */
      if (onRecordSaved) {
        onRecordSaved(
          savedRecord,
        )
      }

      /**
       * -------------------------------------------------------
       * 12. 更新编辑状态
       * -------------------------------------------------------
       */
      setEditRecord(
        savedRecord,
      )

      /**
       * 保存成功以后，
       * 当前 risks 就成为下一次编辑时的基准。
       */
      setOriginalRisks(
        savedRisks.map(
          (risk) => ({
            ...risk,
          }),
        ),
      )

      /**
       * -------------------------------------------------------
       * 13. 关闭编辑抽屉
       * -------------------------------------------------------
       */
      setEditOpen(false)

      /**
       * -------------------------------------------------------
       * 14. 提示真正保存成功
       * -------------------------------------------------------
       */
      messageApi.success(
        '数据库保存成功',
      )

      /**
       * -------------------------------------------------------
       * 15. 保存成功以后的收尾动作
       * -------------------------------------------------------
       *
       * 例如：
       *
       * 用户是从“一人一档”详情页点“编辑”进来的，
       * 保存成功以后就应该重新回到详情页，
       * 让用户立刻看到刚刚保存好的风险排查数据。
       *
       * 这个动作由 App.jsx 决定，
       * 本 Hook 只负责通知。
       */
      if (
        typeof onAfterSave ===
        'function'
      ) {
        onAfterSave(
          savedRecord,
          editSourceRef.current,
        )
      }
    } catch (error) {
      /**
       * -------------------------------------------------------
       * 数据库保存失败
       * -------------------------------------------------------
       *
       * 这里故意不：
       *
       * - 修改 allYouthData
       * - 修改详情
       *
       * 这样前端不会假装数据库已经全部保存成功。
       */
      console.error(
        '保存青少年数据失败：',
        error,
      )

      messageApi.error(
        error?.message ||
          '保存青少年数据失败',
      )
    } finally {
      /**
       * 无论成功还是失败，
       * 都关闭“正在保存”提示。
       */
      hideLoading()
    }
  }

  /**
   * =========================================================
   * 删除青少年基本信息
   * =========================================================
   *
   * 仅在前端“后端已经删除成功”之后，
   * 才把这条记录从内存列表里移除，
   * 避免“后端失败、前端却消失了”的不一致。
   */
  async function deleteYouth(youthId) {
    /**
     * 取真实记录 ID。
     *
     * 表格里传进来的是一整个 record 对象，
     * 归一化后的记录真实 ID 在 `key` 字段
     * （后端 NocoDB 的 Id 被映射成 key），
     * 也可能是顶层 `Id` / `id`。
     *
     * 兼容三种传参：
     * 1. 数字 / 字符串 ID
     * 2. record 对象
     * 3. 空值（直接报错）
     */
    const id =
      String(
        typeof youthId === 'object' &&
        youthId !== null
          ? (youthId.key ??
            youthId.Id ??
            youthId.id ??
            '')
          : (youthId ?? ''),
      ).trim()

    if (!id) {
      messageApi.error(
        '缺少青少年记录ID',
      )

      return
    }

    const hide =
      messageApi.loading(
        '正在删除数据...',
        0,
      )

    try {
      await deleteYouthRecord(id)

      removeCachedYouth(id)

      setAllYouthData(
        (prev) =>
          prev.filter(
            (item) =>
              String(
                item.key ?? '',
              ) !== id,
          ),
      )

      messageApi.success(
        '已删除该人员数据',
      )
    } catch (error) {
      messageApi.error(
        error?.message ||
          '删除失败',
      )
    } finally {
      hide()
    }
  }

  /**
   * =========================================================
   * 修改编辑字段
   * =========================================================
   */
  function updateEditField(
    field,
    value,
  ) {
    setEditRecord(
      (prev) => {
        const next = {
          ...prev,
          [field]: value,
        }

        /**
         * 如果“是否需要帮扶”改成“否”：
         *
         * 立即清空：
         *
         * - 帮扶需求
         * - 是否结对
         * - 帮扶联系人
         * - 联系电话
         * - 所属单位
         */
        if (
          field ===
            'helpRequired' &&
          normalizeHelpRequired(
            value,
          ) === '否'
        ) {
          next.helpNeed =
            '暂无'

          next.pairing =
            '否'

          next.pairingContact =
            ''

          next.pairingPhone =
            ''

          next.pairingUnit =
            ''
        }

        /**
         * 如果“是否需要帮扶”改成“是”：
         *
         * 保证 pairing 至少有一个明确值。
         */
        if (
          field ===
            'helpRequired' &&
          normalizeHelpRequired(
            value,
          ) === '是'
        ) {
          next.helpRequired =
            '是'

          if (
            !normalizePairingStatus(
              next.pairing,
            )
          ) {
            next.pairing =
              '否'
          }
        }

        /**
         * 如果“是否需要结对帮扶”改成“否”：
         *
         * 立即清空帮扶联系人 / 联系电话 / 工作单位，
         * 这样被禁用的输入框不会残留旧数据。
         */
        if (
          field === 'pairing' &&
          normalizePairingStatus(
            value,
          ) === '否'
        ) {
          next.pairingContact =
            ''

          next.pairingPhone =
            ''

          next.pairingUnit =
            ''
        }

        return next
      },
    )
  }

  /**
   * =========================================================
   * 对外暴露
   * =========================================================
   */
  return {
    editRecord,
    editOpen,

    setEditOpen,

    openEdit,
    openCreate,
    saveEdit,
    updateEditField,
    deleteYouth,
  }
}