// T15 拆分件（04 §5.4）：useTaskMount —— 挂题：pickedTask + 防抖搜索 + 相似度（自 UploadView.vue 逐字迁出，行为不变）
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { TaskSuggestItem } from '../api/types'
import { api } from '../api'
import { useDebouncedFetch } from './useDebouncedFetch'
import { t } from '../i18n'

/**
 * 挂题（第 6 条：上传页原本没有选题入口）
 * 唯一状态源：从题目页带 ?task= 进来、或在这里主动选，都写进 pickedTask。
 * 之前是两套（challengeSlug 只读 + 无选择器），所以作者手里有作品却说不出"我答的是哪道题"。
 */
export function useTaskMount(deps: {
  title: Ref<string>
  description: Ref<string>
  prompt: Ref<string>
  aside: (key: string, text: string) => void
}) {
  const { aside } = deps
  const pickedTask = ref<{ slug: string; title: string } | null>(null)
  const taskQuery = ref('')
  const taskPickerOpen = ref(false)

  /** 建议文本：标题 + 描述 + 提示词拼接（服务端规则层用同一份语料口径） */
  function suggestText() {
    return [deps.title.value.trim(), deps.description.value.trim(), deps.prompt.value.trim()].filter(Boolean).join('\n')
  }
  /**
   * 挂题搜索：320ms 去抖 + **竞态守卫**（RF-3）。旧实现在慢网下会让
   * 后到的旧响应覆盖新结果，且 taskSearching 由最后返回者决定（spinner 提前消失）。
   * 少于 2 字不发请求 —— 由 minLength 承担，不再手写分支。
   */
  const { result: taskHits, loading: taskSearching, run: runTaskSearch } = useDebouncedFetch<TaskSuggestItem[]>({
    // 两个来源共用一份结果，阈值不同（选择器 2 字 / 正文自动推 8 字）——由 source 自己把关，
    // 不满足就返回空串短路（minLength 只当兜底下限）。
    source: () => {
      const typed = taskQuery.value.trim()
      if (typed) return typed.length >= 2 ? typed : ''
      if (pickedTask.value || taskPickerOpen.value) return ''
      const body = suggestText()
      return body.length >= 8 ? body : ''
    },
    fetcher: (q) => api.suggestTasks(q, 6),
    delay: 320,
    minLength: 2,
    empty: () => [], // 建议拉不到不影响上传本身，静默降级
  })
  function pickTask(x: TaskSuggestItem) {
    pickedTask.value = { slug: x.slug, title: x.title }
    taskPickerOpen.value = false
    taskQuery.value = ''
    taskHits.value = []
    aside('task', t('upload.asTask', '挂题是申请：管理员批准后它才会出现在同题对比里。'))
  }
  function clearTask() {
    pickedTask.value = null
  }
  function openTaskPicker() {
    taskPickerOpen.value = true
    // 打开就带着已填内容去搜一次：别给用户一个空框让他从头想
    // （用显式 run，不把正文塞进输入框 —— 塞进去会污染用户的输入框）
    const text = taskQuery.value.trim() || suggestText()
    if (text.length >= 2) void runTaskSearch(text)
  }
  /** 相似度显示成百分比（整数）：0.62 → 62% */
  function simPct(score: number): string {
    return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`
  }

  return { pickedTask, taskQuery, taskHits, taskSearching, taskPickerOpen, runTaskSearch, pickTask, clearTask, openTaskPicker, simPct }
}