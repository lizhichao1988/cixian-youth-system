/**
 * =========================================================
 * 帮扶管理
 * =========================================================
 *
 * 页面结构：
 *
 *     1. 顶部：搜索框 + 筛选区
 *     2. 统计条：共计 / 需要帮扶 / 三大类 / 已结对
 *     3. 左下：青少年列表（分页，可点选）
 *     4. 右下：该青少年的
 *              结对帮扶信息
 *              帮扶需求
 *              帮扶记录
 *        每一条都可以 新增 / 编辑 / 删除
 *
 * 删除统一带二次确认，
 * 确认后才真正调用后端删除。
 * =========================================================
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  Button,
  Card,
  Col,
  Empty,
  Image,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'

import {
  buildPhotoThumbUrl,
  buildPhotoUrl,
  createHelpRecord,
  deleteHelpRecord,
  displayResolved,
  fetchHelpRecords,
  updateHelpRecord,
  uploadHelpPhoto,
} from '../../api/helpApi'

import {
  requestJson,
} from '../../api/http'

import {
  mergeYouthCache,
  getCachedYouth,
  consumePendingShowYouth,
} from '../../store/youthCache'

import {
  HelpRecordModal,
} from './HelpRecordModal'

const { Text } = Typography

/**
 * 三类记录的中文名。
 */
const KIND_LABEL = {
  pairings: '结对帮扶信息',
  'help-needs': '帮扶需求',
  'help-records': '帮扶记录',
}

const KINDS = [
  'pairings',
  'help-needs',
  'help-records',
]

/**
 * 三大类配色。
 *
 * 色值必须与青少年信息页（App.css 的 dot 样式）
 * 完全一致：
 *
 *     重点托底类  #ff4d4f  红
 *     常态关爱类  #fadb14  黄
 *     成长托举类  #52c41a  绿
 */
const CATEGORY_COLOR = {
  重点托底类: '#ff4d4f',
  常态关爱类: '#fadb14',
  成长托举类: '#52c41a',
}

/**
 * 磁县全部乡镇 / 社区。
 *
 * 这是固定的行政区划，
 * 不再从数据里现算，
 * 避免数据里写法不统一导致选项忽多忽少。
 */
const TOWN_OPTIONS = [
  '磁州镇',
  '讲武城镇',
  '路村营镇',
  '时村营镇',
  '白土镇',
  '岳城镇',
  '陶泉乡',
  '北贾璧乡',
  '黄沙镇',
  '观台镇',
  '都党乡',
  '社区',
]

/**
 * 从地址里匹配乡镇 / 社区。
 *
 * 先匹配“镇 / 乡”，
 * 都没有再判断是不是“社区”。
 *
 * 例如：
 *
 *     邯郸市磁县磁州镇务本社区   ->  磁州镇
 *     邯郸市磁县某某社区         ->  社区
 */
function extractTown(text) {
  if (!text) {
    return ''
  }

  const value =
    String(text)

  for (const town of TOWN_OPTIONS) {
    if (
      town !== '社区' &&
      value.includes(town)
    ) {
      return town
    }
  }

  if (value.includes('社区')) {
    return '社区'
  }

  return ''
}

/**
 * 测量某个 DOM 元素的内容高度（随容器变化实时更新）。
 *
 * 用于让左侧表格的滚动区精确撑满父容器，
 * 而不是用「视口高度 - 固定偏移」这种容易算错的方式
 * （一旦筛选区 / 统计条的实际高度和假设不一致，
 * 表格就会比可用空间短一截，底部留出空白）。
 */
function useMeasuredHeight() {
  const ref = useRef(null)
  const [height, setHeight] =
    useState(0)

  useEffect(() => {
    const el = ref.current

    if (!el) {
      return
    }

    const update = () => {
      setHeight(el.clientHeight)
    }

    update()

    const observer =
      new ResizeObserver(update)

    observer.observe(el)

    window.addEventListener(
      'resize',
      update,
    )

    return () => {
      observer.disconnect()

      window.removeEventListener(
        'resize',
        update,
      )
    }
  }, [])

  return [ref, height]
}

/**
 * 青少年 ID。
 *
 * 规范化之后放在 key 上。
 */
function getYouthId(youth) {
  return String(
    youth?.key ??
      youth?.id ??
      youth?.Id ??
      '',
  )
}

/* ==========================================================
   记录卡片
   ========================================================== */
