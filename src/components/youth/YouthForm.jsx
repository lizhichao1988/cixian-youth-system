
/* =========================================================
   新增/编辑人员
   ========================================================= */
import { useEffect, useState } from 'react'

import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Typography,
  DatePicker,
  Popconfirm,
} from 'antd'

import dayjs from 'dayjs'

import {
  getPrimaryCategoryGroup,
  getCategoryValue,
  normalizeHelpRequired,
} from '../../utils/categoryUtils'

import {
  normalizeRiskStatus,
} from '../../utils/riskUtils'

import {
  firstDefined,
} from '../../utils/youthUtils'

import {
  normalizePairingStatus,
} from '../../utils/pairingUtils'

const { Text } = Typography

function YouthForm({
  record,
  onChange,
  categoryGroups,
}){
  const [
    selectedBigCategory,
    setSelectedBigCategory,
  ] = useState(() =>
    getPrimaryCategoryGroup(
      record.categories,
      record.bigCategory,
    ),
  )

  const helpRequired =
    normalizeHelpRequired(
      record.helpRequired,
    ) || '否'

  const helpEnabled =
    helpRequired === '是'

  /**
   * 帮扶联系人 / 联系电话 / 工作单位
   * 只在“是否需要结对帮扶 = 是”时才能编辑。
   *
   * 选“否”时这三项自动禁用。
   */
  const pairingEnabled =
    normalizePairingStatus(
      record.pairing,
    ) === '是'

  useEffect(() => {
    setSelectedBigCategory(
      getPrimaryCategoryGroup(
        record.categories,
        record.bigCategory,
      ),
    )
  }, [
    record.key,
    record.categories,
    record.bigCategory,
    getPrimaryCategoryGroup,
  ])

  const currentSmallCategories =
    selectedBigCategory
      ? categoryGroups[
          selectedBigCategory
        ] || []
      : []

  function handleBigCategoryChange(
    value,
  ) {
    setSelectedBigCategory(value)

    onChange(
      'bigCategory',
      value,
    )

    onChange(
      'categories',
      '',
    )
  }

  function addRisk() {
    const risks =
      Array.isArray(
        record.risks,
      )
        ? record.risks
        : []

    onChange('risks', [
      ...risks,
      {
        id: '',
        date: new Date()
          .toISOString()
          .slice(0, 10),
        hasRisk: '否',
        status: '否',
        description: '',
        handling: '',
        inspector: '',
        remark: '',
      },
    ])
  }

  function updateRisk(
    index,
    field,
    value,
  ) {
    const risks =
      Array.isArray(
        record.risks,
      )
        ? record.risks
        : []

    const next =
      risks.map(
        (
          risk,
          riskIndex,
        ) =>
          riskIndex === index
            ? {
                ...risk,
                [field]:
                  value,
              }
            : risk,
      )

    if (
      field === 'status' ||
      field === 'hasRisk'
    ) {
      const normalized =
        normalizeRiskStatus(
          value,
        )

      next[index] = {
        ...next[index],
        hasRisk:
          normalized,
        status:
          normalized,
      }
    }

    onChange(
      'risks',
      next,
    )
  }

  function deleteRisk(index) {
    const risks =
      Array.isArray(
        record.risks,
      )
        ? record.risks
        : []

    onChange(
      'risks',
      risks.filter(
        (
          _,
          riskIndex,
        ) =>
          riskIndex !==
          index,
      ),
    )
  }

  return (
    <Form layout="vertical">
      <Form.Item label="姓名">
        <Input
          value={
            record.name
          }
          onChange={(e) =>
            onChange(
              'name',
              e.target.value,
            )
          }
        />
      </Form.Item>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="性别">
            <Select
              value={
                record.gender
              }
              onChange={(
                value,
              ) =>
                onChange(
                  'gender',
                  value,
                )
              }
              options={[
                {
                  value: '男',
                  label: '男',
                },
                {
                  value: '女',
                  label: '女',
                },
              ]}
            />
          </Form.Item>
        </Col>

        <Col span={12}>
          <Form.Item label="出生年月">
            <DatePicker
              picker="month"
              value={
                record.birthday
                  ? dayjs(record.birthday)
                  : null
              }
              format="YYYY-MM"
              placeholder="请选择出生年月"
              onChange={(date) =>
                onChange(
                  'birthday',
                  date
                    ? date.startOf('month').format('YYYY-MM-DD')
                    : ''
                )
              }
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item label="政治面貌">
        <Select
          value={record.political || undefined}
          placeholder="请选择政治面貌"
          onChange={(value) =>
            onChange('political', value)
          }
          options={[
            {
              value: '群众',
              label: '群众',
            },
            {
              value: '共青团员',
              label: '共青团员',
            },
            {
              value: '中共党员',
              label: '中共党员',
            },
            {
              value: '中共预备党员',
              label: '中共预备党员',
            },
          ]}
        />
      </Form.Item>

      <Form.Item label="户籍地址">
        <Input
          value={
            record.household
          }
          onChange={(e) =>
            onChange(
              'household',
              e.target.value,
            )
          }
        />
      </Form.Item>

      <Form.Item label="常住地址">
        <Input
          value={
            record.residence
          }
          onChange={(e) =>
            onChange(
              'residence',
              e.target.value,
            )
          }
        />
      </Form.Item>

      <Form.Item label="个人基本情况">
        <Input.TextArea
          rows={4}
          value={
            record.basic
          }
          onChange={(e) =>
            onChange(
              'basic',
              e.target.value,
            )
          }
        />
      </Form.Item>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="联系方式">
            <Input
              value={
                record.phone
              }
              onChange={(e) =>
                onChange(
                  'phone',
                  e.target.value,
                )
              }
            />
          </Form.Item>
        </Col>

        <Col span={12}>
          <Form.Item label="监护人姓名">
            <Input
              value={
                record.guardian
              }
              onChange={(e) =>
                onChange(
                  'guardian',
                  e.target.value,
                )
              }
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item label="监护人联系方式">
        <Input
          value={
            record.guardianPhone
          }
          onChange={(e) =>
            onChange(
              'guardianPhone',
              e.target.value,
            )
          }
        />
      </Form.Item>

      <Form.Item label="困难大类">
        <Select
          value={
            selectedBigCategory ||
            undefined
          }
          placeholder="请选择困难大类"
          onChange={
            handleBigCategoryChange
          }
          options={Object.keys(
            categoryGroups,
          ).map((item) => ({
            value: item,
            label: item,
          }))}
        />
      </Form.Item>

      <Form.Item label="困难小类">
        <Select
          value={
            getCategoryValue(
              record.categories,
            ) || undefined
          }
          disabled={
            !selectedBigCategory
          }
          placeholder={
            selectedBigCategory
              ? '请选择困难小类'
              : '请先选择困难大类'
          }
          onChange={(value) =>
            onChange(
              'categories',
              value || '',
            )
          }
          options={currentSmallCategories.map(
            (category) => ({
              value: category,
              label: category,
            }),
          )}
        />
      </Form.Item>

      <Form.Item label="风险排查情况">
        <Card
          size="small"
          style={{
            background:
              '#fafafa',
          }}
        >
          <Space
            direction="vertical"
            style={{
              width: '100%',
            }}
          >
            {record.risks.length ===
            0 ? (
              <Text type="secondary">
                暂无风险排查记录
              </Text>
            ) : (
              record.risks.map(
                (
                  risk,
                  index,
                ) => (
                  <Card
                    key={
                      risk.id ||
                      `${risk.date}-${index}`
                    }
                    size="small"
                    title={`排查记录${index + 1}`}
                    extra={
                      <Popconfirm
                        title="确定删除这条风险排查记录吗？"
                        description="删除后不可恢复，请确认。"
                        okText="确定删除"
                        cancelText="取消"
                        okButtonProps={{
                          danger: true,
                        }}
                        onConfirm={() =>
                          deleteRisk(
                            index,
                          )
                        }
                      >
                        <Button
                          danger
                          type="link"
                        >
                          删除
                        </Button>
                      </Popconfirm>
                    }
                  >
                    <Form.Item label="排查日期">
                      <Input
                        value={
                          risk.date ||
                          ''
                        }
                        onChange={(
                          e,
                        ) =>
                          updateRisk(
                            index,
                            'date',
                            e.target
                              .value,
                          )
                        }
                      />
                    </Form.Item>

                    <Form.Item label="是否存在风险">
                      <Select
                        value={
                          normalizeRiskStatus(
                            firstDefined(
                              risk.hasRisk,
                              risk.status,
                            ),
                          ) ||
                          undefined
                        }
                        onChange={(
                          value,
                        ) =>
                          updateRisk(
                            index,
                            'hasRisk',
                            value,
                          )
                        }
                        options={[
                          {
                            value:
                              '否',
                            label:
                              '否',
                          },
                          {
                            value:
                              '是',
                            label:
                              '是',
                          },
                        ]}
                      />
                    </Form.Item>

                    <Form.Item label="风险隐患描述">
                      <Input.TextArea
                        rows={3}
                        value={
                          risk.description ||
                          ''
                        }
                        onChange={(
                          e,
                        ) =>
                          updateRisk(
                            index,
                            'description',
                            e.target
                              .value,
                          )
                        }
                      />
                    </Form.Item>

                    <Form.Item label="处置情况">
                      <Input.TextArea
                        rows={3}
                        value={
                          risk.handling ||
                          ''
                        }
                        onChange={(
                          e,
                        ) =>
                          updateRisk(
                            index,
                            'handling',
                            e.target
                              .value,
                          )
                        }
                      />
                    </Form.Item>

                    <Form.Item label="排查人">
                      <Input
                        value={
                          risk.inspector ||
                          ''
                        }
                        onChange={(
                          e,
                        ) =>
                          updateRisk(
                            index,
                            'inspector',
                            e.target
                              .value,
                          )
                        }
                      />
                    </Form.Item>

                    <Form.Item label="备注">
                      <Input
                        value={
                          risk.remark ||
                          ''
                        }
                        onChange={(
                          e,
                        ) =>
                          updateRisk(
                            index,
                            'remark',
                            e.target
                              .value,
                          )
                        }
                      />
                    </Form.Item>
                  </Card>
                ),
              )
            )}

            <Button
              type="dashed"
              block
              onClick={addRisk}
            >
              + 新增一次风险排查
            </Button>
          </Space>
        </Card>
      </Form.Item>

      <Form.Item label="是否需要帮扶">
        <Select
          value={
            helpRequired
          }
          onChange={(value) =>
            onChange(
              'helpRequired',
              value,
            )
          }
          options={[
            {
              value: '是',
              label: '是',
            },
            {
              value: '否',
              label: '否',
            },
          ]}
        />
      </Form.Item>

      <Form.Item label="帮扶需求">
        <Input
          disabled={
            !helpEnabled
          }
          value={
            record.helpNeed ===
            '暂无'
              ? ''
              : record.helpNeed
          }
          placeholder={
            helpEnabled
              ? '请输入实际帮扶需求，没有需求请留空'
              : '当前选择“不需要帮扶”，此项不可编辑'
          }
          onChange={(e) =>
            onChange(
              'helpNeed',
              e.target.value.trim()
                ? e.target.value
                : '暂无',
            )
          }
        />
      </Form.Item>

      <Form.Item label="是否需要结对帮扶">
        <Select
          disabled={
            !helpEnabled
          }
          value={
            normalizePairingStatus(
              record.pairing,
            ) || '否'
          }
          onChange={(value) =>
            onChange(
              'pairing',
              value,
            )
          }
          options={[
            {
              value: '是',
              label: '是',
            },
            {
              value: '否',
              label: '否',
            },
          ]}
        />
      </Form.Item>

      <Form.Item label="帮扶联系人">
        <Input
          disabled={
            !pairingEnabled
          }
          value={
            record.pairingContact
          }
          placeholder={
            pairingEnabled
              ? '请输入帮扶联系人'
              : '当前选择“不需要结对帮扶”，此项不可编辑'
          }
          onChange={(e) =>
            onChange(
              'pairingContact',
              e.target.value,
            )
          }
        />
      </Form.Item>

      <Form.Item label="联系电话">
        <Input
          disabled={
            !pairingEnabled
          }
          value={
            record.pairingPhone
          }
          placeholder={
            pairingEnabled
              ? '请输入联系电话'
              : '当前选择“不需要结对帮扶”，此项不可编辑'
          }
          onChange={(e) =>
            onChange(
              'pairingPhone',
              e.target.value,
            )
          }
        />
      </Form.Item>

      <Form.Item label="工作单位">
        <Input
          disabled={
            !pairingEnabled
          }
          value={
            record.pairingUnit
          }
          placeholder={
            pairingEnabled
              ? '请输入工作单位'
              : '当前选择“不需要结对帮扶”，此项不可编辑'
          }
          onChange={(e) =>
            onChange(
              'pairingUnit',
              e.target.value,
            )
          }
        />
      </Form.Item>

      <Form.Item label="备注">
        <Input.TextArea
          rows={3}
          value={
            record.remark
          }
          onChange={(e) =>
            onChange(
              'remark',
              e.target.value,
            )
          }
        />
      </Form.Item>
    </Form>
  )
}

export { YouthForm }