/* =========================================================
   帮扶管理模块
   =========================================================

   负责三张表的增删改查：

   1. 结对帮扶信息表   pairings
   2. 帮扶需求表       helpNeeds
   3. 帮扶记录表       helpRecords

   对外接口：

   GET    /api/youth/:youthId/:kind
          读取某名青少年的帮扶记录

   POST   /api/help/:kind
          新增

   PUT    /api/help/:kind/:id
          修改

   DELETE /api/help/:kind/:id
          删除

   POST   /api/help/help-records/:id/photo
          上传帮扶照片

   kind 取值：

   pairings      结对帮扶
   help-needs    帮扶需求
   help-records  帮扶记录

   =========================================================

   重要前提（都已实测确认）：

   1. 创建记录时直接写链接字段即可自动建立关联：
      { "青少年基本信息表": { "Id": 31 } }
      不需要单独调用 link 接口。

   2. NocoDB v2 没有单条删除路由，必须批量删除：
      DELETE /records  body:[{Id:n}]

   3. 照片上传走：
      POST /api/v2/storage/upload   （multipart）
      返回的附件数组再写进“帮扶照片”字段。

   ========================================================= */

const express = require('express')

/**
 * 存储加密：
 * 写入帮扶表前把手机号等敏感字段加密。
 */
const security = require('./security')

/**
 * 供外部模块（例如回收站恢复）
 * 清除帮扶数据缓存用。
 *
 * registerHelpRoutes 执行后会被赋值。
 */
let globalClearHelpCache =
  null

function clearHelpCacheAll(
  kind,
) {
  if (
    typeof globalClearHelpCache ===
    'function'
  ) {
    globalClearHelpCache(kind)
  }
}

