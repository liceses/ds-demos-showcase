import { getCurrentInstance, onMounted, ref, type Ref } from 'vue'
import { useUiStore } from '../stores/ui'

/**
 * 后台面板统一取数（RF-3）。
 *
 * 背景：22 个 admin 面板里 13 个手抄同一段样板
 * （`loading.value = true` / try / catch / finally / onMounted），
 * 且同一种失败分裂成两套出口：常驻 `notice notice-error`（13 处）
 * 与 3 秒就消失的 `ui.toast`（15 处），其中 10 个文件同时用两套 ——
 * 于是「保存失败的提示在哪儿」因人而异。
 *
 * 这个合成器**不改各面板当前选的出口**（errorMode 显式传，行为保持），
 * 只把样板收成一处；出口口径的统一属于产品可见改动，另行决策。
 *
 * @example
 * const { data, loading, error, load } = useAdminLoader({
 *   fetcher: () => api.getInspection({ sample_limit: 6 }),
 *   initial: null as InspectionReport | null,
 * })
 */
export interface AdminLoaderOptions<T> {
  fetcher: () => Promise<T>
  /** 初始值（也是失败时的回落目标由调用方在 onLoaded/自身逻辑决定） */
  initial: T
  /** 取数成功后的后处理（预填表单、建立索引等） */
  onLoaded?: (data: T) => void
  /**
   * 失败出口：notice = 常驻错误块（默认，适合「本面板的全部内容」）；
   * toast = 一闪而过（适合「增值信息，失败不该打断主流程」）。
   */
  errorMode?: 'notice' | 'toast'
  /** 是否在挂载时自动加载（默认 true；需要传参的面板传 false 自己调 load） */
  immediate?: boolean
}

export function useAdminLoader<T>(opts: AdminLoaderOptions<T>) {
  const { fetcher, initial, onLoaded, errorMode = 'notice', immediate = true } = opts
  const ui = useUiStore()
  const data = ref(initial) as Ref<T>
  const loading = ref(false)
  const error = ref('')

  async function load() {
    loading.value = true
    if (errorMode === 'notice') error.value = ''
    try {
      const r = await fetcher()
      data.value = r
      onLoaded?.(r)
      if (errorMode === 'notice') error.value = ''
    } catch (e) {
      const msg = (e as Error).message
      if (errorMode === 'toast') ui.toast(msg, 'error')
      else error.value = msg
    } finally {
      loading.value = false
    }
  }

  // 组件外调用（测试）不应打 Vue 警告
  if (immediate && getCurrentInstance()) {
    onMounted(() => void load())
  }

  return { data, loading, error, load }
}
