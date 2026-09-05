// T15 拆分件（04 §5.4）：useTaskMount —— 挂题：pickedTask + 防抖搜索 + 相似度（自 UploadView.vue 逐字迁出，行为不变）
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TaskSuggestItem } from '../api/types'
import { api } from '../api'
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
  const taskHits = ref<TaskSuggestItem[]>([])
  const taskSearching = ref(false)
  const taskPickerOpen = ref(false)
  let taskTimer: ReturnType<typeof setTimeout> | null = null

  /** 建议文本：标题 + 描述 + 提示词拼接（服务端规则层用同一份语料口径） */
  function suggestText() {
    return [deps.title.value.trim(), deps.description.value.trim(), deps.prompt.value.trim()].filter(Boolean).join('\n')
  }
  async function runTaskSearch(q: string) {
    if (q.trim().length < 2) {
      taskHits.value = []
      return
    }
    taskSearching.value = true
    try {
      taskHits.value = await api.suggestTasks(q.trim(), 6)
    } catch {
      taskHits.value = [] // 建议拉不到不影响上传本身，静默降级
    } finally {
      taskSearching.value = false
    }
  }
  function scheduleTaskSearch(q: string) {
    if (taskTimer) clearTimeout(taskTimer)
    taskTimer = setTimeout(() => void runTaskSearch(q), 320)
  }
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
    const text = taskQuery.value.trim() || suggestText()
    if (text.length >= 2) void runTaskSearch(text)
  }
  /** 相似度显示成百分比（整数）：0.62 → 62% */
  function simPct(score: number): string {
    return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`
  }
  // 填了正文就给建议（不必先点按钮）：让"有这道题"这件事自己浮出来
  watch([deps.title, deps.description, deps.prompt], () => {
    if (pickedTask.value || taskPickerOpen.value) return
    const text = suggestText()
    if (text.length >= 8) scheduleTaskSearch(text)
  })

  return { pickedTask, taskQuery, taskHits, taskSearching, taskPickerOpen, runTaskSearch, scheduleTaskSearch, pickTask, clearTask, openTaskPicker, simPct }
}