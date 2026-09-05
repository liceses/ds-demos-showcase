// T15 拆分件（04 §5.4）：useUploadPlayable —— 旁白/盖章/称号可玩性层（自 UploadView.vue 逐字迁出，行为不变）
// 都可一键关，不尊重注意力就不算设计
import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { api } from '../api'
import { t } from '../i18n'

type ChecklistItem = { label: string; done: boolean; step: number; must: boolean }

export function useUploadPlayable(deps: {
  checklist: { value: ChecklistItem[] }
  allDone: { value: number }
  mustDone: { value: number }
  chosenModelNames: { value: string[] }
  modelUncertain: { value: boolean }
  hasModel: { value: boolean }
  prompt: Ref<string>
  idempotencyKey: Ref<string>
}) {
  const asideOn = ref(localStorage.getItem('upload.aside') !== '0')
  const lastAside = ref('')
  const asideKey = ref('')
  let asideTimer: ReturnType<typeof setTimeout> | null = null
  /** 旁白：`key` 用于同一事件不重复叨叨（连点同一 chip 不该被念两遍） */
  function aside(key: string, text: string) {
    if (!asideOn.value || asideKey.value === key) return
    asideKey.value = key
    lastAside.value = text
    if (asideTimer) clearTimeout(asideTimer)
    asideTimer = setTimeout(() => {
      lastAside.value = ''
      asideKey.value = ''
    }, 4200)
  }
  function toggleAside() {
    asideOn.value = !asideOn.value
    localStorage.setItem('upload.aside', asideOn.value ? '1' : '0')
    if (!asideOn.value) {
      lastAside.value = ''
      asideKey.value = ''
    }
  }

  const stamped = ref<Record<string, boolean>>({})
  let stampTimer: ReturnType<typeof setTimeout> | null = null
  function stamp(kind: string) {
    stamped.value[kind] = true
    if (stampTimer) clearTimeout(stampTimer)
    stampTimer = setTimeout(() => (stamped.value = {}), 1100)
  }

  /** 称号：把"完成度"翻译成人话（数据真实，只是换个说法） */
  const rank = computed(() => {
    const total = deps.checklist.value.length || 1
    const p = deps.allDone.value / total
    if (!deps.mustDone.value) return { label: t('upload.rank0', '草稿'), hint: t('upload.rank0Hint', '还差必答项') }
    if (p < 0.5) return { label: t('upload.rank1', '半成品'), hint: t('upload.rank1Hint', '能提交，但别人看不懂') }
    if (p < 0.8) return { label: t('upload.rank2', '说得清'), hint: t('upload.rank2Hint', '再补两项就更像一次实验') }
    if (p < 1) return { label: t('upload.rank3', '认真的人'), hint: t('upload.rank3Hint', '离满格差一点点') }
    return { label: t('upload.rank4', '民间科研杰作'), hint: t('upload.rank4Hint', '全部填完，可以签发了') }
  })

  // 实验编号：幂等键本来就有，给它一个"实验记录"的读法（不改后端语义）
  const expNo = computed(() => (deps.idempotencyKey.value || '').replace(/-/g, '').slice(-6).toUpperCase())

  /** 选中模型后的站内战绩：有趣且真的有用（别在自己没胜算的题上硬拼） */
  const modelStats = ref<{ name: string; demo_count: number; rating_avg: number | null } | null>(null)
  const statsLoading = ref(false)
  let statsTimer: ReturnType<typeof setTimeout> | null = null
  async function loadStats() {
    const first = deps.chosenModelNames.value[0]
    if (!first) {
      modelStats.value = null
      return
    }
    statsLoading.value = true
    try {
      const d = await api.getModel(first)
      modelStats.value = { name: d.name, demo_count: d.demo_count, rating_avg: d.rating_avg ?? null }
    } catch {
      modelStats.value = null // 拉不到就不演，安静退场
    } finally {
      statsLoading.value = false
    }
  }
  watch(deps.chosenModelNames as ComputedRef<string[]> & Ref<string[]>, (v) => {
    if (v.length) {
      if (statsTimer) clearTimeout(statsTimer)
      statsTimer = setTimeout(loadStats, 260)
    } else {
      modelStats.value = null
    }
  })

  /** 没灵感就抽一题：把"挑战"这条闭环真正接上（只跳题目页，不自动挂题） */
  const drawnTask = ref<{ slug: string; title: string } | null>(null)
  const drawing = ref(false)
  async function drawTask() {
    drawing.value = true
    try {
      const r = await api.listTasks({ sort: 'demos', page_size: 30 })
      const pool = r.items.filter((t2) => t2.demo_count > 0)
      const pick = (pool.length ? pool : r.items)[Math.floor(Math.random() * (pool.length || r.items.length || 1))]
      drawnTask.value = pick ? { slug: pick.slug, title: pick.title } : null
      if (drawnTask.value) aside('draw', t('upload.asDraw', '抽到一题：{t}', { t: drawnTask.value.title }))
    } catch {
      drawnTask.value = null
    } finally {
      drawing.value = false
    }
  }

  // 旁白：真实事件驱动，不搞随机鸡汤
  watch(deps.modelUncertain as ComputedRef<boolean> & Ref<boolean>, (on) => {
    if (on && deps.hasModel.value) aside('unc', t('upload.asUncertain', '诚实比准确稀有 —— 站方日后会来找你确认。'))
  })
  watch(deps.prompt, (v) => {
    if (v.trim().length > 24) aside('prompt', t('upload.asPrompt', '这条提示词会让别人能复刻你的实验。'))
  })
  watch(deps.hasModel as ComputedRef<boolean> & Ref<boolean>, (on) => {
    if (on && !deps.modelUncertain.value) aside('model', t('upload.asModel', '署名完成。它会出现在模型页和同题对比里。'))
  })

  return { asideOn, lastAside, toggleAside, stamped, rank, expNo, modelStats, statsLoading, drawnTask, drawing, drawTask, aside, stamp }
}