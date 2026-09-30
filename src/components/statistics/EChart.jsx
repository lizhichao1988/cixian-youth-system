/**
 * =========================================================
 * 图表容器
 * =========================================================
 *
 * 对 echarts 做一层很薄的封装：
 *
 *     1. 挂载时初始化
 *     2. option 变化时更新
 *     3. 窗口大小变化时自适应
 *     4. 卸载时销毁，避免内存泄漏
 *
 * 页面只需要传 option，
 * 不需要关心 echarts 的生命周期。
 * =========================================================
 */

import {
  useEffect,
  useRef,
} from 'react'

import * as echarts from 'echarts/core'

import {
  BarChart,
  LineChart,
  PieChart,
} from 'echarts/charts'

import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'

import {
  CanvasRenderer,
} from 'echarts/renderers'

/**
 * 按需注册。
 *
 * 不用 echarts 全量包，
 * 只注册本页用到的饼图、柱状图、折线图，
 * 打包体积可以小很多。
 */
echarts.use([
  PieChart,
  BarChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
])

export function EChart({
  option,
  height = 320,
}) {
  const containerRef =
    useRef(null)

  const chartRef =
    useRef(null)

  /**
   * 初始化一次。
   */
  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const chart =
      echarts.init(
        containerRef.current,
      )

    chartRef.current = chart

    const handleResize =
      () => {
        chart.resize()
      }

    window.addEventListener(
      'resize',
      handleResize,
    )

    return () => {
      window.removeEventListener(
        'resize',
        handleResize,
      )

      chart.dispose()

      chartRef.current = null
    }
  }, [])

  /**
   * option 变化时更新图表。
   */
  useEffect(() => {
    if (
      !chartRef.current ||
      !option
    ) {
      return
    }

    chartRef.current.setOption(
      option,
      true,
    )
  }, [option])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
      }}
    />
  )
}
