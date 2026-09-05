// T15 拆分件（04 §5.4）：useUploadWizard —— 三步向导状态机 + 步内门禁（自 UploadView.vue 逐字迁出，行为不变）
// 设计依据见 docs/deepdemosv2/上传页重设计.md；一步只解决一个子问题：① 作品是什么 ② 哪个模型做的 ③ 说清楚 —— 步内不留必填盲区。
import { computed, nextTick, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { TagKeyInfo } from '../api/types'
import { t } from '../i18n'
import { tagLabel } from '../utils/funMode'

type DemoType = 'web' | 'zip' | 'link'
type SelectedMap = Record<string, { value: string; description: string }[]>

export function useUploadWizard(deps: {
  editSlug: string
  ui: { confirm: (o: { title: string; message: string; confirmText: string; danger?: boolean }) => Promise<boolean> }
  tagKeys: { value: TagKeyInfo[] }
  selected: Ref<SelectedMap>
  selectedCount: ComputedRef<number>
  tagsOk: ComputedRef<boolean>
  hasModel: ComputedRef<boolean>
  modelUncertain: ComputedRef<boolean>
  chosenModelNames: { value: string[] }
  title: Ref<string>
  description: Ref<string>
  prompt: Ref<string>
  demoType: Ref<DemoType>
  externalUrl: Ref<string>
  videoUrl: Ref<string>
  zipFile: Ref<File | null>
  coverFile: Ref<File | null>
  coverPreview: Ref<string>
  currentCover: Ref<string>
  modelHint: Ref<string>
  success: { value: { slug: string; status: string; created?: boolean } | null }
  aside: (key: string, text: string) => void
  stamp: (kind: string) => void
}) {
  const { editSlug, aside, stamp } = deps

  const step = ref(1)
  const showAdvanced = ref(false)
  const TOTAL_STEPS = 3

  /** 词表里的 model 值分成三类：精确型号 / 厂商族（知厂商不知型号）/ 其他兜底 */
  const modelValues = computed(() => deps.tagKeys.value.find((k) => k.key === 'model')?.values ?? [])
  const isFallbackValue = (v: string) => v === 'unspecified' || v === 'unknown' || v === 'ds-unknown' || v.endsWith('-unknown')
  const exactModels = computed(() => modelValues.value.filter((v) => !isFallbackValue(v.value)))
  /** 厂商族只从词表读（group=厂商名 → `<vendor>-unknown` 值），客户端不重算 slug：两处规则必漂移 */
  const vendorFamilies = computed(() => {
    const map = new Map<string, string>()
    for (const v of modelValues.value) {
      if (v.value.endsWith('-unknown') && v.group) map.set(v.group, v.value)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([vendor, value]) => ({ vendor, value }))
  })
  const unknownValue = computed(() => modelValues.value.find((v) => v.value === 'unspecified')?.value ?? '')
  const guessValue = computed(() => modelValues.value.find((v) => v.value === 'ds-unknown')?.value ?? '')

  function pickModel(value: string) {
    if (!value) return
    const keep = (deps.selected.value['model'] || []).filter((m) => isFallbackValue(m.value) === false && m.value !== value)
    const wanted = isFallbackValue(value)
    // 兜底与精确互斥：选了真的型号就别再留着 unspecified，反之亦然（归属统计才干净）
    deps.selected.value = {
      ...deps.selected.value,
      model: wanted ? [{ value, description: '' }] : [...keep.filter((m) => !isFallbackValue(m.value)), { value, description: '' }].slice(-1),
    }
    stamp('model')
  }

  const typeOk = computed(() => (deps.demoType.value === 'link' ? /^https?:\/\//.test(deps.externalUrl.value.trim()) : !!deps.zipFile.value || !!editSlug))
  const modelOk = computed(() => deps.hasModel.value)
  const titleOk = computed(() => !!deps.title.value.trim())
  const descOk = computed(() => deps.description.value.trim().length >= 10)
  const promptOk = computed(() => !!deps.prompt.value.trim())

  /** 步内问题：校验前移到这里，而不是等提交（错误拦截成本最低的位置） */
  const stepProblems = computed(() => {
    // 必须覆盖到第 4 步：模板无条件读 stepProblems[step].length，
    // 少一个键就会在核对页渲染时抛 TypeError 把整页崩掉（曾因此无法提交）。
    const out: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] }
    if (step.value === 1 && !typeOk.value) {
      out[1].push(deps.demoType.value === 'link' ? t('upload.errLink', '链接类型需要填写 http(s) 地址') : t('upload.errFile', '请上传文件（zip 或单个 .html/.svg）'))
    }
    if (step.value === 2 && !modelOk.value) {
      out[2].push(t('upload.errModel', '请选择模型：不确定就选「未标注 / 未定型号」这类兜底值，别空着'))
    }
    if (step.value === 3 && !titleOk.value) out[3].push(t('upload.errTitle', '请填写标题'))
    // 第 4 步：把"还差什么"汇总出来，核对页不该只给一个禁用按钮
    if (step.value === 4 && !readyToSubmit.value) {
      for (const c of checklist.value.filter((x) => x.must && !x.done)) out[4].push(c.label)
    }
    return out
  })
  const stepOk = computed(() => [true, typeOk.value, modelOk.value, titleOk.value])

  const checklist = computed(() => [
    { label: t('upload.clKind', '选好类型并给出文件/链接'), done: typeOk.value, step: 1, must: true },
    { label: t('upload.clModel', '声明是哪个模型做的'), done: modelOk.value, step: 2, must: true },
    { label: t('upload.clTitle', '写个说得清的标题'), done: titleOk.value, step: 3, must: true },
    { label: t('upload.clDesc', '补 2 句描述'), done: descOk.value, step: 3, must: false },
    { label: t('upload.clPrompt', '附第一轮提示词（同提示词对照靠它）'), done: promptOk.value, step: 3, must: false },
    { label: t('upload.clTags', '再挑几个描述性标签'), done: deps.selectedCount.value >= 2, step: 3, must: false },
    { label: t('upload.clCover', '配一张封面'), done: !!deps.coverFile.value || !!deps.currentCover.value, step: 3, must: false },
  ])
  const mustDone = computed(() => checklist.value.filter((c) => c.must && c.done).length)
  const mustTotal = computed(() => checklist.value.filter((c) => c.must).length)
  const allDone = computed(() => checklist.value.filter((c) => c.done).length)
  const readyToSubmit = computed(() => mustDone.value === mustTotal.value && !!deps.tagsOk.value)

  // 门禁错误与服务器错误分开：前者随用户补全自动消失，后者必须保留到下一次提交
  const stepError = ref('')
  watch([typeOk, modelOk, titleOk, deps.selectedCount], () => {
    if (stepError.value && !(stepProblems.value[step.value]?.length ?? 0)) stepError.value = ''
  })

  function goStep(n: number) {
    if (n < 1 || n > TOTAL_STEPS + 1) return
    stepError.value = ''
    step.value = n
  }
  function next() {
    if (step.value === 2 && !modelOk.value) {
      stepError.value = t('upload.errModel', '请选择模型：不确定就选「未标注 / 未定型号」这类兜底值，别空着')
      return
    }
    goStep(step.value + 1)
  }

  // 切步后把焦点送到该步第一个控件：键盘用户不必从头 Tab
  watch(step, async (n) => {
    await nextTick()
    const el = document.querySelector<HTMLElement>(`[data-step-focus="${n}"]`)
    el?.focus?.()
  })

  // 脏状态离开页面提醒（未提交的劳动不该被一次误点抹掉）
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (deps.success.value || !isDirty.value) return
    e.preventDefault()
    e.returnValue = ''
  }
  const isDirty = computed(
    () => !!deps.zipFile.value || !!deps.coverFile.value || !!deps.title.value.trim() || !!deps.description.value.trim() || !!deps.prompt.value.trim() || deps.selectedCount.value > 0,
  )

  interface ReviewRow {
    label: string
    value: string
    note?: string
    mono?: boolean
    step: number
  }
  /** 核对页摘要：数据驱动，每行统一带一个右对齐的「改」直达对应步 */
  const reviewRows = computed<ReviewRow[]>(() => {
    const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s) || '—'
    return [
      {
        label: t('upload.sumKind', '作品'),
        value: `${typeLabelNow.value} · ${deps.demoType.value === 'link' ? deps.externalUrl.value || '—' : deps.zipFile.value ? deps.zipFile.value.name : editSlug ? t('upload.keepOldFile', '保留原文件') : '—'}`,
        step: 1,
      },
      {
        label: t('upload.sumModel', '模型'),
        value: deps.chosenModelNames.value.map((m) => tagLabel(m)).join(' / ') || '—',
        note: deps.modelUncertain.value && deps.modelHint.value ? deps.modelHint.value : '',
        step: 2,
      },
      { label: t('upload.sumTitle', '标题'), value: deps.title.value || '—', step: 3 },
      { label: t('upload.sumDesc', '描述'), value: deps.description.value || '—', step: 3 },
      { label: t('upload.sumPrompt', '提示词'), value: clip(deps.prompt.value), mono: true, step: 3 },
      { label: t('upload.sumTags', '标签'), value: selectedList.value.map((s) => `${s.key}:${s.value}`).join(' · ') || '—', step: 3 },
    ]
  })

  const stepDefs = computed(() => [
    { n: 1, title: t('upload.step1Title', '作品是什么'), hint: t('upload.step1Hint', '类型 + 文件/链接') },
    { n: 2, title: t('upload.step2Title', '谁做的'), hint: t('upload.step2Hint', '哪个模型，必答') },
    { n: 3, title: t('upload.step3Title', '说清楚'), hint: t('upload.step3Hint', '标题、描述、提示词、标签') },
    { n: 4, title: t('upload.step4Title', '核对发布'), hint: t('upload.step4Hint', '最后一遍确认') },
  ])

  const typeOptions = computed(() => [
    { value: 'web' as const, label: t('upload.typeWebCard', '网页应用'), hint: t('upload.typeWebHint', 'zip 或单个 .html/.svg，站内直接预览') },
    { value: 'zip' as const, label: t('upload.typeZipCard', '文件包'), hint: t('upload.typeZipHint', '只给下载，不预览') },
    { value: 'link' as const, label: t('upload.typeLinkCard', '外部链接'), hint: t('upload.typeLinkHint', '跳到站外打开') },
  ])
  const typeLabelNow = computed(() => typeOptions.value.find((o) => o.value === deps.demoType.value)?.label || deps.demoType.value)
  const barPct = computed(() => Math.round((allDone.value / Math.max(1, checklist.value.length)) * 100))

  const selectedList = computed(() =>
    Object.entries(deps.selected.value).flatMap(([key, values]) =>
      values.map((x) => ({ key, value: x.value, description: x.description })),
    ),
  )

  // 步骤 2 的型号搜索：只搜精确型号，兜底值不混进主路径（它们各有独立出口）
  const modelQuery = ref('')
  const filteredExact = computed(() => {
    const q = modelQuery.value.trim().toLowerCase()
    const searching = q.length > 0
    const list = exactModels.value.filter((v) => {
      // 不搜的时候只给"站内真有人用过"的型号：0 作品的冷门值占首屏是纯噪音，
      // 但它仍在词表里 —— 一搜就该出现（否则作者会以为站里不支持这个型号）
      if (!searching && v.demo_count === 0) return false
      if (!searching) return true
      return v.value.toLowerCase().includes(q) || (v.description || '').toLowerCase().includes(q)
    })
    // 先按厂商聚、再按作品数：一屏里同厂商自然相邻，扫视成本远低于纯热度排序
    return [...list]
      .sort((a, b) => (a.group || 'zzz').localeCompare(b.group || 'zzz') || b.demo_count - a.demo_count)
      .slice(0, searching ? 40 : 30)
  })
  const fbVendorOpen = ref(false)

  // 可撤销：选错了不该被锁住（每个"决定"都配一个"改主意"）
  const fileInputKey = ref(0) // 重挂原生 file input 才能真的清空
  function clearFile() {
    deps.zipFile.value = null
    fileInputKey.value += 1
  }
  function clearCover() {
    deps.coverFile.value = null
    deps.coverPreview.value = ''
  }
  function clearModel() {
    deps.selected.value = { ...deps.selected.value, model: [] }
    deps.modelHint.value = ''
    fbVendorOpen.value = false
    aside('undo', t('upload.asUndoModel', '改主意了。上一句撤回。'))
  }

  return {
    step, showAdvanced, TOTAL_STEPS, isFallbackValue,
    exactModels, vendorFamilies, unknownValue, guessValue, pickModel,
    typeOk, modelOk, titleOk, descOk, promptOk,
    stepProblems, stepOk, checklist, mustDone, mustTotal, allDone, readyToSubmit,
    stepError, goStep, next, isDirty, onBeforeUnload,
    reviewRows, stepDefs, typeOptions, typeLabelNow, barPct,
    modelQuery, filteredExact, fbVendorOpen,
    fileInputKey, clearFile, clearCover, clearModel,
    selectedList,
  }
}