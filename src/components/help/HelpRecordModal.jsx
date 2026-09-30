/**
 * ============================================================
 * 帮扶记录表单弹窗
 * ============================================================
 *
 * 三种记录共用一个弹窗：
 *
 *     pairings       结对帮扶信息
 *     help-needs     帮扶需求
 *     help-records   帮扶记录
 *
 * 新增和编辑共用。
 *
 * 照片只在 help-records 下出现。
 * 照片不会在弹窗里直接上传，
 * 而是收集成文件列表交给父组件，
 * 等记录保存成功拿到 ID 之后再上传。
 *
 * 因为上传照片需要记录 ID，
 * 新增时此刻还没有 ID。
 * ============================================================
 */

import { useEffect, useState } from 'react'

import {
  DatePicker,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Upload,
} from 'antd'

import {
  CloseCircleFilled,
} from '@ant-design/icons'

import dayjs from 'dayjs'

import {
  buildPhotoThumbUrl,
  buildPhotoUrl,
  HELP_METHOD_OPTIONS,
  HELP_NEED_TYPES,
  PAIRED_OPTIONS,
  PAIRING_STATUS_OPTIONS,
  removeHelpPhoto,
  RESOLVED_OPTIONS,
} from '../../api/helpApi'

/* ============================================================
   字段配置
   ============================================================ */
const FIELD_CONFIG = {
  pairings: [
    {
      key: 'paired',
      label: '是否结对帮扶',
      type: 'select',
      options: PAIRED_OPTIONS,
      required: true,
    },
    {
      key: 'contact',
      label: '结对帮扶人',
      type: 'text',
    },
    {
      key: 'phone',
      label: '联系电话',
      type: 'text',
    },
    {
      key: 'unit',
      label: '所属单位',
      type: 'text',
    },
    {
      key: 'startDate',
      label: '开始日期',
      type: 'date',
    },
    {
      key: 'endDate',
      label: '结束日期',
      type: 'date',
    },
    {
      key: 'status',
      label: '帮扶状态',
      type: 'select',
      options: PAIRING_STATUS_OPTIONS,
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
    },
  ],

  'help-needs': [
    {
      key: 'type',
      label: '需求类型',
      type: 'select',
      options: HELP_NEED_TYPES,
    },
    {
      key: 'description',
      label: '需求描述',
      type: 'textarea',
    },
    {
      key: 'resolved',
      label: '是否已解决',
      type: 'select',
      options: RESOLVED_OPTIONS,
    },
    {
      key: 'date',
      label: '提出日期',
      type: 'date',
    },
    {
      key: 'resolvedDate',
      label: '解决日期',
      type: 'date',
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
    },
  ],

  'help-records': [
    {
      key: 'date',
      label: '帮扶日期',
      type: 'date',
      required: true,
    },
    {
      key: 'method',
      label: '帮扶方式',
      type: 'select',
      options: HELP_METHOD_OPTIONS,
    },
    {
      key: 'content',
      label: '帮扶内容',
      type: 'textarea',
    },
    {
      key: 'material',
      label: '帮扶物资',
      type: 'text',
    },
    {
      key: 'amount',
      label: '帮扶金额（元）',
      type: 'number',
    },
    {
      key: 'contact',
      label: '帮扶联系人',
      type: 'text',
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
    },
  ],
}

const KIND_LABEL = {
  pairings: '结对帮扶信息',
  'help-needs': '帮扶需求',
  'help-records': '帮扶记录',
}

function buildEmptyValues(kind) {
  const config = FIELD_CONFIG[kind] || []

  const values = {}

  config.forEach((field) => {
    values[field.key] = ''
  })

  return values
}

