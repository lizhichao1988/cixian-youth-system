import {
  useEffect,
  useState,
} from 'react'

import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Select,
  Space,
} from 'antd'

import dayjs from 'dayjs'

/*
 * ============================================================
 * 风险排查记录新增表单
 * ============================================================
 *
 * 这个组件只负责：
 *
 * 1. 显示“新增风险排查记录”表单
 * 2. 接收当前青少年信息
 * 3. 接收打开 / 关闭状态
 * 4. 收集表单数据
 * 5. 把表单数据交给父组件保存
 *
 * 它不直接调用 fetch。
 *
 * 数据保存由父组件负责，
 * 最终通过 youthApi.js 中的：
 *
 *     createRiskRecord()
 *
 * 写入后端。
 *
 * ============================================================
 */

export function RiskRecordForm({
  open = false,

  youth = null,

  saving = false,

  /**
   * 编辑模式下传入的原有风险排查记录。
   *
   * 为空表示“新增”。
   */
  record = null,

  onClose,

  onSubmit,
}) {
  /*
   * ==========================================================
   * Ant Design Form
   * ==========================================================
   */
  const [form] =
    Form.useForm()

  /*
   * ==========================================================
   * 打开新增表单时初始化默认值
   * ==========================================================
   *
   * 排查日期默认今天。
   *
   * 是否存在风险默认“否”。
   *
   * 其他字段为空。
   * ==========================================================
   */
  useEffect(() => {
    if (!open) {
      return
    }

    /**
     * 编辑模式：
     *
     * 用原记录填充表单。
     */
    if (record) {
      form.setFieldsValue({
        date: record.date
          ? dayjs(record.date)
          : dayjs(),

        hasRisk:
          record.status ||
          record.hasRisk ||
          '否',

        description:
          record.description ||
          '',

        handling:
          record.handling ||
          '',

        inspector:
          record.inspector ||
          '',

        remark:
          record.remark || '',
      })

      return
    }

    /**
     * 新增模式：
     *
     * 排查日期默认今天，
     * 是否存在风险默认“否”。
     */
    form.setFieldsValue({
      date: dayjs(),
      hasRisk: '否',
      description: '',
      handling: '',
      inspector: '',
      remark: '',
    })
  }, [
    open,
    form,
    record,
  ])

  /*
   * ==========================================================
   * 表单提交
   * ==========================================================
   */
  const handleFinish = async (
    values,
  ) => {
    /*
     * 排查日期统一转换为：
     *
     * YYYY-MM-DD
     *
     * 后端风险表使用这个格式保存。
     */
    const date =
      values.date
        ? values.date.format(
            'YYYY-MM-DD',
          )
        : ''

    const risk = {
      date,

      hasRisk:
        values.hasRisk ||
        '否',

      status:
        values.hasRisk ||
        '否',

      description:
        values.description ||
        '',

      handling:
        values.handling ||
        '',

      inspector:
        values.inspector ||
        '',

      remark:
        values.remark ||
        '',
    }

    /*
     * 把整理好的数据交给父组件。
     *
     * 这里不直接调用 API。
     */
    if (onSubmit) {
      await onSubmit(risk)
    }
  }

  /*
   * ==========================================================
   * 关闭抽屉
   * ==========================================================
   */
  const handleClose = () => {
    if (saving) {
      return
    }

    form.resetFields()

    if (onClose) {
      onClose()
    }
  }

  /*
   * ==========================================================
   * 当前青少年姓名
   * ==========================================================
   */
  const youthName =
    youth?.name ||
    '未命名'

  return (
    <Drawer
      title={`${
        record ? '编辑' : '新增'
      }${youthName}的风险排查记录`}
      open={open}
      onClose={handleClose}
      width={520}
      destroyOnClose
      maskClosable={!saving}
      closable={!saving}
      extra={
        <Space>
          <Button
            onClick={handleClose}
            disabled={saving}
          >
            取消
          </Button>

          <Button
            type="primary"
            loading={saving}
            onClick={() =>
              form.submit()
            }
          >
            保存
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
      >
        {/* ==================================================
            排查日期
            ================================================== */}
        <Form.Item
          label="排查日期"
          name="date"
          rules={[
            {
              required: true,
              message:
                '请选择排查日期',
            },
          ]}
        >
          <DatePicker
            style={{
              width: '100%',
            }}
            format="YYYY-MM-DD"
            placeholder="请选择排查日期"
          />
        </Form.Item>


        {/* ==================================================
            是否存在风险
            ================================================== */}
        <Form.Item
          label="是否存在风险"
          name="hasRisk"
          rules={[
            {
              required: true,
              message:
                '请选择是否存在风险',
            },
          ]}
        >
          <Select
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


        {/* ==================================================
            风险隐患描述
            ================================================== */}
        <Form.Item
          label="风险隐患描述"
          name="description"
        >
          <Input.TextArea
            rows={5}
            placeholder="请输入风险隐患描述"
            showCount
            maxLength={1000}
          />
        </Form.Item>


        {/* ==================================================
            处置情况
            ================================================== */}
        <Form.Item
          label="处置情况"
          name="handling"
        >
          <Input.TextArea
            rows={5}
            placeholder="请输入风险处置情况"
            showCount
            maxLength={1000}
          />
        </Form.Item>


        {/* ==================================================
            排查人
            ================================================== */}
        <Form.Item
          label="排查人"
          name="inspector"
        >
          <Input
            placeholder="请输入排查人姓名"
            maxLength={100}
          />
        </Form.Item>


        {/* ==================================================
            备注
            ================================================== */}
        <Form.Item
          label="备注"
          name="remark"
        >
          <Input.TextArea
            rows={3}
            placeholder="请输入备注信息"
            showCount
            maxLength={500}
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}