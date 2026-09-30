/**
 * ============================================================
 * 青少年列表筛选 Hook
 * ============================================================
 *
 * 这个 Hook 专门负责：
 *
 * 1. 搜索
 * 2. 年龄筛选
 * 3. 性别筛选
 * 4. 困难大类筛选
 * 5. 困难小类筛选
 * 6. 户籍地筛选
 * 7. 常住地筛选
 * 8. 风险筛选
 * 9. 是否需要帮扶筛选
 * 10. 出生年月筛选
 * 11. 分页
 * 12. 筛选条件重置
 *
 * ============================================================
 *
 * 它不负责：
 *
 * - 从后端读取数据
 * - 修改数据库
 * - 显示表格
 * - 显示页面
 * - 显示 Drawer
 *
 * 数据来源：
 *
 *     useYouthData
 *
 * 数据输出：
 *
 *     filteredData
 *     tableData
 *
 * ============================================================
 */

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  getAge,
  getField,
} from '../utils/youthUtils'

import {
  categoryGroups,
  allCategories,
  categoryMatchesFilter,
} from '../utils/categoryUtils'

import {
  getRiskFilterStatus,
  getRiskDescriptions,
} from '../utils/riskUtils'


/**
 * ============================================================
 * 青少年筛选 Hook
 * ============================================================
 *
 * @param {Object} options
 *
 * allYouthData：
 *     useYouthData 提供的全部标准化数据
 *
 * activePage：
 *     当前页面
 *
 * onResetSelection：
 *     筛选条件变化或页面切换时，
 *     通知 App.jsx 清空表格勾选。
 *
 * ============================================================
 */

