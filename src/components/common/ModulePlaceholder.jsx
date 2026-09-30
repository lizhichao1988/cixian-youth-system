import { Card, Empty } from 'antd'

function ModulePlaceholder({
  activePage,
}) {
  const descriptions = {
    risk: '风险排查模块即将建设',
    helpManage: '帮扶管理模块即将建设',
    statistics: '数据统计模块即将建设',
    system: '系统管理模块即将建设',
  }

  return (
    <Card className="empty-module">
      <Empty
        description={
          descriptions[activePage] ||
          '功能模块即将建设'
        }
      />
    </Card>
  )
}

export { ModulePlaceholder }
