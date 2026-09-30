import { Empty } from 'antd'

function EmptyState({
  description = '暂无数据',
}) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={description}
    />
  )
}

export { EmptyState }