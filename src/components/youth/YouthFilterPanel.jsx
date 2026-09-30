import {
  Button,
  Card,
  Input,
  DatePicker,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd'

const { Text } = Typography
const { RangePicker } = DatePicker

function YouthFilterPanel({
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
}) {
  function resetListPosition() {
    setCurrentPage(1)
    setSelectedRowKeys([])
  }

  return (
    <Card className="filter-card">
      <div className="search-row">
        <Input
          size="large"
          allowClear
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value)
            resetListPosition()
          }}
          placeholder="请输入姓名、户籍地址、常住地址、困难类别等关键词进行模糊搜索"
        />

        <Button
          type="primary"
          size="large"
          onClick={() =>
            setCurrentPage(1)
          }
        >
          搜索
        </Button>
      </div>

      <div
        className="filter-grid"
        style={{
          gridTemplateColumns:
            'repeat(3, minmax(0, 1fr))',
          gridTemplateRows:
            'auto auto auto',
          alignItems: 'start',
        }}
      >
        <div
          className="filter-item"
          style={{
            gridColumn: '1',
            gridRow: '1',
            width: '100%',
          }}
        >
          <span>困难大类</span>

          <Select
            value={bigCategoryFilter}
            onChange={handleBigCategoryChange}
            options={[
              {
                value: '全部',
                label: '全部',
              },
              ...Object.keys(
                categoryGroups,
              ).map((item) => ({
                value: item,
                label: item,
              })),
            ]}
            style={{
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>

        <div
          className="filter-item"
          style={{
            gridColumn: '2',
            gridRow: '1',
            width: '100%',
          }}
        >
          <span>困难小类</span>

          <Select
            value={smallCategoryFilter}
            onChange={(value) => {
              setSmallCategoryFilter(value)
              resetListPosition()
            }}
            options={[
              {
                value: '全部',
                label: '全部',
              },
              ...smallCategoryOptions.map(
                (item) => ({
                  value: item,
                  label: item,
                }),
              ),
            ]}
            style={{
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>

        <div
          className="filter-item"
          style={{
            gridColumn: '3',
            gridRow: '1',
            width: '100%',
          }}
        >
          <span>年龄范围</span>

          <Space
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <InputNumber
              min={0}
              max={100}
              value={ageMin}
              onChange={(value) => {
                setAgeMin(value)
                resetListPosition()
              }}
              placeholder="最小"
              style={{
                flex: 1,
                minWidth: 0,
              }}
            />

            <span>至</span>

            <InputNumber
              min={0}
              max={100}
              value={ageMax}
              onChange={(value) => {
                setAgeMax(value)
                resetListPosition()
              }}
              placeholder="最大"
              style={{
                flex: 1,
                minWidth: 0,
              }}
            />
          </Space>
        </div>

        <div
          className="filter-item"
          style={{
            gridColumn: '1',
            gridRow: '2',
            width: '100%',
          }}
        >
          <span>性别</span>

          <Select
            value={genderFilter}
            onChange={(value) => {
              setGenderFilter(value)
              resetListPosition()
            }}
            options={[
              {
                value: '全部',
                label: '全部',
              },
              {
                value: '男',
                label: '男',
              },
              {
                value: '女',
                label: '女',
              },
            ]}
            style={{
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>

        <div
          className="filter-item"
          style={{
            gridColumn: '2',
            gridRow: '2',
            width: '100%',
          }}
        >
          <span>户籍地址</span>

          <Input
            allowClear
            value={householdFilter}
            onChange={(e) => {
              setHouseholdFilter(
                e.target.value,
              )
              resetListPosition()
            }}
            placeholder="请输入户籍地址"
            style={{
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>

        <div
          className="filter-item"
          style={{
            gridColumn: '3',
            gridRow: '2',
            width: '100%',
          }}
        >
          <span>常住地址</span>

          <Input
            allowClear
            value={residenceFilter}
            onChange={(e) => {
              setResidenceFilter(
                e.target.value,
              )
              resetListPosition()
            }}
            placeholder="请输入常住地址"
            style={{
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>

        <div
          className="filter-item"
          style={{
            gridColumn: '1',
            gridRow: '3',
            width: '100%',
          }}
        >
          <span>风险排查</span>

          <Select
            value={riskFilter}
            onChange={(value) => {
              setRiskFilter(value)
              resetListPosition()
            }}
            options={[
              {
                value: '全部',
                label: '全部',
              },
              {
                value: '有风险',
                label: '有风险',
              },
              {
                value: '无风险',
                label: '无风险',
              },
              {
                value: '未排查',
                label: '未排查',
              },
            ]}
            style={{
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>

        <div
          className="filter-item"
          style={{
            gridColumn: '2',
            gridRow: '3',
            width: '100%',
          }}
        >
          <span>是否需要帮扶</span>

          <Select
            value={helpRequiredFilter}
            onChange={(value) => {
              setHelpRequiredFilter(
                value,
              )
              resetListPosition()
            }}
            options={[
              {
                value: '全部',
                label: '全部',
              },
              {
                value: '是',
                label: '是',
              },
              {
                value: '否',
                label: '否',
              },
            ]}
            style={{
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>

        <div
          className="filter-item birthday-filter"
          style={{
            gridColumn: '3',
            gridRow: '3',
            width: '100%',
          }}
        >
          <span>出生年月</span>

          <RangePicker
            picker="month"
            value={birthdayRange}
            onChange={(value) => {
              setBirthdayRange(value)
              resetListPosition()
            }}
            placeholder={[
              '开始年月',
              '结束年月',
            ]}
            style={{
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>
      </div>

      <div className="filter-actions">
        <Button onClick={resetFilters}>
          重置条件
        </Button>

        <Text type="secondary">
          筛选后共：
          {filteredData.length}
          条
        </Text>
      </div>
    </Card>
  )
}

export { YouthFilterPanel }
