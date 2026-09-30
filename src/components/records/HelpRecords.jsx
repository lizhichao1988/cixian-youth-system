import { Empty } from 'antd'

function HelpRecords({ helpRecords }) {
  const records = Array.isArray(helpRecords)
    ? helpRecords
    : []

  if (records.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无帮扶记录"
      />
    )
  }

  return (
    <div>
      {records.map((item, index) => (
        <div
          className="record-card"
          key={
            item.id ||
            `${item.date || ''}-${index}`
          }
        >
          <div className="record-header">
            <strong>
              {item.date || '未填写日期'}
            </strong>
          </div>

          {item.method && (
            <div>
              <b>帮扶方式：</b>
              {item.method}
            </div>
          )}

          {item.content && (
            <div>
              <b>帮扶内容：</b>
              {item.content}
            </div>
          )}

          {item.material && (
            <div>
              <b>帮扶物资：</b>
              {item.material}
            </div>
          )}

          {item.amount !== undefined &&
            item.amount !== null &&
            item.amount !== '' && (
              <div>
                <b>帮扶金额：</b>
                {item.amount}
              </div>
            )}

          {item.contact && (
            <div>
              <b>帮扶联系人：</b>
              {item.contact}
            </div>
          )}

          {item.remark && (
            <div>
              <b>备注：</b>
              {item.remark}
            </div>
          )}

          {item.photo && (
            <div>
              <b>帮扶照片：</b>
              {item.photo}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export { HelpRecords }