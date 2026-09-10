import { getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * 输入驱动的去抖请求（RF-3），内建**竞态守卫**。
 *
 * 为什么必须抽出来：仓里原有 6 份「去抖 + 请求」拷贝，其中 3 份没有世代号守卫
 * （useTagSuggest 700ms / useTaskMount 320ms / useUploadPlayable 260ms）。
 * 症状是真实的：输入 `dsv3` 后立刻改成 `gpt-4`，慢网的旧响应后到会覆盖新结果 ——
 * 用户会在「模型战绩」标题下看到**上一个模型的数字和名字**；
 * useTaskMount 还会让 spinner 提前消失（taskSearching 由最后返回者决定）。
 *
 * 做法：每次请求领一个世代号，回来时不是最新世代就丢弃（连同 loading 态一起丢弃）；
 * 定时器在组件卸载时清理。
 *
 * 用法：
 *   const { result, loading, refresh } = useDebouncedFetch({
 *     source: () => query.value,                 // 输入源（变化即触发）
 *     fetcher: (key) => api.search(key),         // 实际请求
 *     delay: 250,
 *     minLength: 2,                              // 太短直接清空、不发请求
 *     empty: () => [],                           // 清空/失败时的回落值
 *   })
 */
export interface DebouncedFetchOptions<T> {
  /** 输入源 getter：返回值变化即触发（一般读一个 ref） */
  source: () => string
  /** 实际请求；key 已 trim */
  fetcher: (key: string) => Promise<T>
  /** 去抖毫秒数 */
  delay?: number
  /** 少于该长度不发请求，直接回落 empty */
  minLength?: number
  /** 清空/失败/未达长度时的回落值 */
  empty: () => T
  /** 是否在 loading 开始时立即清空旧结果（默认 false：保留旧值避免闪烁） */
  clearOnStart?: boolean
}

export function useDebouncedFetch<T>(opts: DebouncedFetchOptions<T>) {
  const { source, fetcher, delay = 250, minLength = 1, empty, clearOnStart = false } = opts
  const result = ref<T>(empty()) as Ref<T>
  const loading = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let seq = 0

  async function run(key: string) {
    const my = ++seq
    if (key.length < minLength) {
      result.value = empty()
      loading.value = false
      return
    }
    loading.value = true
    if (clearOnStart) result.value = empty()
    try {
      const r = await fetcher(key)
      if (my !== seq) return // 竞态守卫：旧响应直接丢，不写结果也不动 loading
      result.value = r
    } catch {
      if (my !== seq) return
      result.value = empty()
    } finally {
      if (my === seq) loading.value = false
    }
  }

  /** 立即执行（跳过去抖），用于「重试/手动刷新」 */
  function refresh() {
    if (timer) clearTimeout(timer)
    void run(source().trim())
  }

  watch(source, (raw) => {
    const key = (raw || '').trim()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void run(key), delay)
  })

  // 只在组件上下文里注册卸载清理：合成器也可能在测试/非组件环境被调用，
  // 那种情况下 onBeforeUnmount 会打 Vue 警告（且本来也没有"卸载"可言）。
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      if (timer) clearTimeout(timer)
    })
  }

  // run 一并暴露：调用方偶尔需要「用显式 key 立刻搜一次」（例如打开选择器时
  // 先用已填正文搜，而不是把正文塞进输入框再触发 source）
  return { result, loading, refresh, run }
}