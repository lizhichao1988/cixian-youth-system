import { Tag, Typography } from 'antd'

const { Text } = Typography

function RiskRecords({
  risks,
  riskStatus,
  normalizeRiskStatus,
  firstDefined,
}) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        {riskStatus === '有风险' && (
          <Tag color="error">有风险</Tag>
        )}

        {riskStatus === '无风险' && (
          <Tag color="success">无风险</Tag>
        )}

        {riskStatus === '未排查' && (
          <Tag>未排查</Tag>
        )}
      </div>

      {risks.length > 0 ? (
        risks.map((risk, index) => (
          <div
            className="record-card"
            key={risk.id || `${risk.date}-${index}`}
          >
            <div className="record-header">
              <strong>
                排查记录{index + 1}
              </strong>

              {normalizeRiskStatus(
                firstDefined(
                  risk.hasRisk,
                  risk.status,
                ),
              ) === '是' ? (
                <Tag color="error">
                  有风险
                </Tag>
              ) : (
                <Tag color="success">
                  无风险
                </Tag>
              )}
            </div>

            <div>
              <b>排查日期：</b>
              {risk.date || '未填写日期'}
            </div>

            {risk.description && (
              <div>
                <b>风险隐患：</b>
                {risk.description}
              </div>
            )}

            {risk.handling && (
              <div>
                <b>处置情况：</b>
                {risk.handling}
              </div>
            )}

            <div>
              <b>排查人：</b>
              {risk.inspector || '—'}
            </div>

            {risk.remark && (
              <div>
                <b>备注：</b>
                {risk.remark}
              </div>
            )}
          </div>
        ))
      ) : (
        <Text type="secondary">
          暂无风险排查记录
        </Text>
      )}
    </div>
  )
}

export { RiskRecords }