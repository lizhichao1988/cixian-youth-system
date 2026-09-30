import { useState } from 'react'

import {
  sortRisksLatestFirst,
} from '../utils/riskUtils'


/**
 * =========================================================
 * 青少年详情 Hook
 * =========================================================
 *
 * 负责“一人一档”详情区域的状态。
 *
 * 当前职责：
 *
 * 1. 保存当前查看的人员
 * 2. 控制详情抽屉打开 / 关闭
 * 3. 打开某个人的详情
 * 4. 关闭详情
 * 5. 在编辑保存后同步更新当前详情
 *
 * 本 Hook 不负责：
 *
 * 1. 从后端读取数据
 * 2. 编辑数据
 * 3. 保存数据
 * 4. 页面显示
 *
 * 详情的显示由：
 *
 * YouthDrawers.jsx
 * YouthDetail.jsx
 *
 * 负责。
 *
 * =========================================================
 * 为什么单独拆出来？
 * =========================================================
 *
 * 原来 App.jsx 同时负责：
 *
 * - 页面切换
 * - 数据加载
 * - 筛选
 * - 编辑
 * - 详情
 * - Drawer
 *
 * 现在把“详情状态”独立出来。
 *
 * 这样以后：
 *
 * App.jsx
 *     ↓
 * useYouthDetail
 *     ↓
 * detailRecord
 *
 * 而：
 *
 * useYouthEditor
 *     ↓
 * onRecordSaved
 *     ↓
 * useYouthDetail.updateDetailRecord()
 *
 * 编辑模块和详情模块之间不再直接互相管理状态。
 * =========================================================
 */


/**
 * =========================================================
 * useYouthDetail
 * =========================================================
 */
export function useYouthDetail() {
  /**
   * 当前正在查看的青少年。
   *
   * null 表示当前没有打开任何人的详情。
   */
  const [
    detailRecord,
    setDetailRecord,
  ] = useState(null)

  /**
   * 一人一档详情抽屉是否打开。
   */
  const [
    drawerOpen,
    setDrawerOpen,
  ] = useState(false)


  /**
   * =========================================================
   * 打开详情
   * =========================================================
   *
   * 点击表格中的某个人时调用。
   */
  function openDetail(record) {
    setDetailRecord(
      record,
    )

    setDrawerOpen(
      true,
    )
  }


  /**
   * =========================================================
   * 关闭详情
   * =========================================================
   */
  function closeDetail() {
    setDrawerOpen(
      false,
    )
  }


  /**
   * =========================================================
   * 更新当前详情
   * =========================================================
   *
   * 当 useYouthEditor 保存人员信息后，
   * App.jsx 会调用这个函数。
   *
   * 这里不能直接无条件替换 detailRecord，
   * 因为用户可能：
   *
   * 1. 正在编辑 A
   * 2. 详情却已经切换到了 B
   *
   * 所以必须检查 key。
   *
   * 只有保存的人员和当前查看的人员是同一个人，
   * 才更新详情。
   */
  function updateDetailRecord(
    record,
  ) {
    setDetailRecord(
      (current) => {
        if (
          !current ||
          current.key !==
            record.key
        ) {
          return current
        }

        return record
      },
    )
  }


  /**
   * =========================================================
   * 更新当前详情中的风险排查记录
   * =========================================================
   *
   * 风险排查页面新增记录时，App.jsx 会直接更新
   * allYouthData。详情抽屉本身又保存了一份当前人员快照，
   * 因此这里必须同步更新这份快照。
   *
   * 只有 youthId 与当前详情人员相同才会更新。
   */
  function updateDetailRisks(
    youthId,
    risk,
  ) {
    setDetailRecord(
      (current) => {
        if (!current) {
          return current
        }

        const currentId =
          current.key ??
          current.id ??
          current.Id ??
          ''

        if (
          String(currentId) !==
          String(youthId)
        ) {
          return current
        }

        const currentRisks =
          Array.isArray(current.risks)
            ? current.risks
            : []

        const riskId = String(
          risk?.id ??
            risk?.Id ??
            risk?.ID ??
            '',
        ).trim()

        const nextRisks =
          riskId
            ? [
                risk,
                ...currentRisks.filter(
                  (item) =>
                    String(
                      item?.id ??
                        item?.Id ??
                        item?.ID ??
                        '',
                    ).trim() !== riskId,
                ),
              ]
            : [
                risk,
                ...currentRisks,
              ]

        return {
          ...current,
          risks:
            sortRisksLatestFirst(
              nextRisks,
            ),
        }
      },
    )
  }


  /**
   * =========================================================
   * 对外暴露
   * =========================================================
   */
  return {
    detailRecord,
    drawerOpen,

    setDrawerOpen,

    openDetail,
    closeDetail,
    updateDetailRecord,
    updateDetailRisks,
  }
}