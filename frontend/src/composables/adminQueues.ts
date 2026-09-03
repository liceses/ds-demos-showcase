// 后台队列描述符（第 1 期）：侧栏徽章、概览台、面板计数三处共用**一份定义**。
// 为什么单独抽出来：计数逻辑一旦在三个地方各写一遍，就会出现"徽章说有 12 条、
// 点进去 0 条"这类自相矛盾的界面 —— 与运维 §15 记的"两处清单必然漂移"同一族坑。
import { computed, ref } from 'vue'
import { api } from '../api'
import type { InspectionCheck } from '../api/types'

export type QueueKey = 'review' | 'inbox' | 'clusters' | 'refine' | 'attribution' | 'wordlist'

export interface QueueState {
  count: number
  loading: boolean
  error: string
}

export const queues = ref<Record<QueueKey, QueueState>>({
  review: { count: 0, loading: true, error: '' },
  inbox: { count: 0, loading: true, error: '' },
  clusters: { count: 0, loading: true, error: '' },
  refine: { count: 0, loading: true, error: '' },
  attribution: { count: 0, loading: true, error: '' },
  wordlist: { count: 0, loading: true, error: '' },
})

let inflight: Promise<void> | null = null

function pickCheck(checks: InspectionCheck[], id: string): number {
  return checks.find((c) => c.id === id)?.count ?? 0
}

/**
 * 一次并发拉全部队列计数（失败按 0 处理，绝不因为计数拉不到就挡住后台主流程）。
 * 复用同一 promise 做去重：切换面板/重进时不该把三个接口打三遍。
 */
export function refreshQueues(): Promise<void> {
  if (inflight) return inflight
  for (const k of Object.keys(queues.value) as QueueKey[]) queues.value[k].loading = true
  inflight = (async () => {
    const [stats, knowledge, inspection, clusters] = await Promise.allSettled([
      api.getAdminStats(),
      api.getKnowledgeStats(),
      api.getInspection({ sample_limit: 1 }),
      api.getPromptClusters(),
    ])
    const set = (k: QueueKey, n: number, err = '') => {
      queues.value[k] = { count: n, loading: false, error: err }
    }
    set('review', stats.status === 'fulfilled' ? stats.value.demos.pending : 0, stats.status === 'rejected' ? String(stats.reason) : '')
    set('inbox', knowledge.status === 'fulfilled' ? knowledge.value.inbox.pending : 0)
    // 题目候选 = 未覆盖的可成题簇（exact + similar）
    set(
      'clusters',
      clusters.status === 'fulfilled'
        ? (clusters.value.stats.exact_clusters ?? 0) + (clusters.value.stats.similar_clusters ?? 0)
        : 0,
    )
    if (inspection.status === 'fulfilled') {
      const checks = inspection.value.checks
      // 类型细分与巡检共用一次扫描结果：refine 计数取"规则可细分"，attribution 取兜底位作品数
      const queueable = checks.filter((c) => c.can_queue).reduce((n, c) => n + c.count, 0)
      set('refine', pickCheck(checks, 'type_missing') + pickCheck(checks, 'type_multi') || queueable)
      set('attribution', pickCheck(checks, 'model_fallback'))
      set('wordlist', pickCheck(checks, 'fixed_no_desc'))
    } else {
      set('refine', 0)
      set('attribution', 0)
      set('wordlist', 0)
    }
    // 细分面板的预览数（含置信度门槛）另算一次，不与巡检共用 → 这里保持 0 让面板自己显示
    inflight = null
  })()
  return inflight
}

export function useQueues() {
  const totalMust = computed(() =>
    (Object.keys(queues.value) as QueueKey[]).reduce((n, k) => n + queues.value[k].count, 0),
  )
  const loading = computed(() => (Object.keys(queues.value) as QueueKey[]).some((k) => queues.value[k].loading))
  return { queues, totalMust, loading, refresh: refreshQueues }
}
