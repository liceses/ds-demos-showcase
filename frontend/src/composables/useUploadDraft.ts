// T15 拆分件（04 §5.4）：useUploadDraft —— 草稿持久化（自 UploadView.vue 逐字迁出，行为不变）
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { t } from '../i18n'

type DemoType = 'web' | 'zip' | 'link'
type SelectedMap = Record<string, { value: string; description: string }[]>

/**
 * 草稿持久化：跳走/刷新/误关都不该把已填的东西抹掉
 * 边界（必须如实告知）：File 对象存不进 localStorage，所以文件与封面不恢复，需重选。
 */
export function useUploadDraft(deps: {
  editSlug: string
  title: Ref<string>
  description: Ref<string>
  prompt: Ref<string>
  videoUrl: Ref<string>
  externalUrl: Ref<string>
  demoType: Ref<DemoType>
  modelHint: Ref<string>
  selected: Ref<SelectedMap>
  step: Ref<number>
  idempotencyKey: Ref<string>
  aside: (key: string, text: string) => void
}) {
  const { editSlug, aside } = deps
  const DRAFT_KEY = 'upload.draft.v1'
  const draftFound = ref<{ savedAt: number; title: string } | null>(null)
  let draftTimer: ReturnType<typeof setTimeout> | null = null

  function draftPayload() {
    return {
      v: 1,
      title: deps.title.value,
      description: deps.description.value,
      prompt: deps.prompt.value,
      videoUrl: deps.videoUrl.value,
      externalUrl: deps.externalUrl.value,
      demoType: deps.demoType.value,
      modelHint: deps.modelHint.value,
      selected: deps.selected.value,
      step: deps.step.value,
      // 连幂等键一起存：中途真提交过一次的话，回来重试不会被当成新作品
      idem: deps.idempotencyKey.value,
      savedAt: Date.now(),
    }
  }
  function hasDraftContent(p: ReturnType<typeof draftPayload>) {
    return !!(p.title.trim() || p.description.trim() || p.prompt.trim() || Object.keys(p.selected || {}).length)
  }
  function scheduleDraftSave() {
    if (editSlug) return // 编辑态存的是某件作品，不该污染创建态草稿
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      const p = draftPayload()
      try {
        if (hasDraftContent(p)) localStorage.setItem(DRAFT_KEY, JSON.stringify(p))
        else localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* 隐私模式/配额满：草稿是增值能力，失败绝不影响上传 */
      }
    }, 500)
  }
  function loadDraftRaw(): any | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  function resumeDraft() {
    const p = loadDraftRaw()
    if (!p) {
      draftFound.value = null
      return
    }
    deps.title.value = p.title || ''
    deps.description.value = p.description || ''
    deps.prompt.value = p.prompt || ''
    deps.videoUrl.value = p.videoUrl || ''
    deps.externalUrl.value = p.externalUrl || ''
    deps.demoType.value = p.demoType || 'web'
    deps.modelHint.value = p.modelHint || ''
    deps.selected.value = p.selected && typeof p.selected === 'object' ? p.selected : {}
    if (p.idem) deps.idempotencyKey.value = p.idem
    deps.step.value = p.step || 1
    draftFound.value = null
    aside('resume', t('upload.asResume', '接上了。文件记得重新选一次。'))
  }
  function discardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* 同上，静默 */
    }
    draftFound.value = null
  }
  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* 同上 */
    }
  }
  watch([deps.title, deps.description, deps.prompt, deps.videoUrl, deps.externalUrl, deps.demoType, deps.modelHint, deps.selected], scheduleDraftSave)

  return { draftFound, resumeDraft, discardDraft, clearDraft, loadDraftRaw, hasDraftContent }
}