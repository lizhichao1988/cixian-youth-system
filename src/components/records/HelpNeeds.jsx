
/* =========================================================
   帮扶记录
   ========================================================= */
import { Tag, Typography } from 'antd'

const { Text } = Typography

function HelpNeeds({
  helpNeeds,
}) {
  const needs = Array.isArray(helpNeeds)
    ? helpNeeds
    : []

  return (
    <div>
      {needs.length > 0 ? (
        needs.map((need, index) => (
          <div
            className="record-card"
            key={
              need.id ||
              `${need.date || ''}-${index}`
            }
          >
            <div className="record-header">
              <strong>
                {need.date || '未填写日期'}
              </strong>

              {need.resolved === '是' ? (
                <Tag color="success">已解决</Tag>
              ) : (
                <Tag>未解决</Tag>
              )}
            </div>

            {need.type && (
              <div>
                <b>需求类型：</b>
                {need.type}
              </div>
            )}

            {need.description && (
              <div>
                <b>需求描述：</b>
                {need.description}
              </div>
            )}

            {need.resolved && (
              <div>
                <b>是否已解决：</b>
                {need.resolved}
              </div>
            )}

            {need.resolvedDate && (
              <div>
                <b>解决日期：</b>
                {need.resolvedDate}
              </div>
            )}

            {need.remark && (
              <div>
                <b>备注：</b>
                {need.remark}
              </div>
            )}
          </div>
        ))
      ) : (
        <Text type="secondary">
          暂无帮扶需求记录
        </Text>
      )}
    </div>
  )
}

export { HelpNeeds }
