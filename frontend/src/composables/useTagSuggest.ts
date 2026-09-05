// T15 拆分件（04 §5.4）：useTagSuggest —— 标签建议包规则推导（自 UploadView.vue 逐字迁出，行为不变）
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { DerivedTag } from '../api/types'
import { api } from '../api'
import { t } from '../i18n'

type SelectedMap = Record<string, { value: string; description: string }[]>

/** §4.2 标签建议包（规则推导，收下或跳过都行） */
export function useTagSuggest(deps: {
  editSlug: string
  title: Ref<string>
  description: Ref<string>
  prompt: Ref<string>
  selected: Ref<SelectedMap>
  stamp: (kind: string) => void
  aside: (key: string, text: string) => void
}) {
  const { editSlug, stamp, aside } = deps
  const pack = ref<DerivedTag[]>([])
  const packLoading = ref(false)
  const packIgnored = ref(false) // 作者主动收起后不再自动弹
  let packTimer: ReturnType<typeof setTimeout> | null = null

  function isSelectedTag(key: string, value: string) {
    return (deps.selected.value[key] || []).some((x) => x.value === value)
  }

  /** type 是单值语义：已有任一 type 就不再推别的（巡检发现多值 28 件就是历史教训） */
  const packVisible = computed(() =>
    pack.value.filter((x) => !isSelectedTag(x.key, x.value) && !(x.key === 'type' && (deps.selected.value['type'] || []).length)),
  )

  async function fetchPack() {
    const text = `${deps.title.value} ${deps.description.value} ${deps.prompt.value}`.trim()
    if (text.length < 6 || editSlug) {
      pack.value = []
      return
    }
    packLoading.value = true
    try {
      const r = await api.deriveTags({ title: deps.title.value, description: deps.description.value, prompt: deps.prompt.value, limit: 6 })
      pack.value = r.items
    } catch {
      pack.value = [] // 建议包是增值信息，失败绝不打扰上传流程
    } finally {
      packLoading.value = false
    }
  }

  function schedulePack() {
    if (packTimer) clearTimeout(packTimer)
    packTimer = setTimeout(fetchPack, 700) // 防抖：打字时不打扰，停下再推
  }

  function addSuggestion(s: DerivedTag) {
    const list = deps.selected.value[s.key] ? [...deps.selected.value[s.key]] : []
    if (!list.some((x) => x.value === s.value)) list.push({ value: s.value, description: s.label !== s.value ? s.label : '' })
    deps.selected.value = { ...deps.selected.value, [s.key]: list }
  }

  function addAllSuggestions() {
    const next: SelectedMap = { ...deps.selected.value }
    for (const s of packVisible.value) {
      const list = next[s.key] ? [...next[s.key]] : []
      if (s.key === 'type' && list.length) continue
      if (!list.some((x) => x.value === s.value)) list.push({ value: s.value, description: s.label !== s.value ? s.label : '' })
      next[s.key] = list
    }
    deps.selected.value = next
    stamp('pack')
    aside('pack', t('upload.asPack', '系统查了词表，你签了字 —— 出处就算你的。'))
  }

  watch([deps.title, deps.description, deps.prompt], schedulePack)

  /** 建议包被「不用了」收掉后必须还能叫回来（静默永久隐藏是设计失礼） */
  function bringBackPack() {
    packIgnored.value = false
    void fetchPack()
  }

  return { pack, packLoading, packIgnored, packVisible, addSuggestion, addAllSuggestions, bringBackPack }
}