function useYouthFilters({
  allYouthData,
  activePage,
  onResetSelection,
}) {
  /**
   * ==========================================================
   * 搜索关键词
   * ==========================================================
   */

  const [
    searchText,
    setSearchText,
  ] = useState('')


  /**
   * ==========================================================
   * 年龄范围
   * ==========================================================
   */

  const [
    ageMin,
    setAgeMin,
  ] = useState(null)

  const [
    ageMax,
    setAgeMax,
  ] = useState(null)


  /**
   * ==========================================================
   * 性别
   * ==========================================================
   */

  const [
    genderFilter,
    setGenderFilter,
  ] = useState('全部')


  /**
   * ==========================================================
   * 困难大类
   * ==========================================================
   */

  const [
    bigCategoryFilter,
    setBigCategoryFilter,
  ] = useState('全部')


  /**
   * ==========================================================
   * 困难小类
   * ==========================================================
   */

  const [
    smallCategoryFilter,
    setSmallCategoryFilter,
  ] = useState('全部')


  /**
   * ==========================================================
   * 户籍地
   * ==========================================================
   */

  const [
    householdFilter,
    setHouseholdFilter,
  ] = useState('')


  /**
   * ==========================================================
   * 常住地
   * ==========================================================
   */

  const [
    residenceFilter,
    setResidenceFilter,
  ] = useState('')


  /**
   * ==========================================================
   * 风险排查
   * ==========================================================
   */

  const [
    riskFilter,
    setRiskFilter,
  ] = useState('全部')


  /**
   * ==========================================================
   * 是否需要帮扶
   * ==========================================================
   */

  const [
    helpRequiredFilter,
    setHelpRequiredFilter,
  ] = useState('全部')


  /**
   * ==========================================================
   * 出生年月
   * ==========================================================
   */

  const [
    birthdayRange,
    setBirthdayRange,
  ] = useState(null)


  /**
   * ==========================================================
   * 分页
   * ==========================================================
   */

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1)

  const [
    pageSize,
    setPageSize,
  ] = useState(10)


  /**
   * ==========================================================
   * 当前大类对应的小类
   * ==========================================================
   *
   * 例如：
   *
   * 重点托底类
   *       ↓
   * 只显示重点托底类的小类
   *
   * 如果选择“全部”，
   * 则显示全部小类。
   *
   * ==========================================================
   */

  const smallCategoryOptions =
    useMemo(
      () =>
        bigCategoryFilter ===
        '全部'
          ? allCategories
          : categoryGroups[
              bigCategoryFilter
            ] || [],
      [
        bigCategoryFilter,
      ],
    )


  /**
   * ==========================================================
   * 真正执行筛选
   * ==========================================================
   */

  const filteredData =
    useMemo(() => {
      /**
       * ------------------------------------------------------
       * 搜索关键词统一转小写。
       * ------------------------------------------------------
       */

      const keyword =
        searchText
          .trim()
          .toLowerCase()


      /**
       * ------------------------------------------------------
       * 户籍地关键词
       * ------------------------------------------------------
       */

      const householdKeyword =
        householdFilter
          .trim()
          .toLowerCase()


      /**
       * ------------------------------------------------------
       * 常住地关键词
       * ------------------------------------------------------
       */

      const residenceKeyword =
        residenceFilter
          .trim()
          .toLowerCase()


      /**
       * ------------------------------------------------------
       * 开始筛选
       * ------------------------------------------------------
       */

      return allYouthData.filter(
        (record) => {
          /**
           * ==================================================
           * “需帮扶人员信息”页面
           * ==================================================
           *
           * 这个页面只显示：
           *
           *     是否需要帮扶 = 是
           *
           * ==================================================
           */

          if (
            activePage === 'help' &&
            record.helpRequired !==
              '是'
          ) {
            return false
          }


          /**
           * ==================================================
           * 是否需要帮扶筛选
           * ==================================================
           */

          if (
            helpRequiredFilter !==
              '全部' &&
            record.helpRequired !==
              helpRequiredFilter
          ) {
            return false
          }


          /**
           * ==================================================
           * 模糊搜索
           * ==================================================
           *
           * 搜索范围保持和原来的 App.jsx 一致。
           * ==================================================
           */

          if (keyword) {
            const searchFields = [
              record.name,
              record.gender,
              record.birthday,
              record.political,
              record.household,
              record.residence,
              record.basic,
              record.phone,
              record.guardian,
              record.guardianPhone,
              record.helpRequired,
              record.bigCategory,
              record.categories,
              record.helpNeed,
              record.pairing,
              record.pairingContact,
              record.pairingPhone,
              record.pairingUnit,
              record.remark,

              getRiskDescriptions(
                record,
              ),
            ]


            const searchContent =
              searchFields
                .filter(
                  (value) =>
                    value !==
                      undefined &&
                    value !== null,
                )
                .map(
                  (value) =>
                    String(
                      value,
                    ).toLowerCase(),
                )
                .join(' ')


            if (
              !searchContent.includes(
                keyword,
              )
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 年龄下限
           * ==================================================
           */

          const age =
            getAge(
              record.birthday,
            )


          if (
            ageMin !== null &&
            ageMin !== undefined
          ) {
            if (
              age === null ||
              age < ageMin
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 年龄上限
           * ==================================================
           */

          if (
            ageMax !== null &&
            ageMax !== undefined
          ) {
            if (
              age === null ||
              age > ageMax
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 性别
           * ==================================================
           */

          if (
            genderFilter !==
              '全部' &&
            record.gender !==
              genderFilter
          ) {
            return false
          }


          /**
           * ==================================================
           * 困难大类
           * ==================================================
           */

          if (
            bigCategoryFilter !==
            '全部'
          ) {
            const groups =
              getCategoryGroupsForRecord(
                record,
              )

            if (
              !groups.includes(
                bigCategoryFilter,
              )
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 困难小类
           * ==================================================
           */

          if (
            smallCategoryFilter !==
            '全部'
          ) {
            if (
              !categoryMatchesFilter(
                record.categories,
                smallCategoryFilter,
              )
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 户籍地
           * ==================================================
           */

          if (
            householdKeyword
          ) {
            const household =
              String(
                record.household ||
                  '',
              )
                .trim()
                .toLowerCase()


            if (
              !household.includes(
                householdKeyword,
              )
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 常住地
           * ==================================================
           */

          if (
            residenceKeyword
          ) {
            const residence =
              String(
                record.residence ||
                  '',
              )
                .trim()
                .toLowerCase()


            if (
              !residence.includes(
                residenceKeyword,
              )
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 风险排查
           * ==================================================
           */

          if (
            riskFilter !==
            '全部'
          ) {
            const riskStatus =
              getRiskFilterStatus(
                record,
              )


            if (
              riskStatus !==
              riskFilter
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 出生年月范围
           * ==================================================
           *
           * 当前数据格式主要为：
           *
           *     YYYY-MM
           *
           * 所以这里按照“年月”进行比较。
           * ==================================================
           */

          if (
            birthdayRange &&
            birthdayRange.length ===
              2
          ) {
            const birthdayText =
              String(
                record.birthday ||
                  '',
              )


            const match =
              birthdayText.match(
                /^(\d{4})-(\d{1,2})/,
              )


            if (!match) {
              return false
            }


            const year =
              Number(
                match[1],
              )

            const month =
              Number(
                match[2],
              )


            const currentMonthValue =
              year * 12 + month


            const startYear =
              birthdayRange[0].year()

            const startMonth =
              birthdayRange[0].month() +
              1


            const endYear =
              birthdayRange[1].year()

            const endMonth =
              birthdayRange[1].month() +
              1


            const startValue =
              startYear * 12 +
              startMonth


            const endValue =
              endYear * 12 +
              endMonth


            if (
              currentMonthValue <
                startValue ||
              currentMonthValue >
                endValue
            ) {
              return false
            }
          }


          /**
           * ==================================================
           * 所有条件通过
           * ==================================================
           */

          return true
        },
      )
    }, [
      allYouthData,
      activePage,
      searchText,
      ageMin,
      ageMax,
      genderFilter,
      bigCategoryFilter,
      smallCategoryFilter,
      householdFilter,
      residenceFilter,
      riskFilter,
      helpRequiredFilter,
      birthdayRange,
    ])


  /**
   * ==========================================================
   * 分页后的数据
   * ==========================================================
   */

  const tableData =
    useMemo(() => {
      const start =
        (currentPage - 1) *
        pageSize


      const end =
        start + pageSize


      return filteredData.slice(
        start,
        end,
      )
    }, [
      filteredData,
      currentPage,
      pageSize,
    ])


  /**
   * ==========================================================
   * 当前页码自动纠正
   * ==========================================================
   *
   * 例如：
   *
   * 原来有 100 条数据
   * 当前在第 10 页
   *
   * 筛选以后只剩 20 条
   *
   * 此时自动回到第 1 页，
   * 避免页面显示空白。
   * ==========================================================
   */

  useEffect(() => {
    const totalPages =
      Math.max(
        1,
        Math.ceil(
          filteredData.length /
            pageSize,
        ),
      )


    if (
      currentPage >
      totalPages
    ) {
      setCurrentPage(1)
    }
  }, [
    filteredData.length,
    pageSize,
    currentPage,
  ])


  /**
   * ==========================================================
   * 重置所有筛选
   * ==========================================================
   */

  function resetFilters() {
    setSearchText('')

    setAgeMin(null)

    setAgeMax(null)

    setGenderFilter(
      '全部',
    )

    setBigCategoryFilter(
      '全部',
    )

    setSmallCategoryFilter(
      '全部',
    )

    setHouseholdFilter('')

    setResidenceFilter('')

    setRiskFilter('全部')

    setHelpRequiredFilter(
      '全部',
    )

    setBirthdayRange(null)

    setCurrentPage(1)


    /**
     * 同时清空表格勾选。
     */

    if (
      typeof onResetSelection ===
      'function'
    ) {
      onResetSelection()
    }
  }


  /**
   * ==========================================================
   * 页面切换时自动重置筛选
   * ==========================================================
   */

  useEffect(() => {
    resetFilters()
  }, [
    activePage,
  ])


  /**
   * ==========================================================
   * 困难大类改变
   * ==========================================================
   *
   * 大类变化以后：
   *
   *     小类必须重新变成“全部”
   *
   * 这是原来系统已有的业务规则。
   * ==========================================================
   */

  function handleBigCategoryChange(
    value,
  ) {
    setBigCategoryFilter(
      value,
    )

    setSmallCategoryFilter(
      '全部',
    )

    setCurrentPage(1)

    if (
      typeof onResetSelection ===
      'function'
    ) {
      onResetSelection()
    }
  }


  /**
   * ==========================================================
   * 对外返回
   * ==========================================================
   */

  return {
    /**
     * 筛选状态
     */

    searchText,
    setSearchText,

    ageMin,
    setAgeMin,

    ageMax,
    setAgeMax,

    genderFilter,
    setGenderFilter,

    bigCategoryFilter,
    setBigCategoryFilter,

    smallCategoryFilter,
    setSmallCategoryFilter,

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


    /**
     * 分页
     */

    currentPage,
    setCurrentPage,

    pageSize,
    setPageSize,


    /**
     * 计算结果
     */

    smallCategoryOptions,

    filteredData,

    tableData,


    /**
     * 操作
     */

    resetFilters,

    handleBigCategoryChange,
  }
}


/**
 * ============================================================
 * 辅助函数
 * ============================================================
 *
 * 根据当前记录得到它所属的困难大类。
 *
 * 注意：
 *
 * 这里保持和原 App.jsx 一致：
 *
 *     getField(record, ...)
 *
 *     record.bigCategory
 *
 * ============================================================
 */

function getCategoryGroupsForRecord(
  record,
) {
  const categories =
    record?.categories

  const directGroups =
    Array.isArray(
      record?.categoryGroups,
    )
      ? record.categoryGroups
      : []


  /**
   * 如果标准化数据中已经有大类，
   * 直接使用。
   */

  if (
    record?.bigCategory
  ) {
    const values =
      Array.isArray(
        record.bigCategory,
      )
        ? record.bigCategory
        : [
            record.bigCategory,
          ]

    return [
      ...new Set(
        values.filter(
          Boolean,
        ),
      ),
    ]
  }


  /**
   * 如果标准化数据里已经保存 categoryGroups，
   * 直接使用。
   */

  if (
    directGroups.length > 0
  ) {
    return [
      ...new Set(
        directGroups.filter(
          Boolean,
        ),
      ),
    ]
  }


  /**
   * 最后保留一个兼容处理。
   *
   * 如果以后某些记录没有提前标准化，
   * 可以从 categories 中读取。
   */

  const rawGroups =
    getField(
      record,
      [
        '困难大类',
        'bigCategory',
        'categoryGroups',
      ],
    )


  if (
    Array.isArray(
      rawGroups,
    )
  ) {
    return [
      ...new Set(
        rawGroups.filter(
          Boolean,
        ),
      ),
    ]
  }


  if (
    typeof rawGroups ===
    'string' &&
    rawGroups.trim()
  ) {
    return [
      rawGroups.trim(),
    ]
  }


  /**
   * 没有大类。
   */

  return []
}


export {
  useYouthFilters,
}