function HelpRecordModal({
  open,
  kind,
  record,
  youthName,
  saving,
  onCancel,
  onSubmit,
  onPhotosChanged,
  notify,
}) {
  const [values, setValues] = useState({})

  /**
   * 待上传的照片文件。
   *
   * 每一项是浏览器原生的 File 对象。
   */
  const [photoFiles, setPhotoFiles] =
    useState([])

  /**
   * 数据库里已经存在的照片。
   *
   * 编辑时要把它们显示出来，
   * 并且每张右上角带一个红叉，
   * 点红叉可以删除这张照片。
   */
  const [
    existingPhotos,
    setExistingPhotos,
  ] = useState([])

  /**
   * 正在删除的照片的附件 ID。
   */
  const [
    deletingPhotoId,
    setDeletingPhotoId,
  ] = useState('')

  /**
   * 每次打开弹窗时重置表单。
   */
  useEffect(() => {
    if (!open) {
      return
    }

    if (record) {
      const next = buildEmptyValues(kind)

      Object.keys(next).forEach((key) => {
        next[key] =
          record[key] === undefined ||
          record[key] === null
            ? ''
            : record[key]
      })

      /**
       * “是否已解决”历史值兼容。
       */
      if (next.resolved === '否') {
        next.resolved = '未解决'
      }

      if (next.resolved === '是') {
        next.resolved = '已解决'
      }

      setValues(next)

      /**
       * 已有照片。
       */
      setExistingPhotos(
        Array.isArray(
          record.photos,
        )
          ? record.photos
          : [],
      )
    } else {
      setValues(buildEmptyValues(kind))

      setExistingPhotos([])
    }

    setPhotoFiles([])
    setDeletingPhotoId('')
  }, [open, kind, record])

  /**
   * ==========================================================
   * 删除一张已有照片
   * ==========================================================
   *
   * 只有编辑、且记录已经存在于数据库时才能删。
   */
  async function handleRemoveExistingPhoto(
    photo,
    index,
  ) {
    const recordId =
      record?.id

    if (!recordId) {
      return
    }

    const photoId = String(
      photo?.id ?? '',
    )

    setDeletingPhotoId(
      photoId || `index-${index}`,
    )

    try {
      const result =
        await removeHelpPhoto(
          recordId,
          {
            photoId,
            index,
          },
        )

      /**
       * 后端返回删除以后剩下的照片，
       * 直接用它刷新界面，保证和后端一致。
       */
      setExistingPhotos(
        Array.isArray(result?.photos)
          ? result.photos
          : [],
      )

      if (
        typeof notify ===
        'function'
      ) {
        notify.success('照片已删除')
      }

      /**
       * 通知父组件刷新列表，
       * 让右侧详情里的照片也同步消失。
       */
      if (
        typeof onPhotosChanged ===
        'function'
      ) {
        onPhotosChanged()
      }
    } catch (error) {
      if (
        typeof notify ===
        'function'
      ) {
        notify.error(
          error?.message ||
            '删除照片失败',
        )
      }
    } finally {
      setDeletingPhotoId('')
    }
  }

  function setField(key, value) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handleSubmit() {
    /**
     * 必填校验。
     */
    const config = FIELD_CONFIG[kind] || []

    const missing = config.find(
      (field) =>
        field.required &&
        String(
          values[field.key] ?? '',
        ).trim() === '',
    )

    if (missing) {
      onSubmit({
        invalid: true,
        message: `请填写「${missing.label}」`,
      })

      return
    }

    onSubmit({
      invalid: false,
      values,
      photoFiles,
    })
  }

  function renderField(field) {
    const value = values[field.key] ?? ''

    if (field.type === 'select') {
      return (
        <Select
          value={value || undefined}
          placeholder={`请选择${field.label}`}
          allowClear
          onChange={(next) =>
            setField(
              field.key,
              next || '',
            )
          }
          options={field.options.map(
            (option) => ({
              value: option,
              label: option,
            }),
          )}
          style={{ width: '100%' }}
        />
      )
    }

    if (field.type === 'date') {
      return (
        <DatePicker
          value={
            value
              ? dayjs(value)
              : null
          }
          placeholder="请选择日期"
          style={{ width: '100%' }}
          onChange={(next) =>
            setField(
              field.key,
              next
                ? next.format(
                    'YYYY-MM-DD',
                  )
                : '',
            )
          }
        />
      )
    }

    if (field.type === 'number') {
      return (
        <InputNumber
          value={
            value === '' ||
            value === null
              ? null
              : Number(value)
          }
          min={0}
          placeholder="请输入金额"
          style={{ width: '100%' }}
          onChange={(next) =>
            setField(
              field.key,
              next === null ||
                next === undefined
                ? ''
                : String(next),
            )
          }
        />
      )
    }

    if (field.type === 'textarea') {
      return (
        <Input.TextArea
          value={value}
          rows={3}
          placeholder={`请输入${field.label}`}
          onChange={(event) =>
            setField(
              field.key,
              event.target.value,
            )
          }
        />
      )
    }

    return (
      <Input
        value={value}
        placeholder={`请输入${field.label}`}
        onChange={(event) =>
          setField(
            field.key,
            event.target.value,
          )
        }
      />
    )
  }

  const config = FIELD_CONFIG[kind] || []

  const isEdit = Boolean(record)

  return (
    <Modal
      open={open}
      title={
        (isEdit ? '编辑' : '新增') +
        (KIND_LABEL[kind] || '帮扶记录') +
        (youthName
          ? `（${youthName}）`
          : '')
      }
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={handleSubmit}
      destroyOnHidden
      width={620}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {config.map((field) => (
          <div key={field.key}>
            <div
              style={{
                marginBottom: 6,
                fontSize: 13,
                color: '#555',
              }}
            >
              {field.required && (
                <span
                  style={{
                    color: '#ff4d4f',
                    marginRight: 4,
                  }}
                >
                  *
                </span>
              )}

              {field.label}
            </div>

            {renderField(field)}
          </div>
        ))}

        {/* 照片上传：仅帮扶记录 */}
        {kind === 'help-records' && (
          <div>
            <div
              style={{
                marginBottom: 6,
                fontSize: 13,
                color: '#555',
              }}
            >
              帮扶照片
            </div>

            {/* 已有照片：编辑时显示，右上角红叉可删除 */}
            {isEdit &&
              existingPhotos.length >
                0 && (
                <div
                  style={{
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: '#999',
                      marginBottom: 6,
                    }}
                  >
                    已上传 {existingPhotos.length} 张（点击红叉可删除）
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    {existingPhotos.map(
                      (photo, index) => (
                        <div
                          key={
                            photo.id ||
                            index
                          }
                          style={{
                            position:
                              'relative',
                            width: 90,
                            height: 90,
                          }}
                        >
                          <Image
                            src={buildPhotoThumbUrl(
                              photo,
                            )}
                            preview={{
                              src: buildPhotoUrl(
                                photo,
                              ),
                            }}
                            alt={
                              photo.title ||
                              '帮扶照片'
                            }
                            width={90}
                            height={90}
                            style={{
                              objectFit:
                                'cover',
                              borderRadius: 6,
                              border:
                                '1px solid #f0f0f0',
                              cursor:
                                'zoom-in',
                            }}
                          />

                          <Popconfirm
                            title="删除这张照片"
                            description="删除后不可恢复，确定删除吗？"
                            okText="确定删除"
                            cancelText="取消"
                            okButtonProps={{
                              danger: true,
                            }}
                            onConfirm={() =>
                              handleRemoveExistingPhoto(
                                photo,
                                index,
                              )
                            }
                          >
                            <CloseCircleFilled
                              style={{
                                position:
                                  'absolute',
                                top: -6,
                                right: -6,
                                fontSize: 18,
                                color:
                                  '#ff4d4f',
                                background:
                                  '#fff',
                                borderRadius:
                                  '50%',
                                cursor:
                                  'pointer',
                                opacity:
                                  deletingPhotoId ===
                                  (photo.id ||
                                    `index-${index}`)
                                    ? 0.4
                                    : 1,
                              }}
                            />
                          </Popconfirm>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

            <Upload
              listType="picture-card"
              accept="image/*"
              fileList={photoFiles.map(
                (file, index) => ({
                  uid: String(index),
                  name: file.name,
                  status: 'done',
                  url: URL.createObjectURL(
                    file,
                  ),
                }),
              )}
              beforeUpload={(file) => {
                setPhotoFiles(
                  (current) => [
                    ...current,
                    file,
                  ],
                )

                /**
                 * 阻止自动上传。
                 *
                 * 真正上传发生在保存成功之后。
                 */
                return false
              }}
              onRemove={(file) => {
                setPhotoFiles(
                  (current) =>
                    current.filter(
                      (_, index) =>
                        String(
                          index,
                        ) !==
                        file.uid,
                    ),
                )
              }}
            >
              {photoFiles.length >= 9
                ? null
                : '+ 上传'}
            </Upload>

            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: '#999',
              }}
            >
              保存记录后自动上传，最多 9 张
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export { HelpRecordModal }
