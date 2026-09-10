/**
 * 世代号守卫（RF-4a）。
 *
 * 用途：输入/筛选驱动的**并发取数**里，只允许最新一次请求写结果。
 * 典型场景：DemosView 的列表加载 —— 旧实现把 `loading` 布尔同时当 UI 态与互斥锁，
 * 导致「首屏加载期间换筛选」直接早退不重查（芯片高亮、URL 变了、列表还是旧数据）。
 * 只删早退也不行：在途的旧响应会把上一组筛选的结果 append 进新列表。
 *
 * 抽成独立小件的原因：这段语义是纯逻辑，可以在组件之外被直接断言
 * （组件需要 localStorage/matchMedia/IntersectionObserver/router 四件外部依赖，无法单测）。
 */
export interface LoadGeneration {
  /** 领一个新世代号（每次发起请求前调用） */
  next: () => number
  /** 作废所有在途请求（换筛选时调用，不必先等旧请求返回） */
  invalidate: () => void
  /** 这次请求的世代号是否仍是最新（写结果前必须检查） */
  isCurrent: (gen: number) => boolean
}

export function useLoadGeneration(): LoadGeneration {
  let gen = 0
  return {
    next: () => ++gen,
    invalidate: () => {
      gen++
    },
    isCurrent: (g: number) => g === gen,
  }
}
