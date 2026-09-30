import {
  Space,
  Button,
  Drawer,
} from 'antd'

import { YouthDetail } from './YouthDetail'
import { YouthForm } from './YouthForm'

/* =========================================================
   YouthDrawers
   =========================================================
   负责青少年相关的两个抽屉：

   1. 一人一档详情抽屉
   2. 编辑 / 新建抽屉

   将这些 UI 细节从 App.jsx 中独立出来，
   App.jsx 只负责管理页面状态和业务逻辑。
   ========================================================= */

export function YouthDrawers({
  detailRecord,
  drawerOpen,
  setDrawerOpen,

  editRecord,
  editOpen,
  setEditOpen,

  openEdit,
  saveEdit,
  updateEditField,

  categoryGroups,
  onOpenAllRisks,
}) {
  return (
    <>
      {/* =====================================================
         一人一档详情抽屉
         ===================================================== */}
      <Drawer
        title={
          detailRecord
            ? `${detailRecord.name} · 一人一档`
            : '青少年档案'
        }
        open={drawerOpen}
        onClose={() =>
          setDrawerOpen(false)
        }
        width={900}
        extra={
          detailRecord ? (
            <Button
              type="primary"
              onClick={() => {
                setDrawerOpen(false)

                /*
                 * 告诉编辑模块：
                 *
                 * 这次编辑是从“一人一档”详情页进入的。
                 *
                 * 保存成功以后会自动重新打开详情页，
                 * 让用户立刻看到刚刚保存好的数据。
                 */
                openEdit(detailRecord, {
                  source: 'detail',
                })
              }}
            >
              编辑
            </Button>
          ) : null
        }
      >
        {detailRecord && (
          <YouthDetail
            record={detailRecord}
            onOpenAllRisks={onOpenAllRisks}
          />
        )}
      </Drawer>

      {/* =====================================================
         编辑 / 新建抽屉
         ===================================================== */}
      <Drawer
        title={`编辑：${
          editRecord?.name || ''
        }`}
        open={editOpen}
        onClose={() =>
          setEditOpen(false)
        }
        width={700}
        destroyOnClose
        extra={
          <Space>
            <Button
              onClick={() =>
                setEditOpen(false)
              }
            >
              取消
            </Button>

            <Button
              type="primary"
              onClick={saveEdit}
            >
              保存
            </Button>
          </Space>
        }
      >
        {editRecord && (
          <YouthForm
            key={editRecord.key}
            record={editRecord}
            onChange={updateEditField}
            categoryGroups={categoryGroups}
          />
        )}
      </Drawer>
    </>
  )
}