function RecordCard({
  kind,
  record,
  index,

  onEdit,

  onDelete,
}) {
  /**
   * 结对帮扶信息
   */
  if (kind === 'pairings') {
    return (
      <Card
        size="small"
        style={{
          marginBottom: 10,
        }}
        title={
          <Space>
            <Tag
              color={
                record.paired ===
                '是'
                  ? 'green'
                  : 'default'
              }
            >
              {record.paired ===
              '是'
                ? '已结对'
                : '未结对'}
            </Tag>

            <Text
              strong
            >
              {record.contact ||
                '未填写联系人'}
            </Text>
          </Space>
        }
        extra={
          <Space>
            <Button
              type="link"
              size="small"
              icon={
                <EditOutlined />
              }
              onClick={() =>
                onEdit(
                  record,
                )
              }
            >
              编辑
            </Button>

            <Popconfirm
              title="删除结对帮扶信息"
              description="删除后可在「系统管理 → 回收站」由管理员恢复。确定删除吗？"
              okText="确定删除"
              cancelText="取消"
              okButtonProps={{
                danger: true,
              }}
              onConfirm={() =>
                onDelete(
                  record,
                )
              }
            >
              <Button
                type="link"
                size="small"
                danger
                icon={
                  <DeleteOutlined />
                }
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <Row gutter={[8, 4]}>
          <Col span={12}>
            <Text type="secondary">
              联系电话：
            </Text>
            {record.phone || '-'}
          </Col>

          <Col span={12}>
            <Text type="secondary">
              所属单位：
            </Text>
            {record.unit || '-'}
          </Col>

          <Col span={12}>
            <Text type="secondary">
              开始日期：
            </Text>
            {record.startDate ||
              '-'}
          </Col>

          <Col span={12}>
            <Text type="secondary">
              结束日期：
            </Text>
            {record.endDate ||
              '-'}
          </Col>

          <Col span={12}>
            <Text type="secondary">
              帮扶状态：
            </Text>
            {record.status ||
              '-'}
          </Col>

          <Col span={12}>
            <Text type="secondary">
              备注：
            </Text>
            {record.remark ||
              '-'}
          </Col>
        </Row>
      </Card>
    )
  }

  /**
   * 帮扶需求
   */
  if (kind === 'help-needs') {
    return (
      <Card
        size="small"
        style={{
          marginBottom: 10,
        }}
        title={
          <Space>
            <Tag
              color="blue"
            >
              {record.type ||
                '未分类'}
            </Tag>

            <Text strong>
              帮扶需求 {index + 1}
            </Text>

            <Tag
              color={
                displayResolved(
                  record.resolved,
                ) === '已解决'
                  ? 'green'
                  : 'orange'
              }
            >
              {displayResolved(
                record.resolved,
              ) || '未解决'}
            </Tag>
          </Space>
        }
        extra={
          <Space>
            <Button
              type="link"
              size="small"
              icon={
                <EditOutlined />
              }
              onClick={() =>
                onEdit(
                  record,
                )
              }
            >
              编辑
            </Button>

            <Popconfirm
              title="删除帮扶需求"
              description="删除后可在「系统管理 → 回收站」由管理员恢复。确定删除吗？"
              okText="确定删除"
              cancelText="取消"
              okButtonProps={{
                danger: true,
              }}
              onConfirm={() =>
                onDelete(
                  record,
                )
              }
            >
              <Button
                type="link"
                size="small"
                danger
                icon={
                  <DeleteOutlined />
                }
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <div
          style={{
            marginBottom: 6,
          }}
        >
          <Text type="secondary">
            需求描述：
          </Text>
          {record.description ||
            '-'}
        </div>

        <Row gutter={[8, 4]}>
          <Col span={12}>
            <Text type="secondary">
              提出日期：
            </Text>
            {record.date || '-'}
          </Col>

          <Col span={12}>
            <Text type="secondary">
              解决日期：
            </Text>
            {record.resolvedDate ||
              '-'}
          </Col>

          <Col span={24}>
            <Text type="secondary">
              备注：
            </Text>
            {record.remark ||
              '-'}
          </Col>
        </Row>
      </Card>
    )
  }

  /**
   * 帮扶记录
   */
  const photos =
    Array.isArray(
      record.photos,
    )
      ? record.photos
      : []

  return (
    <Card
      size="small"
      style={{
        marginBottom: 10,
      }}
      title={
        <Space>
          <Tag color="purple">
            {record.method ||
              '未填写方式'}
          </Tag>

          <Text strong>
            {record.date ||
              '未填写日期'}
          </Text>
        </Space>
      }
      extra={
        <Space>
          <Button
            type="link"
            size="small"
            icon={
              <EditOutlined />
            }
            onClick={() =>
              onEdit(record)
            }
          >
            编辑
          </Button>

          <Popconfirm
            title="删除帮扶记录"
            description="删除后可在「系统管理 → 回收站」由管理员恢复。确定删除吗？"
            okText="确定删除"
            cancelText="取消"
            okButtonProps={{
              danger: true,
            }}
            onConfirm={() =>
              onDelete(
                record,
              )
            }
          >
            <Button
              type="link"
              size="small"
              danger
              icon={
                <DeleteOutlined />
              }
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <div
        style={{
          marginBottom: 6,
        }}
      >
        <Text type="secondary">
          帮扶内容：
        </Text>
        {record.content || '-'}
      </div>

      <Row gutter={[8, 4]}>
        <Col span={12}>
          <Text type="secondary">
            帮扶物资：
          </Text>
          {record.material ||
            '-'}
        </Col>

        <Col span={12}>
          <Text type="secondary">
            帮扶金额：
          </Text>
          {record.amount
            ? `${record.amount} 元`
            : '-'}
        </Col>

        <Col span={12}>
          <Text type="secondary">
            帮扶联系人：
          </Text>
          {record.contact ||
            '-'}
        </Col>

        <Col span={12}>
          <Text type="secondary">
            备注：
          </Text>
          {record.remark ||
            '-'}
        </Col>
      </Row>

      {photos.length ? (
        <div
          style={{
            marginTop: 10,
          }}
        >
          <div
            style={{
              marginBottom: 6,
            }}
          >
            <Text type="secondary">
              帮扶照片（{photos.length} 张，点击可放大）：
            </Text>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {photos.map(
              (
                photo,
                photoIndex,
              ) => (
                <Image
                  key={
                    photo.id ||
                    photoIndex
                  }
                  /*
                   * 列表用缩略图（小图），
                   * 点开放大时用原图。
                   *
                   * NocoDB 附件的真实地址是 signedPath，
                   * path 直接请求会 404。
                   */
                  src={
                    buildPhotoThumbUrl(
                      photo,
                    )
                  }
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
              ),
            )}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

/* ==========================================================
   帮扶管理页
   ========================================================== */
export function HelpManagePage({
  allYouthData = [],

  loading = false,

  messageApi,
}) {
  const notify =
    messageApi || message

  /**
   * 筛选条件
   */
  const [
    searchText,
    setSearchText,
  ] = useState('')

  const [
    helpFilter,
    setHelpFilter,
  ] = useState('全部')

  const [
    pairedFilter,
    setPairedFilter,
  ] = useState('全部')

  const [
    genderFilter,
    setGenderFilter,
  ] = useState('全部')

  const [
    townFilter,
    setTownFilter,
  ] = useState('全部')

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState('全部')

  /**
   * 列表分页
   */
  const [page, setPage] =
    useState(1)

  const [
    pageSize,
    setPageSize,
  ] = useState(10)

  /**
   * 选中的青少年
   *
   * 初始值从 sessionStorage 恢复：
   * 刷新浏览器后停留在帮扶管理页时，
   * 仍然选中同一个人，右侧帮扶信息不丢失。
   */
  const [
    selectedKey,
    setSelectedKey,
  ] = useState(() => {
    try {
      return (
        sessionStorage.getItem(
          'cixian_help_selected',
        ) || ''
      )
    } catch {
      return ''
    }
  })

  /**
   * 选中变化后写回 sessionStorage，
   * 供刷新后恢复。
   */
  useEffect(() => {
    try {
      sessionStorage.setItem(
        'cixian_help_selected',
        selectedKey || '',
      )
    } catch {
      /**
       * 隐私模式下写入失败不影响主流程。
       */
    }
  }, [selectedKey])

  /**
   * 当前 Tab
   */
  const [
    activeKind,
    setActiveKind,
  ] = useState('pairings')

  /**
   * 三类记录
   */
  const [records, setRecords] =
    useState({
      pairings: [],
      'help-needs': [],
      'help-records': [],
    })

  const [
    recordsLoading,
    setRecordsLoading,
  ] = useState(false)

  /**
   * 弹窗
   */
  const [
    modalOpen,
    setModalOpen,
  ] = useState(false)

  const [
    editingRecord,
    setEditingRecord,
  ] = useState(null)

  const [saving, setSaving] =
    useState(false)

  /**
   * 帮扶总览（已结对人数等）
   */
  const [summary, setSummary] =
    useState({
      pairedCount: 0,
      pairedYouthIds: [],
    })

  const [
    summaryLoading,
    setSummaryLoading,
  ] = useState(false)

  /* ======================================================
     加载帮扶总览
     ====================================================== */
  const loadSummary =
    useCallback(async () => {
      setSummaryLoading(true)

      try {
        const data =
          await requestJson(
            '/api/help/summary',
          )

        setSummary({
          pairedCount:
            data?.summary
              ?.pairedCount ||
            0,
          pairedYouthIds:
            data?.summary
              ?.pairedYouthIds ||
            [],
        })
      } catch {
        /**
         * 统计失败不影响主流程。
         */
      } finally {
        setSummaryLoading(
          false,
        )
      }
    }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  /* ======================================================
     乡镇选项
     ======================================================
     固定为磁县 12 个乡镇 / 社区，
     不再从数据里现算。
     ====================================================== */
  const townOptions =
    TOWN_OPTIONS

  /**
   * 左侧列表可用高度。
   *
   * 直接测量卡片内容区，
   * 让表格滚动区精确撑满到页面底部。
   */
  const [
    listBodyRef,
    listBodyHeight,
  ] = useMeasuredHeight()

  /* ======================================================
     筛选后的青少年
     ======================================================
     先和前端内存缓存合并：
     刚新增、尚未进入服务器列表极端情况下，
     也能立刻出现在左侧列表里。
     ====================================================== */
  const baseYouth =
    useMemo(
      () =>
        mergeYouthCache(
          allYouthData,
        ),
      [allYouthData],
    )

  const filteredYouth =
    useMemo(() => {
      const keyword =
        searchText.trim()

      const pairedSet =
        new Set(
          (
            summary.pairedYouthIds ||
            []
          ).map((id) =>
            String(id),
          ),
        )

      return baseYouth.filter(
        (item) => {
          if (
            keyword &&
            !`${item.name || ''}${
              item.household || ''
            }`.includes(
              keyword,
            )
          ) {
            return false
          }

          if (
            helpFilter !==
              '全部' &&
            item.helpRequired !==
              helpFilter
          ) {
            return false
          }

          if (
            genderFilter !==
              '全部' &&
            item.gender !==
              genderFilter
          ) {
            return false
          }

          if (
            categoryFilter !==
              '全部' &&
            item.bigCategory !==
              categoryFilter
          ) {
            return false
          }

          if (
            townFilter !==
              '全部' &&
            extractTown(
              item.household,
            ) !== townFilter
          ) {
            return false
          }

          if (
            pairedFilter !==
            '全部'
          ) {
            const paired =
              pairedSet.has(
                getYouthId(
                  item,
                ),
              )

            if (
              pairedFilter ===
                '是' &&
              !paired
            ) {
              return false
            }

            if (
              pairedFilter ===
                '否' &&
              paired
            ) {
              return false
            }
          }

          return true
        },
      )
    }, [
      baseYouth,
      searchText,
      helpFilter,
      genderFilter,
      categoryFilter,
      townFilter,
      pairedFilter,
      summary,
    ])

  /**
   * 统计数字。
   */
  const stats =
    useMemo(() => {
      let needHelp = 0
      let keySupport = 0
      let normalCare = 0
      let growth = 0

      filteredYouth.forEach(
        (item) => {
          if (
            item.helpRequired ===
            '是'
          ) {
            needHelp += 1
          }

          if (
            item.bigCategory ===
            '重点托底类'
          ) {
            keySupport += 1
          }

          if (
            item.bigCategory ===
            '常态关爱类'
          ) {
            normalCare += 1
          }

          if (
            item.bigCategory ===
            '成长托举类'
          ) {
            growth += 1
          }
        },
      )

      return {
        total:
          filteredYouth.length,
        needHelp,
        keySupport,
        normalCare,
        growth,
        paired:
          summary.pairedCount ||
          0,
      }
    }, [
      filteredYouth,
      summary,
    ])

  /**
   * 选中的青少年对象。
   *
   * 优先从前端内存缓存读取：
   * 刚新增的人员即使还没进服务器列表，
   * 也能立刻在右侧显示基本信息。
   */
  const selectedYouth =
    useMemo(
      () => {
        if (selectedKey) {
          const cached =
            getCachedYouth(
              selectedKey,
            )

          if (cached) {
            return cached
          }
        }

        return (
          filteredYouth.find(
            (item) =>
              getYouthId(
                item,
              ) === selectedKey,
          ) ||
          baseYouth.find(
            (item) =>
              getYouthId(
                item,
              ) === selectedKey,
          ) ||
          null
        )
      },
      [
        selectedKey,
        filteredYouth,
        baseYouth,
      ],
    )

  /**
   * 本会话内刚新增的人员，
   * 进入帮扶管理页时自动选中，
   * 让用户“切过去就能看到增加的信息”。
   */
  useEffect(() => {
    const pending =
      consumePendingShowYouth()

    if (
      pending &&
      !selectedKey &&
      getCachedYouth(pending)
    ) {
      setSelectedKey(pending)
    }
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ======================================================
     默认选中第一条数据

     进入帮扶管理页时如果当前没有任何选中人，
     自动选中左侧列表第一条，
     右侧立即显示其帮扶信息，
     不需要用户再点一次。

     刷新后若 sessionStorage 里保留了上次选中人，
     则优先沿用，不会强行跳回第一条。
     ====================================================== */
  useEffect(() => {
    if (selectedKey) {
      return
    }

    if (filteredYouth.length) {
      setSelectedKey(
        getYouthId(filteredYouth[0]),
      )
    }
  }, [
    selectedKey,
    filteredYouth,
  ])

  /* ======================================================
     选中的必须是当前账号能看到的人
     ======================================================
     场景（实测踩过）：

         sessionStorage 里存着上次看的那个人，
         换了个乡镇账号登录再进帮扶页，
         页面照着旧的选中人去请求帮扶信息，
         而这个人是别的乡镇的，
         后端连续返回三个 403，
         屏幕上瞬间弹出一串“只能查看本乡镇数据”。

     所以数据加载完以后先对一次账：
     选中的人不在当前可见列表里，
     就把它清掉，交给上面的逻辑重新选第一条。
     ====================================================== */
  useEffect(() => {
    if (!selectedKey) {
      return
    }

    /**
     * 数据还没到，先不判断，
     * 否则会在加载过程中把正常选中误清掉。
     */
    if (!allYouthData.length) {
      return
    }

    const exists =
      baseYouth.some(
        (item) =>
          String(getYouthId(item)) ===
          String(selectedKey),
      )

    if (!exists) {
      setSelectedKey('')
    }
  }, [
    selectedKey,
    baseYouth,
    allYouthData.length,
  ])

  /* ======================================================
     加载某人的三类记录
     ====================================================== */
  const loadRecords =
    useCallback(
      async (
        youthId,
        kinds = KINDS,
      ) => {
        if (!youthId) {
          setRecords({
            pairings: [],
            'help-needs':
              [],
            'help-records':
              [],
          })

          return
        }

        setRecordsLoading(
          true,
        )

        const results =
          await Promise.all(
            kinds.map(
              async (
                kind,
              ) => {
                try {
                  const list =
                    await fetchHelpRecords(
                      youthId,
                      kind,
                    )

                  return [
                    kind,
                    list || [],
                  ]
                } catch (error) {
                  /**
                   * 区分「取数失败」与「确实没有数据」。
                   *
                   * 以前这里把异常直接吞掉，
                   * 一旦后端某次请求出错（例如网络抖动、
                   * 缓存未就绪），前端只显示空白，
                   * 用户就会误以为“获取不到数据”。
                   *
                   * 现在把真实错误抛出来，
                   * 让用户 / 运维能立刻知道是“出错”而非“为空”。
                   *
                   * 但 403 要排除掉：
                   *
                   *     403 表示这个人的数据不归当前账号管，
                   *     属于正常的权限边界，
                   *     不是故障。
                   *     三类数据就是三条红条，
                   *     切换账号时能瞬间糊满整个屏幕，
                   *     把真正的问题盖住。
                   *
                   *     遇到 403 只留一行控制台记录，
                   *     数据按空处理。
                   */
                  if (error?.code !== 403) {
                    notify.error(
                      `读取${KIND_LABEL[kind]}失败：${
                        error?.message ||
                        '未知错误'
                      }`,
                    )
                  } else {
                    console.warn(
                      `[帮扶管理] 跳过无权访问的数据：${KIND_LABEL[kind]}`,
                    )
                  }

                  return [
                    kind,
                    [],
                  ]
                }
              },
            ),
          )

        setRecords(
          (current) => {
            const next = {
              ...current,
            }

            results.forEach(
              ([
                kind,
                list,
              ]) => {
                next[kind] =
                  list
              },
            )

            return next
          },
        )

        setRecordsLoading(
          false,
        )
      },
      [],
    )

  /**
   * 切换选中人员后重新加载。
   */
  useEffect(() => {
    if (!selectedKey) {
      return
    }

    loadRecords(selectedKey)
  }, [
    selectedKey,
    loadRecords,
  ])

  /* ======================================================
     新增 / 编辑 / 删除
     ====================================================== */
  function openCreate() {
    setEditingRecord(null)
    setModalOpen(true)
  }

  function openEdit(record) {
    setEditingRecord(record)
    setModalOpen(true)
  }

  async function handleSubmit(
    payload,
  ) {
    if (payload?.invalid) {
      notify.warning(
        payload.message,
      )

      return
    }

    if (!selectedYouth) {
      return
    }

    const youthId =
      getYouthId(
        selectedYouth,
      )

    setSaving(true)

    try {
      const body = {
        ...payload.values,
        youthId,
        youthName:
          selectedYouth.name ||
          '',
        /**
         * 序号用于拼接 Title：
         *
         *   结对帮扶 -> {序号}-{姓名}-{是/否}
         *   帮扶需求 -> {序号}{姓名}的需求
         *
         * 后端拿不到「序号」，必须前端带上。
         */
        youthSequence:
          selectedYouth.sequence ??
          '',
      }

      let savedId = null

      if (editingRecord) {
        await updateHelpRecord(
          activeKind,
          editingRecord.id,
          body,
        )

        savedId =
          editingRecord.id

        notify.success(
          '修改成功',
        )
      } else {
        const result =
          await createHelpRecord(
            activeKind,
            body,
          )

        savedId =
          result?.id ||
          result?.record?.id

        notify.success(
          '新增成功',
        )
      }

      /**
       * 新增帮扶记录时，
       * 如果选择了照片，
       * 这时才拿到记录 ID，可以上传。
       */
      const files =
        payload.photoFiles || []

      if (
        savedId &&
        activeKind ===
          'help-records' &&
        files.length
      ) {
        for (
          let i = 0;
          i < files.length;
          i += 1
        ) {
          try {
            await uploadHelpPhoto(
              savedId,
              files[i],
            )
          } catch {
            notify.warning(
              '记录已保存，但有照片上传失败',
            )
          }
        }
      }

      setModalOpen(false)
      setEditingRecord(null)

      await loadRecords(
        youthId,
        [activeKind],
      )

      /**
       * 结对帮扶变动后，
       * 顶部的“已结对人数”要跟着变。
       */
      if (
        activeKind ===
        'pairings'
      ) {
        loadSummary()
      }
    } catch (error) {
      notify.error(
        error?.message ||
          '保存失败',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(
    record,
  ) {
    if (!selectedYouth) {
      return
    }

    const youthId =
      getYouthId(
        selectedYouth,
      )

    try {
      await deleteHelpRecord(
        activeKind,
        record.id,
        {
          youthId,
          youthName:
            selectedYouth.name ||
            '',
        },
      )

      notify.success(
        `${KIND_LABEL[activeKind]}删除成功`,
      )

      await loadRecords(
        youthId,
        [activeKind],
      )

      if (
        activeKind ===
        'pairings'
      ) {
        loadSummary()
      }
    } catch (error) {
      notify.error(
        error?.message ||
          '删除失败',
      )
    }
  }

  /* ======================================================
     表格列
     ====================================================== */
  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      width: 90,
    },
    {
      title: '性别',
      dataIndex: 'gender',
      width: 60,
    },
    {
      title: '乡镇',
      width: 100,
      render:
        (_, record) =>
          extractTown(
            record.household,
          ) || '-',
    },
    {
      title:
        '困难大类',
      dataIndex:
        'bigCategory',
      width: 110,
      render:
        (value) =>
          value ? (
            <span
              style={{
                display:
                  'inline-block',
                padding:
                  '2px 10px',
                borderRadius: 4,
                backgroundColor:
                  CATEGORY_COLOR[
                    value
                  ] ||
                  '#d9d9d9',
                color:
                  '#000000',
                fontWeight: 600,
                fontSize: 12,
                lineHeight:
                  '18px',
                whiteSpace:
                  'nowrap',
              }}
            >
              {value}
            </span>
          ) : (
            '-'
          ),
    },
    {
      title:
        '需要帮扶',
      dataIndex:
        'helpRequired',
      width: 90,
      render:
        (value) =>
          value === '是' ? (
            <Tag color="orange">
              是
            </Tag>
          ) : (
            <Tag>否</Tag>
          ),
    },
    {
      title:
        '操作',
      width: 80,
      render:
        (_, record) => (
          <Button
            type="link"
            size="small"
            onClick={() =>
              setSelectedKey(
                getYouthId(
                  record,
                ),
              )
            }
          >
            查看
          </Button>
        ),
    },
  ]

  const currentRecords =
    records[activeKind] || []

  /**
   * 人员档案（来自青少年列表，内存里已有）里的
   * 结对帮扶 / 帮扶需求信息。
   *
   * 用途：兜底。
   *
   * 万一后端帮扶表读取有延迟 / 缓存未刷新，
   * 右侧也一定要马上显示「新增人员时填的结对联系人、帮扶需求」，
   * 而不是空白。等帮扶表数据到位后，会自动切换成明细卡片。
   */
  const profilePairing =
    selectedYouth
      ? Boolean(
          selectedYouth.pairing ===
            '是' ||
            selectedYouth.pairingContact ||
            selectedYouth.pairingPhone ||
            selectedYouth.pairingUnit,
        )
      : false

  const profileHelpNeed =
    selectedYouth &&
    selectedYouth.helpNeed &&
    selectedYouth.helpNeed !== '暂无'
      ? selectedYouth.helpNeed
      : ''

  const tabItems =
    KINDS.map((kind) => ({
      key: kind,
      label:
        KIND_LABEL[kind],
      children: (
        <div>
          <div
            style={{
              display:
                'flex',
              justifyContent:
                'flex-end',
              marginBottom:
                10,
            }}
          >
            <Button
              type="primary"
              size="small"
              icon={
                <PlusOutlined />
              }
              disabled={
                !selectedYouth
              }
              onClick={
                openCreate
              }
            >
              新增
              {
                KIND_LABEL[
                  kind
                ]
              }
            </Button>
          </div>

          {recordsLoading ? (
            <div
              style={{
                padding: 30,
                textAlign:
                  'center',
              }}
            >
              <Spin />
            </div>
          ) : currentRecords.length ? (
            currentRecords.map(
              (
                record,
                index,
              ) => (
                <RecordCard
                  key={
                    record.id ||
                    index
                  }
                  kind={
                    kind
                  }
                  record={
                    record
                  }
                  index={
                    index
                  }
                  onEdit={
                    openEdit
                  }
                  onDelete={
                    handleDelete
                  }
                />
              ),
            )
          ) : kind === 'pairings' &&
            profilePairing ? (
            /**
             * 兜底：帮扶表暂时读不到时，
             * 直接用人员档案里的结对帮扶信息渲染，
             * 保证「新增人员时填的结对联系人」马上可见。
             */
            <Card
              size="small"
              style={{
                marginBottom: 10,
              }}
              title={
                <Space>
                  <Tag
                    color={
                      selectedYouth.pairing ===
                      '是'
                        ? 'green'
                        : 'default'
                    }
                  >
                    {selectedYouth.pairing ===
                    '是'
                      ? '已结对'
                      : '未结对'}
                  </Tag>

                  <Text strong>
                    {selectedYouth.pairingContact ||
                      '未填写联系人'}
                  </Text>
                </Space>
              }
              extra={
                <Tag color="blue">
                  来自人员档案
                </Tag>
              }
            >
              <Row gutter={[8, 4]}>
                <Col span={12}>
                  <Text type="secondary">
                    联系电话：
                  </Text>
                  {selectedYouth.pairingPhone ||
                    '-'}
                </Col>

                <Col span={12}>
                  <Text type="secondary">
                    所属单位：
                  </Text>
                  {selectedYouth.pairingUnit ||
                    '-'}
                </Col>
              </Row>

              <div
                style={{
                  marginTop: 8,
                }}
              >
                <Text type="secondary">
                  以上为人员档案中登记的结对帮扶信息。如需补充起止日期、帮扶状态等明细，请点右上角「新增
                  {
                    KIND_LABEL[
                      kind
                    ]
                  }
                  」。
                </Text>
              </div>
            </Card>
          ) : kind === 'help-needs' &&
            profileHelpNeed ? (
            /**
             * 兜底：人员档案里登记的帮扶需求。
             */
            <Card
              size="small"
              style={{
                marginBottom: 10,
              }}
              title={
                <Space>
                  <Tag color="blue">
                    帮扶需求
                  </Tag>

                  <Text strong>
                    {profileHelpNeed}
                  </Text>
                </Space>
              }
              extra={
                <Tag color="blue">
                  来自人员档案
                </Tag>
              }
            >
              <Text type="secondary">
                以上为人员档案中登记的帮扶需求。如需补充需求类型、提出 / 解决日期等明细，请点右上角「新增
                {
                  KIND_LABEL[kind]
                }
                」。
              </Text>
            </Card>
          ) : (
            <Empty
              description={
                selectedYouth
                  ? `暂无${KIND_LABEL[kind]}。点击右上角「新增${KIND_LABEL[kind]}」为该青少年登记`
                  : '请先在左侧选择一名青少年'
              }
            />
          )}
        </div>
      ),
    }))

  return (
    <div
      style={{
        padding: 20,
        height:
          '100%',
        boxSizing:
          'border-box',
        display:
          'flex',
        flexDirection:
          'column',
      }}
    >
      {/*
       * ==========================================
       * 筛选区
       * ==========================================
       */}
      <Card
        size="small"
        style={{
          marginBottom: 12,
        }}
      >
        <Space
          wrap
          size={10}
        >
          <Input.Search
            allowClear
            placeholder="姓名 / 户籍地"
            style={{
              width: 190,
            }}
            value={
              searchText
            }
            onChange={(
              event,
            ) => {
              setSearchText(
                event.target
                  .value,
              )

              setPage(1)
            }}
          />

          <Select
            value={
              helpFilter
            }
            onChange={(
              value,
            ) => {
              setHelpFilter(
                value,
              )

              setPage(1)
            }}
            style={{
              width: 140,
            }}
            options={[
              '全部',
              '是',
              '否',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '需要帮扶：全部'
                    : item ===
                      '是'
                    ? '需要帮扶'
                    : '暂不需要',
                value: item,
              }),
            )}
          />

          <Select
            value={
              pairedFilter
            }
            onChange={(
              value,
            ) => {
              setPairedFilter(
                value,
              )

              setPage(1)
            }}
            style={{
              width: 150,
            }}
            options={[
              '全部',
              '是',
              '否',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '是否结对：全部'
                    : item ===
                      '是'
                    ? '已结对'
                    : '未结对',
                value: item,
              }),
            )}
          />

          <Select
            value={
              genderFilter
            }
            onChange={(
              value,
            ) => {
              setGenderFilter(
                value,
              )

              setPage(1)
            }}
            style={{
              width: 110,
            }}
            options={[
              '全部',
              '男',
              '女',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '性别：全部'
                    : item,
                value: item,
              }),
            )}
          />

          <Select
            value={
              categoryFilter
            }
            onChange={(
              value,
            ) => {
              setCategoryFilter(
                value,
              )

              setPage(1)
            }}
            style={{
              width: 150,
            }}
            options={[
              '全部',
              '重点托底类',
              '常态关爱类',
              '成长托举类',
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '困难大类：全部'
                    : item,
                value: item,
              }),
            )}
          />

          <Select
            showSearch
            value={
              townFilter
            }
            onChange={(
              value,
            ) => {
              setTownFilter(
                value,
              )

              setPage(1)
            }}
            style={{
              width: 140,
            }}
            options={[
              '全部',
              ...townOptions,
            ].map(
              (item) => ({
                label:
                  item ===
                  '全部'
                    ? '户籍地：全部'
                    : item,
                value: item,
              }),
            )}
          />
        </Space>
      </Card>

      {/*
       * ==========================================
       * 实时统计
       * ==========================================
       */}
      <Card
        size="small"
        style={{
          marginBottom: 12,
        }}
      >
        <Space
          size={28}
          wrap
        >
          <span>
            <Text
              type="secondary"
            >
              共计
            </Text>
            <Text
              strong
              style={{
                fontSize: 18,
                marginLeft: 6,
                color:
                  '#1677ff',
              }}
            >
              {stats.total}
            </Text>
            <Text type="secondary">
              {' '}
              人
            </Text>
          </span>

          <span>
            <Text
              type="secondary"
            >
              需要帮扶
            </Text>
            <Text
              strong
              style={{
                fontSize: 18,
                marginLeft: 6,
                color:
                  '#fa8c16',
              }}
            >
              {
                stats.needHelp
              }
            </Text>
            <Text type="secondary">
              {' '}
              人
            </Text>
          </span>

          <Space
            size={18}
          >
            {[
              {
                label:
                  '重点托底类',
                value:
                  stats.keySupport,
                color:
                  '#ff4d4f',
              },
              {
                label:
                  '常态关爱类',
                value:
                  stats.normalCare,
                color:
                  '#fadb14',
              },
              {
                label:
                  '成长托举类',
                value:
                  stats.growth,
                color:
                  '#52c41a',
              },
            ].map(
              (item) => (
                <span
                  key={
                    item.label
                  }
                  style={{
                    display:
                      'flex',
                    alignItems:
                      'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius:
                        '50%',
                      background:
                        item.color,
                      display:
                        'inline-block',
                    }}
                  />

                  <Text
                    type="secondary"
                  >
                    {
                      item.label
                    }
                  </Text>

                  <Text
                    strong
                    style={{
                      color:
                        item.color,
                    }}
                  >
                    {
                      item.value
                    }
                  </Text>

                  <Text
                    type="secondary"
                  >
                    人
                  </Text>
                </span>
              ),
            )}
          </Space>

          <span>
            <Text
              type="secondary"
            >
              结对帮扶
            </Text>
            <Text
              strong
              style={{
                fontSize: 18,
                marginLeft: 6,
                color:
                  '#52c41a',
              }}
            >
              {
                stats.paired
              }
            </Text>
            <Text type="secondary">
              {' '}
              人
            </Text>
          </span>

          {summaryLoading ? (
            <Spin size="small" />
          ) : null}
        </Space>
      </Card>

      {/*
       * ==========================================
       * 列表 + 详情
       * ==========================================
       */}
      <Row
        gutter={12}
        className="help-row"
        style={{
          flex: 1,
          minHeight: 0,
        }}
      >
        <Col
          xs={24}
          md={14}
          className="help-list-col"
          style={{
            height:
              '100%',
            display:
              'flex',
          }}
        >
          <Card
            size="small"
            title={`青少年列表（${filteredYouth.length} 人）`}
            style={{
              width:
                '100%',
              display:
                'flex',
              flexDirection:
                'column',
            }}
            styles={{
              body: {
                flex: 1,
                minHeight: 0,
                display:
                  'flex',
                flexDirection:
                  'column',
              },
            }}
          >
            <div
              ref={
                listBodyRef
              }
              style={{
                flex: 1,
                minHeight: 0,
                display:
                  'flex',
                flexDirection:
                  'column',
              }}
            >
              <Table
                rowKey="key"
                className="app-table"
                loading={
                  loading
                }
                columns={
                  columns
                }
                dataSource={
                  filteredYouth
                }
                scroll={{
                  y: listBodyHeight
                    ? Math.max(
                        160,
                        listBodyHeight -
                          40,
                      )
                    : Math.max(
                        200,
                        window.innerHeight -
                          330,
                      ),
                }}
                pagination={{
                current:
                  page,
                pageSize,
                onChange:
                  (
                    nextPage,
                    nextSize,
                  ) => {
                    setPage(
                      nextPage,
                    )

                    setPageSize(
                      nextSize,
                    )
                  },
                showSizeChanger:
                  true,
                pageSizeOptions: [
                  10,
                  20,
                  50,
                ],
                showTotal:
                  (
                    total,
                    range,
                  ) =>
                    `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
              }}
              rowClassName={(
                record,
              ) =>
                getYouthId(
                  record,
                ) ===
                selectedKey
                  ? 'row-selected'
                  : ''
              }
              onRow={(
                record,
              ) => ({
                onClick:
                  () =>
                    setSelectedKey(
                      getYouthId(
                        record,
                      ),
                    ),
              })}
            />
            </div>
          </Card>
        </Col>

        <Col
          xs={24}
          md={10}
          className="help-detail-col"
          style={{
            height:
              '100%',
            display:
              'flex',
          }}
        >
          <Card
            size="small"
            title={
              selectedYouth
                ? `${selectedYouth.name} 的帮扶信息`
                : '帮扶信息'
            }
            style={{
              width:
                '100%',
              display:
                'flex',
              flexDirection:
                'column',
            }}
            styles={{
              body: {
                flex: 1,
                minHeight: 0,
                overflowY:
                  'auto',
              },
            }}
          >
            {selectedYouth ? (
              <div
                style={{
                  marginBottom: 12,
                  padding:
                    '10px 12px',
                  background:
                    '#f5f8ff',
                  border:
                    '1px solid #e6f0ff',
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display:
                      'flex',
                    alignItems:
                      'center',
                    gap: 8,
                    flexWrap:
                      'wrap',
                  }}
                >
                  <Text
                    strong
                    style={{
                      fontSize: 15,
                    }}
                  >
                    {selectedYouth.name ||
                      '未命名'}
                  </Text>

                  {selectedYouth.gender ? (
                    <Tag>
                      {selectedYouth.gender}
                    </Tag>
                  ) : null}

                  {selectedYouth.responsibleUnit ? (
                    <Tag
                      color="blue"
                    >
                      {selectedYouth.responsibleUnit}
                    </Tag>
                  ) : null}

                  <Tag
                    color={
                      selectedYouth.needHelp ===
                      '是'
                        ? 'orange'
                        : 'default'
                    }
                  >
                    需帮扶：
                    {selectedYouth.needHelp ||
                      '否'}
                  </Tag>

                  <Tag
                    color={
                      selectedYouth.pairing ===
                      '是'
                        ? 'green'
                        : 'default'
                    }
                  >
                    结对：
                    {selectedYouth.pairing ||
                      '否'}
                  </Tag>

                  {selectedYouth.bigCategory ? (
                    <Tag
                      color={
                        CATEGORY_COLOR[
                          selectedYouth
                            .bigCategory
                        ] || 'default'
                      }
                    >
                      {selectedYouth.bigCategory}
                    </Tag>
                  ) : null}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color:
                      '#8c8c8c',
                    fontSize: 12,
                  }}
                >
                  户籍地：
                  {selectedYouth.household ||
                    '未填写'}
                  {'　|　'}
                  已建档帮扶记录：
                  {(
                    selectedYouth.helpRecordList ||
                    []
                  ).length +
                    (
                      selectedYouth.pairingRecords ||
                      []
                    ).length +
                    (
                      selectedYouth.helpNeeds ||
                      []
                    ).length}{' '}
                  条
                </div>
              </div>
            ) : null}

            <Tabs
              activeKey={
                activeKind
              }
              onChange={
                setActiveKind
              }
              items={
                tabItems
              }
            />
          </Card>
        </Col>
      </Row>

      <HelpRecordModal
        open={modalOpen}
        kind={activeKind}
        record={
          editingRecord
        }
        youthName={
          selectedYouth?.name ||
          ''
        }
        saving={saving}
        onCancel={() => {
          setModalOpen(false)
          setEditingRecord(
            null,
          )
        }}
        onSubmit={
          handleSubmit
        }
        notify={notify}
        onPhotosChanged={() => {
          /**
           * 弹窗里删掉照片以后，
           * 重新拉一次当前三类记录，
           * 让右侧详情区的照片同步更新。
           */
          const youthId =
            selectedYouth
              ? getYouthId(
                  selectedYouth,
                )
              : ''

          if (youthId) {
            loadRecords(
              youthId,
              [activeKind],
            )
          }
        }}
      />
    </div>
  )
}