function registerHelpRoutes(
  app,
  deps,
) {
  const {
    NOCODB_BASE_URL,
    TABLE_IDS,
    getHeaders,
    recordDeletion,
    /**
     * 由 server.js 注入，用于统计接口按乡镇过滤。
     * 老版本没有这两个依赖时也不会报错（做了存在性判断）。
     */
    loadYouthData,
    canAccessYouth,
  } = deps

  /**
   * 青少年表在三张帮扶表里的反向链接字段名。
   *
   * 三张表都叫“青少年基本信息表”。
   */
  const YOUTH_LINK_FIELD =
    '青少年基本信息表'

  /* -----------------------------------------------------
     三张表的字段映射

     前端英文名  ->  NocoDB 中文字段名
     ----------------------------------------------------- */
  const HELP_KINDS = {
    pairings: {
      tableKey: 'pairings',
      label: '结对帮扶',
      fields: {
        paired: '是否结对帮扶',
        contact: '帮扶联系人',
        phone: '联系电话',
        unit: '所属单位',
        startDate: '开始日期',
        endDate: '结束日期',
        status: '帮扶状态',
        remark: '备注',
      },
    },

    'help-needs': {
      tableKey: 'helpNeeds',
      label: '帮扶需求',
      fields: {
        type: '需求类型',
        description: '需求描述',
        resolved: '是否已解决',
        date: '提出日期',
        resolvedDate: '解决日期',
        remark: '备注',
      },
    },

    'help-records': {
      tableKey: 'helpRecords',
      label: '帮扶记录',
      fields: {
        date: '帮扶日期',
        method: '帮扶方式',
        content: '帮扶内容',
        material: '帮扶物资',
        amount: '帮扶金额',
        contact: '帮扶联系人',
        remark: '备注',
      },
    },
  }

  /* -----------------------------------------------------
     字段值归一化
     -----------------------------------------------------

     两个实测出来的坑：

     1. “是否已解决”是单选字段，
        合法值只有：已解决 / 解决中 / 未解决。
        但库里现有 1181 条数据存的是“否”，
        直接写“否”会 400。
        所以这里做一次映射。

     2. “帮扶金额”是 Currency 类型，
        空字符串会报
        Invalid value '' for type 'Currency'。
        所以空值统一写成 null。
     ----------------------------------------------------- */
  function normalizeFieldValue(
    key,
    value,
  ) {
    if (
      key === 'resolved'
    ) {
      if (value === '是') {
        return '已解决'
      }

      if (value === '否') {
        return '未解决'
      }

      return value
    }

    if (key === 'amount') {
      if (
        value === '' ||
        value === null ||
        value === undefined
      ) {
        return null
      }

      const num =
        Number(value)

      return isNaN(num)
        ? null
        : num
    }

    /**
     * 日期字段（Date 类型）：
     *
     * 空字符串 / null / undefined 一律写成 null。
     *
     * 否则空串写进 Date 列，
     * NocoDB 会直接报 400，
     * 表现为「保存失败」。
     *
     * 这里覆盖帮扶三类用到的所有日期列：
     * help-needs 的 提出日期(date) / 解决日期(resolvedDate)，
     * pairings 的 开始日期(startDate) / 结束日期(endDate)，
     * help-records 的 帮扶日期(date)。
     */
    if (
      key === 'date' ||
      key === 'resolvedDate' ||
      key === 'startDate' ||
      key === 'endDate'
    ) {
      if (
        value === '' ||
        value === null ||
        value === undefined
      ) {
        return null
      }

      return String(value).trim()
    }

    return value
  }

  /**
   * 简单缓存。
   *
   * 三张表分别缓存全量数据，
   * 写操作成功后立即失效。
   */
  let helpCache = {}

  function clearHelpCache(kind) {
    helpCache[kind] = null
  }

  /**
   * 暴露给外部模块使用。
   */
  globalClearHelpCache =
    clearHelpCache

  /* -----------------------------------------------------
     通用：安全解析 JSON
     ----------------------------------------------------- */
  function safeJson(text) {
    if (!text) {
      return null
    }

    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  /* -----------------------------------------------------
     通用：取出 NocoDB 返回的记录 Id
     ----------------------------------------------------- */
  function pickId(parsed) {
    if (Array.isArray(parsed)) {
      return parsed[0]?.Id ?? null
    }

    if (parsed && typeof parsed === 'object') {
      return parsed.Id ?? null
    }

    return null
  }

  /* -----------------------------------------------------
     通用：判断某条记录是否属于指定青少年
     ----------------------------------------------------- */
  function belongsToYouth(
    record,
    youthId,
  ) {
    const link =
      record?.[YOUTH_LINK_FIELD]

    if (!link) {
      return false
    }

    if (Array.isArray(link)) {
      return link.some(
        (item) =>
          String(
            item?.Id ?? '',
          ) ===
          String(youthId),
      )
    }

    return (
      String(link?.Id ?? '') ===
      String(youthId)
    )
  }

  /* -----------------------------------------------------
     通用：分页拉取整张表
     ----------------------------------------------------- */
  async function fetchWholeTable(
    tableId,
  ) {
    const all = []

    let offset = 0

    while (true) {
      const url =
        NOCODB_BASE_URL +
        '/api/v2/tables/' +
        tableId +
        '/records?limit=200&offset=' +
        offset

      const response =
        await fetch(url, {
          headers: getHeaders(),
        })

      const text =
        await response.text()

      if (!response.ok) {
        throw new Error(
          '读取失败：' +
            response.status +
            ' ' +
            text.slice(0, 200),
        )
      }

      const parsed =
        safeJson(text)

      const list =
        parsed?.list ?? []

      all.push(...list)

      const total =
        parsed?.pageInfo
          ?.totalRows ?? 0

      if (
        list.length === 0 ||
        all.length >= total
      ) {
        break
      }

      offset += list.length
    }

    return all
  }

  /* -----------------------------------------------------
     通用：读取某青少年的帮扶记录
     ----------------------------------------------------- */
  async function fetchKindByYouth(
    kind,
    youthId,
  ) {
    const config =
      HELP_KINDS[kind]

    if (!config) {
      throw new Error(
        '未知的帮扶类型：' + kind,
      )
    }

    const tableId =
      TABLE_IDS[config.tableKey]

    if (!helpCache[kind]) {
      const rows =
        await fetchWholeTable(
          tableId,
        )

      helpCache[kind] = {
        rows,
        loadedAt: Date.now(),
      }
    }

    const rows =
      helpCache[kind].rows ?? []

    return rows
      .filter((row) =>
        belongsToYouth(
          row,
          youthId,
        ),
      )
      .map((row) =>
        normalizeHelpRecord(
          kind,
          row,
        ),
      )
  }

  /* -----------------------------------------------------
     通用：把 NocoDB 记录转成前端结构
     ----------------------------------------------------- */
  function normalizeHelpRecord(
    kind,
    row,
  ) {
    const config =
      HELP_KINDS[kind]

    const result = {
      id: row?.Id ?? '',
      title: row?.Title ?? '',
      createdAt:
        row?.CreatedAt ?? '',
    }

    Object.keys(
      config.fields,
    ).forEach((key) => {
      const cnField =
        config.fields[key]

      result[key] =
        row?.[cnField] ?? ''
    })

    /**
     * 帮扶记录额外带上照片。
     */
    if (kind === 'help-records') {
      result.photos =
        normalizePhotos(
          row?.['帮扶照片'],
        )
    }

    return result
  }

  /**
   * 照片字段可能是：
   *
   * 数组：[{path,title,mimetype,size,signedPath,...}]
   * JSON 字符串
   * 空
   */
  function normalizePhotos(value) {
    let list = value

    if (
      typeof value === 'string' &&
      value.trim()
    ) {
      try {
        list = JSON.parse(value)
      } catch {
        list = []
      }
    }

    if (!Array.isArray(list)) {
      return []
    }

    return list
      .map((item) => ({
        id:
          item?.id ||
          item?.Id ||
          '',
        path:
          item?.path ||
          item?.url ||
          '',
        title:
          item?.title ||
          item?.name ||
          '照片',

        /**
         * NocoDB 附件的真实可访问地址是 signedPath。
         *
         * path（download/...）直接请求会 404，
         * 必须用 signedPath（dltemp/...）。
         */
        signedPath:
          item?.signedPath ||
          item?.signedUrl ||
          '',

        /**
         * 小缩略图，列表里用它省流量。
         */
        thumbPath:
          item?.thumbnails?.small
            ?.signedPath ||
          item?.thumbnails?.tiny
            ?.signedPath ||
          item?.thumbnails?.card_cover
            ?.signedPath ||
          '',

        mimetype:
          item?.mimetype || '',
        size: item?.size ?? 0,
      }))
      .filter(
        (item) =>
          item.path || item.signedPath,
      )
  }

  /* ===================================================
     读取
     GET /api/youth/:youthId/:kind
     =================================================== */
  app.get(
    '/api/youth/:youthId/:kind',
    async (req, res) => {
      const youthId =
        String(
          req.params.youthId ?? '',
        ).trim()

      const kind =
        String(
          req.params.kind ?? '',
        ).trim()

      /**
       * 只处理帮扶三类。
       *
       * 其他路径交给后续路由。
       */
      if (
        !HELP_KINDS[kind]
      ) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              '未知的帮扶类型',
          })
      }

      if (!youthId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              '缺少青少年ID',
          })
      }

      try {
        const records =
          await fetchKindByYouth(
            kind,
            youthId,
          )

        return res.json({
          success: true,
          youthId,
          kind,
          records,
        })
      } catch (error) {
        console.error(
          '读取帮扶记录失败：',
          error,
        )

        return res
          .status(500)
          .json({
            success: false,
            message:
              error?.message ||
              '读取帮扶记录失败',
          })
      }
    },
  )

  /* ===================================================
     新增
     POST /api/help/:kind
     =================================================== */
  app.post(
    '/api/help/:kind',
    async (req, res) => {
      const kind =
        String(
          req.params.kind ?? '',
        ).trim()

      const config =
        HELP_KINDS[kind]

      if (!config) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              '未知的帮扶类型',
          })
      }

      const body =
        req.body ?? {}

      const youthId =
        String(
          body.youthId ?? '',
        ).trim()

      if (!youthId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              '缺少青少年ID',
          })
      }

      /**
       * 组装要写入 NocoDB 的字段。
       */
      const insertFields = {}

      Object.keys(
        config.fields,
      ).forEach((key) => {
        const cnField =
          config.fields[key]

        let value =
          body[key]

        if (
          value === undefined ||
          value === null
        ) {
          value = ''
        }

        insertFields[cnField] =
          normalizeFieldValue(
            key,
            value,
          )
      })

      /**
       * Title 用于 NocoDB 列表展示。
       */
      insertFields.Title =
        buildTitle(
          kind,
          body,
        )

      /**
       * 关键：直接写链接字段建立关联。
       */
      insertFields[
        YOUTH_LINK_FIELD
      ] = {
        Id: Number(youthId),
      }

      try {
        const url =
          NOCODB_BASE_URL +
          '/api/v2/tables/' +
          TABLE_IDS[
            config.tableKey
          ] +
          '/records'

        const response =
          await fetch(url, {
            method: 'POST',
            headers:
              getHeaders(),
            body: JSON.stringify(
              security.encryptSensitiveFields(
                insertFields,
              ),
            ),
          })

        const text =
          await response.text()

        const parsed =
          safeJson(text)

        if (!response.ok) {
          console.error(
            '新增帮扶记录失败：',
            response.status,
            text.slice(0, 300),
          )

          return res
            .status(500)
            .json({
              success: false,
              message:
                '新增失败：' +
                (parsed?.message ||
                  response.status),
            })
        }

        const newId =
          pickId(parsed)

        clearHelpCache(kind)

        return res.json({
          success: true,
          message:
            config.label + '新增成功',
          id: newId,
          record: {
            id: newId,
            title:
              insertFields.Title,
            ...buildFrontRecord(
              config,
              body,
            ),
            createdAt:
              new Date().toISOString(),
          },
        })
      } catch (error) {
        console.error(
          '新增帮扶记录异常：',
          error,
        )

        return res
          .status(500)
          .json({
            success: false,
            message:
              error?.message ||
              '新增帮扶记录失败',
          })
      }
    },
  )

  /* ===================================================
     修改
     PUT /api/help/:kind/:id
     =================================================== */
  app.put(
    '/api/help/:kind/:id',
    async (req, res) => {
      const kind =
        String(
          req.params.kind ?? '',
        ).trim()

      const id = String(
        req.params.id ?? '',
      ).trim()

      const config =
        HELP_KINDS[kind]

      if (!config) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              '未知的帮扶类型',
          })
      }

      if (!id) {
        return res
          .status(400)
          .json({
            success: false,
            message: '缺少记录ID',
          })
      }

      const body =
        req.body ?? {}

      const updateFields = {
        Id: Number(id),
      }

      Object.keys(
        config.fields,
      ).forEach((key) => {
        if (
          body[key] ===
            undefined ||
          body[key] === null
        ) {
          return
        }

        updateFields[
          config.fields[key]
        ] = normalizeFieldValue(
          key,
          body[key],
        )
      })

      /**
       * 修改时同样可以更新 Title。
       *
       * 结对帮扶记录始终带 youthId，
       * 所以这里用 youthName || youthId 判断即可。
       */
      if (
        body.youthName ||
        body.youthId
      ) {
        updateFields.Title =
          buildTitle(kind, body)
      }

      try {
        const url =
          NOCODB_BASE_URL +
          '/api/v2/tables/' +
          TABLE_IDS[
            config.tableKey
          ] +
          '/records'

        const response =
          await fetch(url, {
            method: 'PATCH',
            headers:
              getHeaders(),
            body: JSON.stringify([
              security.encryptSensitiveFields(
                updateFields,
              ),
            ]),
          })

        const text =
          await response.text()

        if (!response.ok) {
          console.error(
            '修改帮扶记录失败：',
            response.status,
            text.slice(0, 300),
          )

          return res
            .status(500)
            .json({
              success: false,
              message:
                '修改失败：' +
                response.status,
            })
        }

        clearHelpCache(kind)

        return res.json({
          success: true,
          message:
            config.label + '修改成功',
          id,
          record: {
            id,
            ...buildFrontRecord(
              config,
              body,
            ),
          },
        })
      } catch (error) {
        console.error(
          '修改帮扶记录异常：',
          error,
        )

        return res
          .status(500)
          .json({
            success: false,
            message:
              error?.message ||
              '修改帮扶记录失败',
          })
      }
    },
  )

  /* ===================================================
     删除
     DELETE /api/help/:kind/:id
     =================================================== */
  app.delete(
    '/api/help/:kind/:id',
    async (req, res) => {
      const kind =
        String(
          req.params.kind ?? '',
        ).trim()

      const id = String(
        req.params.id ?? '',
      ).trim()

      const config =
        HELP_KINDS[kind]

      if (!config) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              '未知的帮扶类型',
          })
      }

      if (!id) {
        return res
          .status(400)
          .json({
            success: false,
            message: '缺少记录ID',
          })
      }

      try {
        const url =
          NOCODB_BASE_URL +
          '/api/v2/tables/' +
          TABLE_IDS[
            config.tableKey
          ] +
          '/records'

        /**
         * 删除前先留一份快照，
         * 供管理员在回收站里恢复。
         */
        let snapshot = null

        try {
          const snapshotResponse =
            await fetch(
              NOCODB_BASE_URL +
                '/api/v2/tables/' +
                TABLE_IDS[
                  config.tableKey
                ] +
                '/records/' +
                id,
              {
                headers:
                  getHeaders(),
              },
            )

          if (
            snapshotResponse.ok
          ) {
            snapshot =
              await snapshotResponse.json()
          }
        } catch (snapshotError) {
          snapshot = null
        }

        /**
         * 必须使用批量删除形式。
         */
        const response =
          await fetch(url, {
            method: 'DELETE',
            headers:
              getHeaders(),
            body: JSON.stringify([
              {
                Id: Number(id),
              },
            ]),
          })

        const text =
          await response.text()

        if (!response.ok) {
          console.error(
            '删除帮扶记录失败：',
            response.status,
            text.slice(0, 300),
          )

          return res
            .status(500)
            .json({
              success: false,
              message:
                '删除失败：' +
                response.status,
            })
        }

        clearHelpCache(kind)

        if (
          typeof recordDeletion ===
          'function'
        ) {
          recordDeletion({
            /**
             * 前端使用的类型名，
             * 例如 help-records。
             *
             * 恢复时要用它清缓存。
             */
            kind,

            /**
             * 后端表键名，
             * 例如 helpRecords。
             *
             * 恢复时要用它找表。
             */
            tableKey:
              config.tableKey,

            kindLabel:
              config.label,
            recordId: id,
            record: {
              ...(snapshot || {}),
              rawFields:
                snapshot || {},
            },
            youthId:
              String(
                req.body?.youthId ||
                  snapshot?.青少年基本信息表?.[0]
                    ?.Id ||
                  '',
              ),
            youthName:
              req.body?.youthName || '',
            user: req.user,
          })
        }

        return res.json({
          success: true,
          message:
            config.label + '删除成功',
          id,
        })
      } catch (error) {
        console.error(
          '删除帮扶记录异常：',
          error,
        )

        return res
          .status(500)
          .json({
            success: false,
            message:
              error?.message ||
              '删除帮扶记录失败',
          })
      }
    },
  )

  /* ===================================================
     上传帮扶照片
     POST /api/help/help-records/:id/photo
     ===================================================

     前端用 FormData 提交。
     这里不做 multipart 解析，
     直接把原始 multipart 报文转发给 NocoDB。

     上传成功后把返回的附件数组
     写进“帮扶照片”字段。
     =================================================== */
  app.post(
    '/api/help/help-records/:id/photo',

    /*
     * 不做 multipart 解析，
     * 直接拿到原始报文，
     * 原样转发给 NocoDB。
     *
     * 这样就不需要再装 multer 之类的依赖。
     */
    express.raw({
      type: 'multipart/form-data',
      /**
       * 原来是 50mb，太大了。
       *
       * 公网上一并发上传就能把内存吃光（DoS），
       * 帮扶照片用不着这么大，
       * 默认收到 12MB 就够（单张照片校验在下面还会再卡一道）。
       */
      limit:
        process.env.MAX_UPLOAD_SIZE ||
        '12mb',
    }),

    async (req, res) => {
      const id =
        String(
          req.params.id ?? '',
        ).trim()

      if (!id) {
        return res
          .status(400)
          .json({
            success: false,
            message: '缺少记录ID',
          })
      }

      /**
       * 取原始 multipart 报文。
       *
       * 注意 express 默认不会解析 multipart，
       * 这里 req.body 在 raw 中间件下是 Buffer。
       */
      const rawBody =
        Buffer.isBuffer(req.body)
          ? req.body
          : null

      if (!rawBody) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              '没有接收到文件内容',
          })
      }

      /**
       * ===================================================
       * 上传内容校验
       * ===================================================
       *
       * 之前这里完全没有校验，
       * 任何人都能往系统里传任意文件
       * （可执行程序、带脚本的 HTML …），
       * 而且是落在附件目录里能被访问的。
       *
       * 现在卡两道：
       *   1. 体积上限
       *   2. 必须是图片（扩展名 + Content-Type 同时判断）
       */
      const maxUploadBytes =
        Number(
          process.env
            .MAX_UPLOAD_MB || 10,
        ) *
        1024 *
        1024

      if (
        rawBody.length >
        maxUploadBytes
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message: `照片不能超过 ${
              Math.round(
                maxUploadBytes /
                  1024 /
                  1024,
              )
            }MB`,
          })
      }

      /**
       * 只看报文头部几百字节，
       * 不用去解析整个 multipart。
       */
      const preview = rawBody
        .subarray(0, 4096)
        .toString('latin1')

      const nameMatch =
        /filename="([^"]*)"/.exec(
          preview,
        )

      const fileName =
        nameMatch?.[1] || ''

      const extOk =
        /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(
          fileName,
        )

      const typeOk =
        /Content-Type:\s*image\//i.test(
          preview,
        )

      if (!extOk || !typeOk) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              '只允许上传图片（jpg / png / gif / webp / bmp / heic）',
          })
      }

      try {
        const uploadUrl =
          NOCODB_BASE_URL +
          '/api/v2/storage/upload'

        const uploadResponse =
          await fetch(
            uploadUrl,
            {
              method: 'POST',
              headers: {
                'xc-token':
                  getHeaders()[
                    'xc-token'
                  ],
                'Content-Type':
                  req.headers[
                    'content-type'
                  ],
              },
              body: rawBody,
            },
          )

        const uploadText =
          await uploadResponse.text()

        if (
          !uploadResponse.ok
        ) {
          console.error(
            '照片上传失败：',
            uploadResponse.status,
            uploadText.slice(
              0,
              300,
            ),
          )

          return res
            .status(500)
            .json({
              success: false,
              message:
                '照片上传失败：' +
                uploadResponse.status,
            })
        }

        const attachments =
          safeJson(
            uploadText,
          )

        if (
          !Array.isArray(
            attachments,
          ) ||
          attachments.length ===
            0
        ) {
          return res
            .status(500)
            .json({
              success: false,
              message:
                '照片上传成功但未返回附件信息',
            })
        }

        /**
         * 把附件写进“帮扶照片”字段。
         */
        const patchUrl =
          NOCODB_BASE_URL +
          '/api/v2/tables/' +
          TABLE_IDS.helpRecords +
          '/records'

        const patchResponse =
          await fetch(
            patchUrl,
            {
              method: 'PATCH',
              headers:
                getHeaders(),
              body:
                JSON.stringify([
                  {
                    Id: Number(id),
                    帮扶照片:
                      attachments,
                  },
                ]),
            },
          )

        const patchText =
          await patchResponse.text()

        if (!patchResponse.ok) {
          console.error(
            '写入照片字段失败：',
            patchResponse.status,
            patchText.slice(
              0,
              300,
            ),
          )

          return res
            .status(500)
            .json({
              success: false,
              message:
                '照片已上传但写入记录失败',
            })
        }

        clearHelpCache(
          'help-records',
        )

        return res.json({
          success: true,
          message: '照片上传成功',
          photos:
            normalizePhotos(
              attachments,
            ),
        })
      } catch (error) {
        console.error(
          '照片上传异常：',
          error,
        )

        return res
          .status(500)
          .json({
            success: false,
            message:
              error?.message ||
              '照片上传失败',
          })
      }
    },
  )

  /* ===================================================
     删除帮扶照片
     POST /api/help/help-records/:id/photo/remove
     ===================================================

     请求体：

         { photoId: '附件ID' }

     或者：

         { index: 0 }

     从“帮扶照片”字段的附件数组里
     移除指定的一张照片，然后把剩下的写回去。

     注意：
     这里只从记录里摘掉附件引用，
     不会去删 NocoDB 存储里的物理文件。
     =================================================== */
  app.post(
    '/api/help/help-records/:id/photo/remove',
    async (req, res) => {
      const id = String(
        req.params.id ?? '',
      ).trim()

      if (!id) {
        return res.status(400).json({
          success: false,
          message: '缺少记录ID',
        })
      }

      const body =
        req.body &&
        typeof req.body === 'object'
          ? req.body
          : {}

      const photoId = String(
        body.photoId ?? '',
      ).trim()

      const removeIndex = Number(
        body.index,
      )

      const recordUrl =
        NOCODB_BASE_URL +
        '/api/v2/tables/' +
        TABLE_IDS.helpRecords +
        '/records/' +
        encodeURIComponent(id)

      try {
        /**
         * 第一步：读出当前附件数组。
         */
        const currentResponse =
          await fetch(recordUrl, {
            headers: getHeaders(),
          })

        if (!currentResponse.ok) {
          return res.status(404).json({
            success: false,
            message: '未找到该帮扶记录',
          })
        }

        const currentRecord =
          await currentResponse.json()

        let list =
          currentRecord?.['帮扶照片']

        if (typeof list === 'string') {
          list = safeJson(list)
        }

        if (!Array.isArray(list)) {
          list = []
        }

        /**
         * 第二步：定位要移除的那一张。
         *
         * 优先按附件 ID 匹配，
         * 其次按下标匹配。
         */
        let targetIndex = -1

        if (photoId) {
          targetIndex = list.findIndex(
            (item) =>
              String(
                item?.id ??
                  item?.Id ??
                  '',
              ) === photoId,
          )
        }

        if (
          targetIndex < 0 &&
          Number.isInteger(removeIndex) &&
          removeIndex >= 0 &&
          removeIndex < list.length
        ) {
          targetIndex = removeIndex
        }

        if (targetIndex < 0) {
          return res.status(404).json({
            success: false,
            message: '未找到要删除的照片',
          })
        }

        const nextList = list.filter(
          (_item, index) =>
            index !== targetIndex,
        )

        /**
         * 第三步：写回剩余照片。
         *
         * 全部删完时写 null，
         * 避免留下空数组。
         */
        const patchResponse =
          await fetch(
            NOCODB_BASE_URL +
              '/api/v2/tables/' +
              TABLE_IDS.helpRecords +
              '/records',
            {
              method: 'PATCH',
              headers: getHeaders(),
              body: JSON.stringify([
                {
                  Id: Number(id),
                  帮扶照片:
                    nextList.length >
                    0
                      ? nextList
                      : null,
                },
              ]),
            },
          )

        const patchText =
          await patchResponse.text()

        if (!patchResponse.ok) {
          console.error(
            '删除照片写入失败：',
            patchResponse.status,
            patchText.slice(0, 300),
          )

          return res.status(500).json({
            success: false,
            message: '删除照片失败',
          })
        }

        clearHelpCache(
          'help-records',
        )

        return res.json({
          success: true,
          message: '照片已删除',
          photos:
            normalizePhotos(nextList),
        })
      } catch (error) {
        console.error(
          '删除照片异常：',
          error,
        )

        return res.status(500).json({
          success: false,
          message:
            error?.message ||
            '删除照片失败',
        })
      }
    },
  )

  /* -----------------------------------------------------
     生成 NocoDB 列表用的 Title
     ----------------------------------------------------- */
  function buildTitle(
    kind,
    body,
  ) {
    const name =
      body.youthName || ''

    /**
     * 对外展示用「序号」，不是 NocoDB 的 Id。
     *
     * 前端会传 youthSequence；
     * 万一没传，退回 youthId，保证不出现空标题。
     */
    const seq = String(
      body.youthSequence ??
        body.youthId ??
        '',
    ).trim()

    if (kind === 'pairings') {
      /**
       * 结对帮扶记录的 Title 规则：
       *
       *     {序号}-{姓名}-{是否结对帮扶}
       *
       * 例：1183-王海-是
       *
       * 这样青少年基本信息表的“结对帮扶记录”
       * 关联字段就能显示有意义的文字，
       * 而不是空白 / 横线。
       */
      return (
        (seq ? seq + '-' : '') +
        name +
        '-' +
        (body.paired || '否')
      )
    }

    if (kind === 'help-needs') {
      /**
       * 帮扶需求记录的 Title 规则：
       *
       *     {序号}{姓名}的需求
       *
       * 例：1183王海的需求
       */
      return (
        seq + name + '的需求'
      )
    }

    return (
      name +
      (body.date || '') +
      '的帮扶记录'
    )
  }

  /* -----------------------------------------------------
     生成返回给前端的记录（英文名）
     ----------------------------------------------------- */
  function buildFrontRecord(
    config,
    body,
  ) {
    const result = {}

    Object.keys(
      config.fields,
    ).forEach((key) => {
      if (
        body[key] === undefined
      ) {
        result[key] = ''
        return
      }

      result[key] = body[key]
    })

    return result
  }

  /* ===================================================
     帮扶总览统计
     GET /api/help/summary
     ===================================================

     帮扶管理页面顶部要显示：

         共计 xx 人
         需要帮扶 xx 人
         结对帮扶 xx 人

     “是否结对帮扶”存在结对帮扶信息表里，
     因此这里直接统计整张表，
     不需要前端一条条去问。
     =================================================== */
  /**
   * 取子表记录关联的青少年 Id。
   *
   * 子表（结对 / 需求 / 帮扶记录）里
   * 「青少年基本信息表」字段是一个关联数组，
   * 取第一个元素的 Id 即可。
   */
  function linkedYouthId(row) {
    const link =
      row?.[YOUTH_LINK_FIELD]

    const first = Array.isArray(link)
      ? link[0]
      : link

    return Number(first?.Id ?? 0)
  }

  /**
   * 乡镇账号的数据范围：
   * 先把本乡镇能看到的青少年 Id 收成一个集合，
   * 再用它去过滤各张子表。
   */
  async function buildTownYouthIdSet(user) {
    if (
      !user ||
      user.role !== 'town' ||
      typeof loadYouthData !==
        'function' ||
      typeof canAccessYouth !==
        'function'
    ) {
      return null
    }

    try {
      const data =
        await loadYouthData(false)

      const visible = (
        data.records || []
      ).filter((item) =>
        canAccessYouth(user, item),
      )

      return new Set(
        visible
          .map((item) =>
            Number(
              item.key ??
                item._raw?.Id ??
                0,
            ),
          )
          .filter((id) => id > 0),
      )
    } catch (error) {
      console.error(
        '乡镇数据范围计算失败，按无权限处理：',
        error?.message || error,
      )

      return new Set()
    }
  }

  app.get(
    '/api/help/summary',
    async (req, res) => {
      try {
        /**
         * 乡镇账号只能统计本乡镇的数据，
         * 否则会把全县的结对数、需求数全部暴露出去。
         */
        const youthIdSet =
          await buildTownYouthIdSet(
            req.user,
          )

        const inScope = (list) =>
          !youthIdSet
            ? list
            : list.filter(
                (item) =>
                  youthIdSet.has(
                    linkedYouthId(
                      item,
                    ),
                  ),
              )

        const pairings = inScope(
          await fetchWholeTable(
            TABLE_IDS.pairings,
          ),
        )

        const needs = inScope(
          await fetchWholeTable(
            TABLE_IDS.helpNeeds,
          ),
        )

        const records = inScope(
          await fetchWholeTable(
            TABLE_IDS
              .helpRecords,
          ),
        )

        /**
         * 已结对人数：
         *
         * 「是否结对帮扶」= 是。
         *
         * 历史数据里有“已结对”等写法，
         * 这里一并兼容。
         */
        const pairedList =
          pairings.filter(
            (item) => {
              const value =
                String(
                  item?.[
                    '是否结对帮扶'
                  ] ?? '',
                ).trim()

              return (
                value ===
                  '是' ||
                value ===
                  '已结对'
              )
            },
          )

        const pairedCount =
          pairedList.length

        /**
         * 已结对的青少年 ID 列表。
         *
         * 帮扶管理页要按「是否结对帮扶」筛选，
         * 而结对信息在另一张表里，
         * 所以这里一并算出来给前端。
         */
        const pairedYouthIds =
          pairedList
            .map((item) => {
              const link =
                item?.[
                  YOUTH_LINK_FIELD
                ]

              const first =
                Array.isArray(
                  link,
                )
                  ? link[0]
                  : link

              return Number(
                first?.Id ?? 0,
              )
            })
            .filter(
              (id) => id > 0,
            )

        /**
         * 已解决需求数。
         *
         * 历史数据存的是“是 / 否”，
         * 新数据是“已解决 / 解决中 / 未解决”。
         */
        const resolvedCount =
          needs.filter(
            (item) => {
              const value =
                String(
                  item?.[
                    '是否已解决'
                  ] ?? '',
                ).trim()

              return (
                value ===
                  '已解决' ||
                value === '是'
              )
            },
          ).length

        return res.json({
          success: true,
          summary: {
            pairingTotal:
              pairings.length,

            pairedCount,

            pairedYouthIds,

            needTotal:
              needs.length,

            resolvedCount,

            recordTotal:
              records.length,
          },
        })
      } catch (error) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              error?.message ||
              '读取帮扶统计失败',
          })
      }
    },
  )

  console.log(
    '帮扶管理模块已加载',
  )
}

module.exports = {
  registerHelpRoutes,
  clearHelpCacheAll,
}
