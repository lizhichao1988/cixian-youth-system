import {
  Card,
  Typography,
  Button,
} from 'antd'

import { YouthFilterPanel } from './YouthFilterPanel'

import { YouthTable } from './YouthTable'

const {
  Title,
  Text,
} = Typography

/**
 * =========================================================
 * 青少年信息页面
 * =========================================================
 *
 * 本组件负责：
 *
 * 1. 页面标题
 * 2. 新增人员按钮
 * 3. 筛选区域
 * 4. 数据统计
 * 5. 青少年数据表格
 *
 * 本组件不负责：
 *
 * 1. 从后端读取数据
 * 2. 数据标准化
 * 3. 筛选计算
 * 4. 编辑业务逻辑
 * 5. 一人一档 Drawer
 *
 * 这些职责分别由：
 *
 * useYouthData
 * useYouthFilters
 * useYouthEditor
 * YouthDetail
 * YouthForm
 *
 * 负责。
 *
 * =========================================================
 * 本次优化
 * =========================================================
 *
 * 将传递给 YouthFilterPanel 和 YouthTable 的参数，
 * 分别整理成：
 *
 * filterProps
 * tableProps
 *
 * 这样 YouthPage 自身的结构更加清晰。
 *
 * 本次优化不改变：
 *
 * 1. 数据
 * 2. 筛选逻辑
 * 3. 分页逻辑
 * 4. 编辑逻辑
 * 5. 新增逻辑
 * 6. 页面样式
 * =========================================================
 */

export function YouthPage({
  activePage,
  pageTitle,

  allYouthData,
  loading,

  statistics,

  selectedRowKeys,
  setSelectedRowKeys,

  searchText,
  setSearchText,

  bigCategoryFilter,
  handleBigCategoryChange,

  categoryGroups,

  smallCategoryFilter,
  setSmallCategoryFilter,

  smallCategoryOptions,

  ageMin,
  setAgeMin,

  ageMax,
  setAgeMax,

  genderFilter,
  setGenderFilter,

  householdFilter,
  setHouseholdFilter,

  residenceFilter,
  setResidenceFilter,

  riskFilter,
  setRiskFilter,

  helpRequiredFilter,
  setHelpRequiredFilter,

  birthdayRange,
  setBirthdayRange,

  setCurrentPage,

  resetFilters,

  filteredData,

  tableData,

  currentPage,
  pageSize,
  setPageSize,

  openDetail,
  openEdit,
  openCreate,
  deleteYouth,
}) {
  /**
   * =========================================================
   * 筛选区域参数
   * =========================================================
   *
   * YouthPage 不再在 JSX 中逐个组织筛选参数，
   * 而是统一整理成 filterProps。
   *
   * 后续如果继续优化筛选模块，
   * 可以主要围绕这个对象进行。
   * =========================================================
   */

  const filterProps = {
    searchText,
    setSearchText,

    bigCategoryFilter,
    handleBigCategoryChange,

    categoryGroups,

    smallCategoryFilter,
    setSmallCategoryFilter,

    smallCategoryOptions,

    ageMin,
    setAgeMin,

    ageMax,
    setAgeMax,

    genderFilter,
    setGenderFilter,

    householdFilter,
    setHouseholdFilter,

    residenceFilter,
    setResidenceFilter,

    riskFilter,
    setRiskFilter,

    helpRequiredFilter,
    setHelpRequiredFilter,

    birthdayRange,
    setBirthdayRange,

    setCurrentPage,

    setSelectedRowKeys,

    resetFilters,

    filteredData,
  }

  /**
   * =========================================================
   * 表格区域参数
   * =========================================================
   *
   * YouthTable 所需要的参数统一整理成 tableProps。
   *
   * 这样以后如果继续优化表格模块，
   * YouthPage 本身不需要反复调整大量 JSX。
   * =========================================================
   */

  const tableProps = {
    selectedRowKeys,
    setSelectedRowKeys,

    tableData,

    loading,

    currentPage,
    pageSize,

    filteredData,

    setCurrentPage,
    setPageSize,

    openDetail,
    openEdit,
    deleteYouth,
  }

  return (
    <>
      {/* =====================================================
          页面标题区域
          ===================================================== */}

      <div className="page-header">
        <div>
          <Title level={2}>
            {pageTitle}
          </Title>

          <Text type="secondary">
            {activePage === 'help'
              ? '根据“是否需要帮扶”字段筛选需要重点关注和帮扶的人员'
              : '困难青少年信息台账'}
          </Text>
        </div>

        <Button
          type="primary"
          onClick={() =>
            openCreate(
              allYouthData.length + 1,
            )
          }
        >
          <span>
            + 新增人员
          </span>
        </Button>
      </div>

      {/* =====================================================
          筛选区域
          ===================================================== */}

      <YouthFilterPanel
        {...filterProps}
      />

      {/* =====================================================
          数据统计
          ===================================================== */}

      <Card
        className="statistics-card"
        title="数据统计总览"
      >
        <div className="statistics-overview">
          <div className="statistics-total">
            <span>
              总计：
            </span>

            <strong>
              {
                statistics.total
              }
            </strong>

            <span>
              条数据
            </span>
          </div>

          <div className="statistics-item">
            <i className="dot dot-red" />

            <span>
              重点托底类
            </span>

            <strong>
              {
                statistics.top
              }
            </strong>

            <span>
              人
            </span>
          </div>

          <div className="statistics-item">
            <i className="dot dot-yellow" />

            <span>
              常态关爱类
            </span>

            <strong>
              {
                statistics.normal
              }
            </strong>

            <span>
              人
            </span>
          </div>

          <div className="statistics-item">
            <i className="dot dot-green" />

            <span>
              成长托举类
            </span>

            <strong>
              {
                statistics.growth
              }
            </strong>

            <span>
              人
            </span>
          </div>
        </div>
      </Card>

      {/* =====================================================
          数据表格
          ===================================================== */}

      <Card
        className="table-card"
        title={`${pageTitle}数据列表`}
        extra={
          selectedRowKeys.length >
          0 ? (
            <Text type="secondary">
              已选择
              {
                selectedRowKeys.length
              }
              条
            </Text>
          ) : null
        }
      >
        <YouthTable
          {...tableProps}
        />
      </Card>
    </>
  )
}