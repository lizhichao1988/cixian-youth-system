
/* =========================================================
首页工作台页面，包括以下功能
    青少年总人数
    重点托底类
    常态关爱类
    成长托举类
    风险排查概况
    快捷入口
   ========================================================= */
import {
  Button,
  Card,
  Col,
  Row,
  Space,
  Statistic,
  Typography,
} from 'antd'

const { Title, Text } = Typography

function Dashboard({
  statistics,
  riskStatistics,
  onYouth,
  onHelp,
}) {
  return (
    <>
      <div className="page-header">
        <div>
          <Title level={2}>
            首页工作台
          </Title>

          <Text type="secondary">
            磁县精准帮扶困难青少年数据总览
          </Text>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col
          xs={24}
          sm={12}
          lg={6}
        >
          <Card className="stat-card">
            <Statistic
              title="青少年总人数"
              value={
                statistics.total
              }
              suffix="人"
            />
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          lg={6}
        >
          <Card className="stat-card">
            <Statistic
              title="重点托底类"
              value={
                statistics.top
              }
              suffix="人"
            />
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          lg={6}
        >
          <Card className="stat-card">
            <Statistic
              title="常态关爱类"
              value={
                statistics.normal
              }
              suffix="人"
            />
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          lg={6}
        >
          <Card className="stat-card">
            <Statistic
              title="成长托举类"
              value={
                statistics.growth
              }
              suffix="人"
            />
          </Card>
        </Col>
      </Row>

      <Card
        className="dashboard-card"
        title="风险排查概况"
      >
        <Space
          size="large"
          wrap
        >
          <span>
            有风险：
            <strong>
              {
                riskStatistics.hasRisk
              }
            </strong>
            人
          </span>

          <span>
            无风险：
            <strong>
              {
                riskStatistics.noRisk
              }
            </strong>
            人
          </span>

          <span>
            未排查：
            <strong>
              {
                riskStatistics.unchecked
              }
            </strong>
            人
          </span>
        </Space>
      </Card>

      <Card
        className="dashboard-card"
        title="快捷入口"
      >
        <Space wrap>
          <Button
            type="primary"
            onClick={onYouth}
          >
            青少年信息
          </Button>

          <Button
            onClick={onHelp}
          >
            需帮扶人员信息
          </Button>
        </Space>
      </Card>
    </>
  )
}

export { Dashboard }
