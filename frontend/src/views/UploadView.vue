<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useTagsStore } from '../stores/tags'
import { useUiStore } from '../stores/ui'
import type { DemoDetail, TaskDetail } from '../api/types'
import TagPicker from '../components/TagPicker.vue'
import type { TagPick } from '../components/TagPicker.vue'
import { t } from '../i18n'
import { tagLabel } from '../utils/funMode'
import { useUploadDraft } from '../composables/useUploadDraft'
import { useTaskMount } from '../composables/useTaskMount'
import { useTagSuggest } from '../composables/useTagSuggest'
import { useUploadPlayable } from '../composables/useUploadPlayable'
import { useUploadWizard } from '../composables/useUploadWizard'

const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()
const editSlug = typeof route.query.slug === 'string' ? route.query.slug : ''
// v2 B4′：从题目页「用你的模型挑战此题」进来 —— 带题面预填 + 一键复制原题
const challengeSlug = typeof route.query.task === 'string' ? route.query.task : ''
const challenge = ref<TaskDetail | null>(null)

const title = ref('')
const description = ref('')
const demoType = ref<'web' | 'zip' | 'link'>('web')
const externalUrl = ref('')
const prompt = ref('')
const videoUrl = ref('')
const coverFile = ref<File | null>(null)
const zipFile = ref<File | null>(null)
const commitMessage = ref('')
const keepOldVersion = ref(false)
const submitting = ref(false)
const uploadProgress = ref(0)
const error = ref('')
const dupSlug = ref<string | null>(null)
const success = ref<{ slug: string; status: string; created?: boolean } | null>(null)
const idempotencyKey = ref('')
const uploadCode = ref('')
const forceUpload = ref(false)
const loading = ref(false)

// 标签选择器（公共 TagPicker）
const tagsStore = useTagsStore()
const tagKeys = computed(() => tagsStore.keys)
const selected = ref<Record<string, { value: string; description: string }[]>>({})
const initialTagsKey = ref('')
const tagsOpen = ref(false)

const selectedTags = computed<TagPick[]>({
  get: () =>
    Object.entries(selected.value).flatMap(([key, values]) =>
      values.map((x) => ({ key, value: x.value, description: x.description })),
    ),
  set: (arr) => {
    const map: Record<string, { value: string; description: string }[]> = {}
    for (const t of arr) {
      ;(map[t.key] = map[t.key] || []).push({ value: t.value, description: t.description || '' })
    }
    selected.value = map
  },
})
const selectedCount = computed(() => Object.values(selected.value).reduce((n, arr) => n + arr.length, 0))
// Q2：模型必填，但「不确定」有正门 —— 选了兜底位就多问一句依据（供日后归属工作台收敛）
const FALLBACK_MODEL_RE = /(^|-)unknown$|^unspecified$/i
/** Q2：模型必选 —— 上传页据此把「可选」措辞与校验切成必答态 */
const hasModel = computed(() => (selected.value['model'] || []).length > 0)
const modelUncertain = computed(() =>
  (selected.value['model'] || []).some((m) => FALLBACK_MODEL_RE.test(m.value)),
)
const modelHint = ref('')
// chosenModelNames：selected['model'] 的派生（useUploadPlayable 与 useUploadWizard 共同消费）
const chosenModelNames = computed(() => (selected.value['model'] || []).map((m) => m.value))
/** 标签至少 1 个：与后端 `_require_model_tag`/tags≥1 同规则（模型已含在 tags 内时自然满足）——
 *  提前声明：useUploadWizard 的 readyToSubmit 以 dep 消费 */
const tagsOk = computed(() => selectedCount.value >= 1)

// ================= 向导状态机（T15 拆分件 useUploadWizard；逐字迁出行为不变） =================
// 一步只解决一个子问题：① 作品是什么 ② 哪个模型做的 ③ 说清楚 —— 步内不留必填盲区。
// 依赖序：本件产 checklist/stepError 等 → playable 经 getter 惰性消费（渲染期求值）→ 其余件消费 aside/stamp。
// 编辑模式附加状态（提前声明：wizard 的 checklist 需读 currentCover，clearCover 归零 coverPreview）
const demoTitle = ref('')
const currentCover = ref('')
const coverPreview = ref('')
const denied = ref(false)
const initial = ref({ title: '', description: '', demoType: 'web', externalUrl: '', prompt: '', videoUrl: '' })

// 可玩性（T15 拆分件 useUploadPlayable）：旁白 aside / 盖章 stamp 由本件产出，供 tagSuggest/taskMount/draft 与
// pickModel/resetAll 等消费；getter 显式返回类型断开 playable↔wizard 类型推断环（值流：渲染期求值）
const {
  asideOn, lastAside, toggleAside, stamped, rank, expNo, modelStats, statsLoading, drawnTask, drawing, drawTask, aside, stamp,
} = useUploadPlayable({
  checklist: { get value(): { label: string; done: boolean; step: number; must: boolean }[] { return wizard.checklist.value } },
  allDone: { get value(): number { return wizard.allDone.value } },
  mustDone: { get value(): number { return wizard.mustDone.value } },
  chosenModelNames, modelUncertain, hasModel, prompt, idempotencyKey,
})

// ---------- §4.2 标签建议包（T15 拆分件 useTagSuggest；逐字迁出行为不变） ----------
const {
  pack, packLoading, packIgnored, packVisible, addSuggestion, addAllSuggestions, bringBackPack,
} = useTagSuggest({ editSlug, title, description, prompt, selected, stamp, aside })

// 向导状态机（T15 拆分件 useUploadWizard）
const wizard = useUploadWizard({
  editSlug, ui, tagKeys, selected, selectedCount, tagsOk, hasModel, modelUncertain, chosenModelNames,
  title, description, prompt, demoType, externalUrl, videoUrl, zipFile, coverFile, coverPreview, currentCover, modelHint,
  success, aside, stamp,
})
const {
  step, showAdvanced, pickModel, descOk, promptOk,
  stepProblems, stepOk, checklist, mustDone, mustTotal, allDone, readyToSubmit,
  stepError, goStep, next, isDirty, onBeforeUnload,
  reviewRows, stepDefs, typeOptions, barPct,
  modelQuery, filteredExact, fbVendorOpen, fileInputKey, clearFile, clearCover, clearModel, selectedList,
  vendorFamilies, unknownValue, guessValue,
} = wizard

/** 清空重来：整页只有一个破坏性动作，所以必须二次确认（跨件编排：清向导态+建议包+草稿，留主件） */
async function resetAll() {
  const ok = await ui.confirm({
    title: t('upload.resetConfirmTitle', '清空重来？'),
    message: t('upload.resetConfirmMsg', '标题、描述、提示词、标签、文件与封面都会被清掉，无法恢复。'),
    confirmText: t('upload.resetDo', '清空'),
    danger: true,
  })
  if (!ok) return
  title.value = ''
  description.value = ''
  prompt.value = ''
  videoUrl.value = ''
  externalUrl.value = ''
  uploadCode.value = ''
  modelHint.value = ''
  pack.value = []
  selected.value = {}
  clearFile()
  clearCover()
  error.value = ''
  stepError.value = ''
  success.value = null
  idempotencyKey.value = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`) as string
  clearDraft()
  step.value = 1
  aside('reset', t('upload.asReset', '白纸一张。'))
}
/** 挑战横幅可摘掉：不想挂题就不挂，别被 URL 参数绑架 */
const challengeOff = ref(false)
function dropChallenge() {
  challengeOff.value = true
  pickedTask.value = null
  if (title.value.startsWith(`${t('upload.challengePrefix', '挑战')}：`)) title.value = ''
}

// ---------- 挂题（T15 拆分件 useTaskMount；逐字迁出行为不变） ----------
// 唯一状态源：从题目页带 ?task= 进来、或在这里主动选，都写进 pickedTask（loadChallenge 亦写此源）。
const {
  pickedTask, taskQuery, taskHits, taskSearching, taskPickerOpen, runTaskSearch, scheduleTaskSearch, pickTask, clearTask, openTaskPicker, simPct,
} = useTaskMount({ title, description, prompt, aside })

// ---------- 草稿持久化（T15 拆分件 useUploadDraft；逐字迁出行为不变） ----------
// 边界（必须如实告知）：File 对象存不进 localStorage，所以文件与封面不恢复，需重选。
const {
  draftFound, resumeDraft, discardDraft, clearDraft, loadDraftRaw, hasDraftContent,
} = useUploadDraft({
  editSlug, title, description, prompt, videoUrl, externalUrl, demoType, modelHint, selected, step, idempotencyKey, aside,
})

// 宽屏（≥1281px）两栏布局：标签面板常驻右侧；窄屏默认收起、点横条展开
const isWide = ref(false)
let wideMq: MediaQueryList | null = null
function onWideChange(e: MediaQueryListEvent) {
  isWide.value = e.matches
}
onMounted(() => {
  wideMq = window.matchMedia('(min-width: 1281px)')
  isWide.value = wideMq.matches
  wideMq.addEventListener('change', onWideChange)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  wideMq?.removeEventListener('change', onWideChange)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

// （编辑模式附加状态已在 useUploadWizard 调用前声明——原此处的重复块随 T15 拆分移除）

function collectTags() {
  const out: (string | { key: string; value: string; description?: string })[] = []
  for (const [key, values] of Object.entries(selected.value)) {
    const k = tagKeys.value.find((x) => x.key === key)
    for (const v of values) {
      if (k?.mode === 'fixed') {
        out.push(`${key}:${v.value}`)
      } else {
        out.push({ key, value: v.value, description: v.description || undefined })
      }
    }
  }
  return out
}

function prefillTags(tags: { key: string; value: string }[]) {
  const map: Record<string, { value: string; description: string }[]> = {}
  for (const t of tags) {
    if (t.key === 'author') continue
    if (!tagKeys.value.some((k) => k.key === t.key)) continue
    ;(map[t.key] = map[t.key] || []).push({ value: t.value, description: '' })
  }
  selected.value = map
  initialTagsKey.value = JSON.stringify(map)
}

// v2 B4′：挑战上下文 —— 题面来自 /tasks/{slug}，原题提示词取成员作品里第一条非空的
const challengePrompt = computed(() =>
  (challenge.value?.demos.find((d) => (d.prompt || '').trim())?.prompt || '').trim(),
)
const promptCopied = ref(false)

async function loadChallenge() {
  if (!challengeSlug || editSlug) return
  try {
    challenge.value = await api.getTask(challengeSlug)
    // 带 ?task= 进来时，选择器与横幅共用同一个状态源
    pickedTask.value = { slug: challenge.value.slug, title: challenge.value.title }
    // 有草稿时不抢标题：作者填过的东西优先于系统预填
    if (!title.value.trim() && !draftFound.value) {
      title.value = `${t('upload.challengePrefix', '挑战')}：${challenge.value.title}`
    }
  } catch {
    challenge.value = null
  }
}

function fillChallengePrompt() {
  if (challengePrompt.value) prompt.value = challengePrompt.value
}

async function copyChallengePrompt() {
  if (!challengePrompt.value) return
  try {
    await navigator.clipboard.writeText(challengePrompt.value)
    promptCopied.value = true
    setTimeout(() => (promptCopied.value = false), 1400)
  } catch {
    /* 剪贴板被拒时用户可手动选中复制 */
  }
}

onMounted(async () => {
  idempotencyKey.value = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`) as string
  // 只探测、不自动覆盖：是否续填由作者决定（误恢复比误清空更难被发现）
  if (!editSlug) {
    const p = loadDraftRaw()
    if (p && hasDraftContent(p)) draftFound.value = { savedAt: p.savedAt || 0, title: (p.title || '').slice(0, 24) }
  }
  void loadChallenge()
  try {
    await tagsStore.load()
  } catch {
    /* 静默 */
  }
  if (editSlug) {
    loading.value = true
    try {
      const demo: DemoDetail = await api.getDemo(editSlug)
      demoTitle.value = demo.title
      currentCover.value = demo.cover_url
      title.value = demo.title
      description.value = demo.description
      demoType.value = demo.demo_type || 'web'
      externalUrl.value = demo.external_url || ''
      prompt.value = demo.prompt || ''
      videoUrl.value = demo.video_url || ''
      prefillTags(demo.tags)
      initial.value = {
        title: demo.title,
        description: demo.description,
        demoType: demo.demo_type || 'web',
        externalUrl: demo.external_url || '',
        prompt: demo.prompt || '',
        videoUrl: demo.video_url || '',
      }
      const canEdit = auth.user?.role === 'admin' || !!demo.is_author
      if (!canEdit) {
        denied.value = true
        error.value = t('upload.errDenied', '你没有权限编辑这个 Demo')
      } else {
        // 编辑的意图几乎总是改信息，直接落在第 3 步，省掉两次空点击
        step.value = 3
      }
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }
})

function onCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] || null
  coverFile.value = file
  coverPreview.value = ''
  if (file) {
    const reader = new FileReader()
    reader.onload = () => {
      coverPreview.value = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  }
}

function onZipChange(e: Event) {
  zipFile.value = (e.target as HTMLInputElement).files?.[0] || null
}

const hasChanges = computed(() => {
  if (!editSlug) return true
  return (
    title.value.trim() !== initial.value.title ||
    description.value.trim() !== initial.value.description ||
    demoType.value !== initial.value.demoType ||
    externalUrl.value.trim() !== initial.value.externalUrl ||
    prompt.value.trim() !== initial.value.prompt ||
    videoUrl.value.trim() !== initial.value.videoUrl ||
    JSON.stringify(selected.value) !== initialTagsKey.value ||
    !!coverFile.value ||
    !!zipFile.value ||
    !!commitMessage.value.trim()
  )
})

async function submit() {
  // 防抖：提交中忽略重复触发（连点 / 回车连按）
  if (submitting.value) return
  // 向导门禁：先定位到第一个不满足的必答步，把错误带到问题现场（而不是只弹一条横幅）
  const badStep = [1, 2, 3].find((n) => !stepOk.value[n])
  if (badStep) {
    step.value = badStep
    stepError.value = stepProblems.value[badStep][0] || t('upload.errStep', '这一步还差必填项')
    return
  }
  if (!title.value.trim()) {
    error.value = t('upload.errTitle', '请填写标题')
    return
  }
  if (demoType.value === 'link') {
    if (!/^https?:\/\//.test(externalUrl.value.trim())) {
      error.value = t('upload.errLink', '链接类型需要填写 http(s) 地址')
      return
    }
  } else if (!editSlug && !zipFile.value) {
    error.value = t('upload.errFile', '请上传文件（zip 或单个 .html/.svg）')
    return
  }
  const tags = collectTags()
  // Q2：模型必选先校验（与后端同规则）；失败时展开标签面板 —— 选择器默认就落在「模型」键上
  if (!hasModel.value && !editSlug) {
    error.value = t('upload.errModel', '请选择模型：不确定就选「未标注 / 未定型号」这类兜底值，别空着')
    tagsOpen.value = true
    return
  }
  if (!tags.length) {
    error.value = t('upload.errTags', '请至少选择一个标签（标签是作品分类的关键）')
    tagsOpen.value = true
    return
  }

  // 编辑模式：没有任何改动时阻止提交，避免生成空公告
  if (editSlug && !hasChanges.value) {
    error.value = t('upload.errNoChanges', '没有任何修改，未提交')
    return
  }

  submitting.value = true
  uploadProgress.value = 0
  error.value = ''
  dupSlug.value = null
  success.value = null
  const onProgress = (p: number) => {
    uploadProgress.value = p
  }
  try {
    if (editSlug) {
      await api.updateDemo(
        editSlug,
        {
          title: title.value.trim(),
          description: description.value.trim(),
          tags,
          demo_type: demoType.value,
          external_url: demoType.value === 'link' ? externalUrl.value.trim() : externalUrl.value.trim() || undefined,
          prompt: prompt.value.trim(),
          video_url: videoUrl.value.trim() || undefined,
          cover: coverFile.value,
          file: zipFile.value,
          commit_message: commitMessage.value.trim() || undefined,
          keep_old_version: keepOldVersion.value,
        },
        onProgress,
      )
      success.value = { slug: editSlug, status: 'updated' }
    } else {
      const created = await api.createDemo(
        {
          title: title.value.trim(),
          description: description.value.trim(),
          tags,
          demo_type: demoType.value,
          external_url: demoType.value === 'link' ? externalUrl.value.trim() : externalUrl.value.trim() || undefined,
          prompt: prompt.value.trim(),
          video_url: videoUrl.value.trim() || undefined,
          cover: coverFile.value,
          file: zipFile.value,
          idempotency_key: idempotencyKey.value || undefined,
          upload_code: uploadCode.value.trim() || undefined,
          task: pickedTask.value?.slug,
          model_hint: modelUncertain.value ? modelHint.value.trim() || undefined : undefined,
          force: forceUpload.value || undefined,
        },
        onProgress,
      )
      success.value = created
      // 成功了就别再留草稿：下次进来该是白纸，而不是"继续上次那件已发布的"
      clearDraft()
    }
  } catch (e) {
    error.value = (e as Error).message
    // 409 内容重复：后端 detail 含 /demo/<slug>，解析出已有 demo 供跳转
    const m = /\/demo\/([^/\s]+)/.exec((e as Error).message)
    dupSlug.value = m ? m[1] : null
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="route-page">  <section class="page-hero">
    <span class="eyebrow">{{ editSlug ? t('upload.editEyebrow', '编辑 Demo') : t('app.nav.upload', '上传 Demo') }}</span>
    <h1 class="huge">{{ editSlug ? demoTitle || t('upload.edit', '编辑') : t('upload.new', '上传') }}</h1>
    <p class="sub">
      {{ editSlug
        ? t('upload.editSub', '改信息或重新上传文件；改动会写入时间线并生成更新公告。')
        : t('upload.newSub', '三步：先说清是什么、再说哪个模型做的、最后把它讲明白。未登录也能以公开用户身份发布。') }}
    </p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('demo.loading', '加载 Demo…') }}</div>

    <div v-else-if="denied" class="empty-box" style="max-width: 560px">
      <p style="margin-bottom: 18px">{{ error }}</p>
      <RouterLink class="btn btn-outline" to="/">{{ t('notFound.back', '返回首页') }}</RouterLink>
    </div>

    <div v-else class="upload-grid" :class="{ 'panel-open': tagsOpen }">
      <div class="card card-default upload-form-card" style="padding: 24px">
        <!-- 草稿恢复：只探测不自动覆盖（误恢复比误清空更难被发现，所以必须让作者点头） -->
        <div v-if="draftFound && !success" class="uw-draft">
          <span>
            {{ t('upload.draftFound', '发现上次没填完的草稿') }}
            <b v-if="draftFound.title">「{{ draftFound.title }}…」</b>
            <span class="muted">· {{ t('upload.draftNoFile', '文件与封面需重新选') }}</span>
          </span>
          <!-- 按钮语义不能倒置：安全动作（继续填）用主色，破坏性动作（丢弃）用弱色 + 确认 -->
          <button type="button" class="btn btn-sm btn-secondary" @click="resumeDraft">{{ t('upload.draftResume', '继续填') }}</button>
          <button type="button" class="btn btn-sm btn-ghost" @click="discardDraft">{{ t('upload.draftDiscard', '丢弃') }}</button>
        </div>

        <!-- 步骤条：一步只解决一个子问题；可任意回退，状态不丢 -->
        <ol class="uw-steps">
          <li v-for="s in stepDefs" :key="s.n">
            <button
              type="button"
              class="uw-step"
              :class="{ active: step === s.n, ok: s.n <= 3 && stepOk[s.n] }"
              :aria-current="step === s.n ? 'step' : undefined"
              @click="goStep(s.n)"
            >
              <span class="uw-step-n mono">{{ s.n }}</span>
              <span class="uw-step-body">
                <b>{{ s.title }}</b>
                <span class="uw-step-hint">{{ s.hint }}</span>
              </span>
            </button>
          </li>
        </ol>

        <!-- 完成度仪表盘：goal-gradient —— 让人一直看得见"还剩几步"，点击直达 -->
        <div class="uw-dash">
          <span class="uw-rank" :class="{ full: rank.label && allDone === checklist.length }">
            <b>{{ rank.label }}</b><span class="uw-rank-hint">{{ rank.hint }}</span>
          </span>
          <span class="uw-dash-lead">
            <b>{{ mustDone }}</b>/{{ mustTotal }} {{ t('upload.dashMust', '必答已就绪') }} · {{ allDone }}/{{ checklist.length }} {{ t('upload.dashAll', '项已填') }}
          </span>
          <span class="uw-dash-bar" role="progressbar" :aria-valuenow="barPct" aria-valuemin="0" aria-valuemax="100" :aria-label="t('upload.dashAll', '完成度')"><i :style="{ width: barPct + '%' }"></i></span>
          <button
            v-for="c in checklist"
            :key="c.label"
            type="button"
            class="uw-item"
            :class="{ done: c.done, pending: c.must && !c.done && c.step === step }"
            :title="c.must ? t('upload.dashRequired', '必填') : t('upload.dashBetter', '建议补上')"
            @click="goStep(c.step)"
          >
            <span class="uw-dot">{{ c.done ? '✓' : '·' }}</span>{{ c.label }}
          </button>
          <button class="uw-aside-toggle" type="button" :aria-pressed="asideOn" :title="t('upload.asideTip', '要不要旁白解说')" @click="toggleAside">
            {{ asideOn ? '💬' : '💬̸' }} {{ t('upload.asideLabel', '旁白') }}
          </button>
        </div>
        <p v-if="lastAside" class="uw-aside" aria-live="polite">{{ lastAside }}</p>

        <form class="form-stack" @submit.prevent="submit">
        <!-- v2 B4′：挑战上下文（跨步保留，因为题面同时喂给标题与提示词） -->
        <div v-if="challenge && !challengeOff" class="card card-mint challenge-card">
          <div class="filter-row" style="margin-bottom: 6px">
            <span class="cluster-badge cb-exact">CHALLENGE</span>
            <b>{{ challenge.title }}</b>
            <span class="mini-stat"><b>{{ challenge.demos_total }}</b> {{ t('upload.challengeWorks', '个已有作品') }}</span>
            <button v-if="challengePrompt" class="btn btn-sm btn-secondary" type="button" style="margin-left: auto" @click="fillChallengePrompt">
              {{ t('upload.challengeFill', '填入原题面') }}
            </button>
            <button v-if="challengePrompt" class="btn btn-sm btn-outline" type="button" @click="copyChallengePrompt">
              {{ promptCopied ? t('upload.copied', '已复制') : t('upload.challengeCopy', '复制原题面') }}
            </button>
            <!-- 挂了题面就该能摘掉：不想进同题对比时别被 URL 参数绑架 -->
            <button class="btn btn-sm btn-dark" type="button" style="margin-left: auto" @click="dropChallenge">✕ {{ t('upload.dropChallenge', '不挑战这题了') }}</button>
          </div>
          <p v-if="challenge.description" class="muted" style="margin: 0 0 6px">{{ challenge.description }}</p>
          <p v-if="challengePrompt" class="challenge-prompt mono">{{ challengePrompt }}</p>
          <p class="hint" style="margin: 6px 0 0">{{ t('upload.challengeHint', '提交后挂题请求进入管理员确认队列，通过才会出现在同题对比里。') }}</p>
        </div>

        <!-- ============ ① 作品是什么 ============ -->
        <fieldset v-show="step === 1" class="uw-panel">
          <legend>{{ t('upload.s1Legend', '这个作品是什么？') }}</legend>
          <!-- 类型用大卡片：选项全可见（省一次展开的记忆负担）+ 命中区域大（Fitts） -->
          <div class="uw-types">
            <button
              v-for="o in typeOptions"
              :key="o.value"
              type="button"
              class="uw-type"
              :class="{ active: demoType === o.value }"
              :aria-pressed="demoType === o.value"
              data-step-focus="1"
              @click="demoType = o.value"
            >
              <b>{{ o.label }}</b>
              <span class="uw-type-hint">{{ o.hint }}</span>
            </button>
          </div>

          <label v-if="demoType === 'link'" class="field">
            {{ t('upload.linkUrl', '外部链接地址（必填）') }}
            <input
              v-model="externalUrl"
              class="input"
              :class="{ 'uw-field-bad': externalUrl.trim() && !/^https?:\/\//.test(externalUrl.trim()) }"
              :aria-invalid="externalUrl.trim() && !/^https?:\/\//.test(externalUrl.trim()) ? true : undefined"
              placeholder="https://…"
              data-step-focus="1"
            />
            <span class="hint">
              {{ /^https?:\/\//.test(externalUrl.trim()) ? t('upload.linkOk', '地址格式没问题 · 直接跳转打开，服务器不存储内容') : t('upload.linkHint', '直接跳转打开，服务器不存储内容') }}
            </span>
          </label>
          <label v-else class="field">
            {{ t('upload.file', '文件') }}{{ editSlug ? t('upload.fileEdit', '（可选，不选则保留原文件）') : '' }}
            <!-- key 重挂才能真的清空原生 file input（直接置 null 在部分浏览器无效） -->
            <input :key="fileInputKey" class="input" type="file" accept=".zip,application/zip,.html,.htm,.svg,text/html,image/svg+xml" data-step-focus="1" @change="onZipChange" />
            <span class="hint">
              {{ demoType === 'web'
                ? t('upload.fileWebHint', '支持 zip（根目录需含 index.html）或单个 .html/.svg；单 HTML 必须自包含（内联 CSS/JS，双击可直接打开）')
                : t('upload.fileZipHint', 'zip 文件包（不要求 index.html）') }}
            </span>
            <span v-if="zipFile" class="uw-picked">
              <span class="mono">{{ zipFile.name }}</span>
              <span class="muted mono">{{ (zipFile.size / 1048576).toFixed(1) }} MB</span>
              <button type="button" class="uw-x" :aria-label="t('upload.removeFile', '移除文件')" @click="clearFile">✕</button>
            </span>
          </label>
        </fieldset>

        <!-- ============ ② 哪个模型做的（必答） ============ -->
        <fieldset v-show="step === 2" class="uw-panel">
          <legend>{{ t('upload.s2Legend', '它是哪个模型做出来的？') }}</legend>
          <p class="uw-why">{{ t('upload.s2Why', '模型是本站的地基：只有声明了，作品才会进模型页与同题对比。') }}</p>

          <div class="filter-row" style="margin: 0 0 8px">
            <input v-model="modelQuery" class="input" type="search" :placeholder="t('upload.s2Search', '搜型号名…')" data-step-focus="2" style="max-width: 240px" />
            <span class="muted mono">{{ filteredExact.length }}</span>
          </div>
          <div class="uw-chipgrid">
            <button
              v-for="v in filteredExact"
              :key="v.value"
              type="button"
              class="tag-chip mode-fixed uw-mc"
              :class="{ active: chosenModelNames.includes(v.value) }"
              :title="v.description || v.value"
              @click="pickModel(v.value)"
            >
              <span v-if="v.group" class="uw-mc-vendor">{{ v.group }}</span>
              {{ tagLabel(v.value) }}<span class="count">{{ v.demo_count }}</span>
            </button>
            <p v-if="!filteredExact.length" class="muted">{{ t('upload.s2NoMatch', '词表里没有这个写法 —— 用下面三条出口之一，别硬填。') }}</p>
          </div>

          <!-- 三条"不确定"出口与精确选择同层级：不确定是合法答案 -->
          <div class="uw-fallbacks">
            <div class="uw-fb">
              <b>{{ t('upload.s2FbVendor', '知道厂商，不确定具体型号') }}</b>
              <div v-if="fbVendorOpen" class="filter-row" style="margin-top: 6px; flex-wrap: wrap">
                <button v-for="f in vendorFamilies" :key="f.value" type="button" class="tag-chip mode-open" :class="{ active: chosenModelNames.includes(f.value) }" @click="pickModel(f.value)">
                  {{ f.vendor }}
                </button>
                <p v-if="!vendorFamilies.length" class="muted">{{ t('upload.s2NoVendor', '厂商族节点还没建立，请选下一条。') }}</p>
                <button class="btn btn-sm btn-outline" type="button" @click="fbVendorOpen = false">▴ {{ t('upload.collapse', '收起') }}</button>
              </div>
              <button v-else class="btn btn-sm btn-outline" type="button" style="margin-top: 6px" @click="fbVendorOpen = true">{{ t('upload.s2PickVendor', '选厂商 →') }}</button>
            </div>
            <div class="uw-fb">
              <b>{{ t('upload.s2FbUnknown', '完全不知道是什么模型') }}</b>
              <button class="btn btn-sm btn-outline" type="button" style="margin-top: 6px" :class="{ active: chosenModelNames.includes(unknownValue) }" @click="pickModel(unknownValue)">
                {{ t('upload.s2FbUnknownBtn', '标为「未标注」') }}
              </button>
            </div>
            <div class="uw-fb">
              <b>{{ t('upload.s2FbGuess', '网传灰测 / 内部版本，未经证实') }}</b>
              <button class="btn btn-sm btn-outline" type="button" style="margin-top: 6px" :class="{ active: chosenModelNames.includes(guessValue) }" @click="pickModel(guessValue)">
                {{ t('upload.s2FbGuessBtn', '标为「灰测未证实」') }}
              </button>
            </div>
          </div>

          <p v-if="modelUncertain" class="hint" style="margin: 10px 0 0">
            {{ t('upload.s2UncertainNote', '不确定也是有效信息：写下依据，站方日后确认了可以批量帮你归位。') }}
          </p>
          <label v-if="modelUncertain" class="field" style="margin-top: 6px">
            {{ t('upload.modelHintLabel', '为什么不确定型号？（可选，但会帮助日后归类）') }}
            <input v-model="modelHint" class="input" maxlength="500" :placeholder="t('upload.modelHintPh', '如：网传灰测版 / 别人传的没写 / 只知道是 DeepSeek')" />
          </label>

          <div v-if="chosenModelNames.length" class="uw-picked-row">
            <span class="kpi-label">{{ t('upload.s2Picked', '已声明') }}</span>
            <span v-for="m in chosenModelNames" :key="m" class="tag-chip active">
              {{ tagLabel(m) }}
              <button type="button" class="uw-x" :aria-label="t('upload.unpick', '取消选择')" @click="clearModel">✕</button>
            </span>
            <button type="button" class="btn btn-sm btn-outline" @click="clearModel">{{ t('upload.changeMind', '改主意') }}</button>
            <span v-if="stamped.model" class="uw-stamp" aria-hidden="true">{{ t('upload.stampRegistered', '已登记') }}</span>
          </div>

          <!-- 站内战绩：把"选了谁"变成"你知道对手是谁" -->
          <p v-if="modelStats && !statsLoading" class="uw-record">
            <b>{{ modelStats.name }}</b>
            {{ t('upload.recordLine', '站内 {n} 件作品', { n: modelStats.demo_count }) }}
            <template v-if="modelStats.rating_avg != null"> · {{ t('upload.recordRating', '平均社区分 {r}', { r: modelStats.rating_avg.toFixed(2) }) }}</template>
            <span class="muted"> · {{ t('upload.recordTip', '同题对比页能看到它输给了谁') }}</span>
          </p>
        </fieldset>

        <!-- ============ ③ 说清楚 ============ -->
        <fieldset v-show="step === 3" class="uw-panel">
          <legend>{{ t('upload.s3Legend', '把它讲明白') }}</legend>
          <label class="field">
            <span class="uw-label-row">
              {{ t('upload.title', '标题') }}
              <span class="uw-count mono" :class="{ bad: !title.trim() }">{{ title.trim().length }}</span>
            </span>
            <input v-model="title" class="input" maxlength="200" :placeholder="t('upload.titlePlaceholder', 'Demo 标题')" required data-step-focus="3" />
            <span class="hint">{{ t('upload.titleWhy', '别人搜的就是这几个字 —— 写"它在干什么"，别写"我的作品 12"。') }}</span>
          </label>
          <label class="field">
            <span class="uw-label-row">
              {{ t('upload.desc', '描述') }}
              <span class="uw-count mono" :class="{ good: descOk }">{{ description.trim().length }}</span>
            </span>
            <textarea v-model="description" class="input textarea" maxlength="2000" rows="3" :placeholder="t('upload.descPlaceholder', '简要描述这个 Demo')"></textarea>
            <span class="hint">{{ descOk ? t('upload.descOk', '够了。补一句"怎么玩"会更好。') : t('upload.descShort', '太短了，写 2~4 句：这是什么、怎么玩、有什么新鲜处。') }}</span>
          </label>
          <label class="field">
            <span class="uw-label-row">
              {{ t('upload.prompt', '第一轮提示词（可选，展示为提示词卡片）') }}
              <span class="uw-count mono" :class="{ good: promptOk }">{{ prompt.trim().length }}</span>
            </span>
            <textarea v-model="prompt" class="input textarea" rows="4" :placeholder="t('upload.promptPlaceholder', '生成这个 Demo 时使用的第一轮提示词…')"></textarea>
            <span class="hint">{{ t('upload.promptWhy', '有了它，同一句话交给别的模型的作品会自动互相对照（详情页「同提示词」）。') }}</span>
          </label>

          <!-- 挂题（第 6 条）：作者终于能主动说"我这件答的是哪道题"。
               建议由规则层从标题/描述/提示词算出，选择由作者声明 —— 两者不混。 -->
          <div class="uw-task">
            <div class="uw-task-head">
              <b>{{ t('upload.taskTitle', '挂到哪道题？') }}</b>
              <span class="hint">{{ t('upload.taskIsApply', '可选。挂题是申请：管理员批准后才会出现在同题对比里。') }}</span>
            </div>

            <div v-if="pickedTask" class="uw-picked-row">
              <span class="tag-chip active">{{ t('upload.taskPicked', '题目') }}：{{ pickedTask.title }}</span>
              <button type="button" class="uw-x" :aria-label="t('upload.unpick', '取消选择')" @click="clearTask">✕</button>
              <RouterLink class="btn btn-sm btn-ghost" :to="`/tasks/${pickedTask.slug}`" target="_blank" rel="noopener">
                {{ t('upload.taskSeeBrief', '看题面 ↗') }}
              </RouterLink>
            </div>

            <template v-else>
              <div v-if="taskHits.length && !taskPickerOpen" class="uw-suggest">
                <span class="kpi-label">{{ t('upload.taskGuess', '根据你写的内容，可能是这些题') }}</span>
                <div class="filter-row" style="margin: 0; flex-wrap: wrap">
                  <button v-for="x in taskHits" :key="x.slug" type="button" class="tag-chip mode-open" @click="pickTask(x)">
                    {{ x.title }}<span class="count">{{ x.demo_count }}</span>
                    <i class="uw-sim mono">{{ simPct(x.score) }}</i>
                  </button>
                </div>
              </div>
              <button v-if="!taskPickerOpen" type="button" class="btn btn-sm btn-outline" @click="openTaskPicker">
                {{ taskHits.length ? t('upload.taskFindMore', '都不是，我自己找…') : t('upload.taskFind', '选一道已有题目 →') }}
              </button>
            </template>

            <div v-if="taskPickerOpen" class="uw-task-search">
              <div class="filter-row" style="margin: 0">
                <input
                  v-model="taskQuery"
                  class="input"
                  type="search"
                  :placeholder="t('upload.taskSearchPh', '输入题目关键词（≥2 字）…')"
                  @input="scheduleTaskSearch(taskQuery)"
                />
                <button type="button" class="btn btn-sm btn-secondary" :disabled="taskSearching" @click="runTaskSearch(taskQuery)">
                  {{ taskSearching ? '…' : t('common.search', '搜索') }}
                </button>
                <button type="button" class="btn btn-sm btn-ghost" @click="taskPickerOpen = false">{{ t('common.collapse', '收起') }}</button>
              </div>
              <div v-if="taskHits.length" class="uw-suggest" style="margin-top: 8px">
                <div class="filter-row" style="margin: 0; flex-wrap: wrap">
                  <button v-for="x in taskHits" :key="x.slug" type="button" class="tag-chip mode-open" @click="pickTask(x)">
                    {{ x.title }}<span class="count">{{ x.demo_count }}</span>
                    <i class="uw-sim mono">{{ simPct(x.score) }}</i>
                  </button>
                </div>
              </div>
              <p v-else-if="taskQuery.trim().length >= 2 && !taskSearching" class="hint">
                {{ t('upload.taskNoHit', '没有匹配的题目。可以不挂题；若想出题，去题目页看看「题目候选」。') }}
                <RouterLink to="/tasks" target="_blank" rel="noopener">{{ t('upload.taskGo', '题目页 ↗') }}</RouterLink>
              </p>
            </div>
          </div>

          <!-- 建议包主动呈现（旧版藏在抽屉里 = 不存在）；provenance：建议 ≠ 声明，须作者点头 -->
          <div v-if="!packIgnored && packVisible.length" class="pack-card">
            <div class="filter-row" style="margin: 0 0 8px; flex-wrap: wrap">
              <b>{{ t('upload.packTitle', '根据你的描述，这些标签可能合适') }}</b>
              <span v-if="packLoading" class="muted mono">…</span>
              <button class="btn btn-sm btn-primary" type="button" @click="addAllSuggestions">{{ t('upload.packAll', '全部收下') }}</button>
              <button class="btn btn-sm btn-outline" type="button" @click="packIgnored = true">{{ t('upload.packHide', '不用了') }}</button>
            </div>
            <div class="pack-list">
              <button v-for="s in packVisible" :key="s.key + ':' + s.value" type="button" class="pack-chip" :title="`${s.reason}（${t('upload.packConf', '置信')} ${Math.round(s.confidence * 100)}%）`" @click="addSuggestion(s)">
                <span class="pack-key mono">{{ s.key }}</span><b>{{ s.value }}</b><span class="count">+</span>
              </button>
            </div>
          </div>

          <!-- 建议包被收掉后必须能叫回来；顺手给一个「抽一题」的岔路口 -->
          <div v-if="packIgnored || !packVisible.length" class="filter-row" style="margin: 0 0 10px">
            <button v-if="packIgnored" type="button" class="btn btn-sm btn-outline" @click="bringBackPack">↺ {{ t('upload.packBack', '重新看看标签建议') }}</button>
            <button type="button" class="btn btn-sm btn-secondary" :disabled="drawing" @click="drawTask">
              {{ drawing ? '…' : '🎲 ' + t('upload.drawTask', '没灵感？抽一题') }}
            </button>
            <!-- 新标签打开：站内跳转会卸载本页，把作者已填的东西一起带走（实测反馈的问题） -->
            <RouterLink v-if="drawnTask" class="tag-chip mode-open" :to="`/tasks/${drawnTask.slug}`" target="_blank" rel="noopener">
              {{ drawnTask.title }} · {{ t('upload.drawGo', '去看题面 →') }}
            </RouterLink>
          </div>

          <!-- 其他标签：需要完全控制的人有门，普通人不必进去 -->
          <div class="tag-drawer-wrap">
            <button class="tag-drawer-bar" type="button" @click="tagsOpen = !tagsOpen">
              <span class="tag-drawer-title">{{ t('upload.tagsOther', '其他标签（类型 / 分类 / 玩法 / 轮数…）') }}</span>
              <span v-if="selectedList.length" class="tag-drawer-chips">
                <span v-for="s in selectedList" :key="s.key + ':' + s.value" class="tag-chip active" :title="s.description || ''">{{ s.key }}:{{ tagLabel(s.value) }}</span>
              </span>
              <span class="tag-drawer-count"><b>{{ selectedCount }}</b> {{ t('upload.selectedCount', '已选') }}</span>
              <span v-if="!isWide" class="tag-drawer-toggle">{{ tagsOpen ? t('upload.collapseArrow', '收起 ←') : t('upload.expandArrow', '展开 →') }}</span>
            </button>
          </div>

          <label class="field">
            {{ t('upload.cover', '封面（可选）') }}{{ editSlug ? t('upload.coverEdit', '（可选，不选保留当前封面）') : '' }}
            <input class="input" type="file" accept="image/png,image/jpeg,image/webp" @change="onCoverChange" />
            <div v-if="currentCover || coverPreview" class="cover-preview">
              <img :src="coverPreview || currentCover" alt="封面预览" />
              <span v-if="coverPreview" class="cover-preview-badge">{{ t('upload.newCover', '新封面') }}</span>
              <button v-if="coverFile" type="button" class="uw-x uw-x-over" :aria-label="t('upload.removeCover', '移除封面')" @click="clearCover">✕</button>
            </div>
          </label>
          <label class="field">
            {{ t('upload.video', '介绍视频链接（可选，服务器不存视频）') }}
            <input v-model="videoUrl" class="input" :placeholder="t('upload.videoPlaceholder', 'https://…（B站/YouTube 等）')" />
          </label>
          <label v-if="editSlug" class="field">
            {{ t('upload.commitMsg', '更新说明 / commit 信息（可选）') }}
            <input v-model="commitMessage" class="input" :placeholder="t('upload.commitPlaceholder', '例如：修复第二关音效不同步的问题')" />
            <span class="hint">{{ t('upload.commitHint', '会生成「作品更新公告」并写入时间线') }}</span>
          </label>
          <label v-if="editSlug && zipFile && demoType !== 'link'" class="field" style="display: flex; gap: 8px; align-items: center">
            <input v-model="keepOldVersion" type="checkbox" style="width: 18px; height: 18px" />
            {{ t('upload.keepOld', '保留当前版本为独立旧版页面（上传新 zip 时生效）') }}
          </label>

          <!-- 受众分离：这三样不是作者的日常决策，别混在正文里 -->
          <button type="button" class="uw-adv-toggle" :aria-expanded="showAdvanced" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? '▾' : '▸' }} {{ t('upload.advTitle', '高级（多数人不需碰）') }}
          </button>
          <div v-show="showAdvanced" class="uw-adv">
            <label class="field">
              {{ t('upload.uploadCode', '信任通道 upload_code（可选，未登录免审核）') }}
              <input v-model="uploadCode" class="input" placeholder="UPLOAD_CODE（有则填）" />
            </label>
            <p class="hint" style="margin: 0">
              {{ t('upload.idemPrefix', '幂等键已自动生成：') }}<code>{{ idempotencyKey }}</code>{{ t('upload.idemSuffix', '（重试不会重复创建）') }}
              <!-- 同一个键，换个读法：这是你这次实验的编号，截图发群时可引用 -->
              <span v-if="expNo" class="uw-expno mono" :title="t('upload.expTip', '本次上传的实验编号（由幂等键末 6 位得到）')">EXP-{{ expNo }}</span>
            </p>
            <label v-if="auth.isAdmin()" class="field" style="display: flex; gap: 8px; align-items: center; margin-top: 8px">
              <input v-model="forceUpload" type="checkbox" style="width: 18px; height: 18px" />
              {{ t('upload.force', '强制上传（跳过 zip 去重 409）') }}
            </label>
          </div>
        </fieldset>

        <!-- ============ ④ 核对并提交 ============ -->
        <div v-show="step === 4" class="uw-panel uw-review">
          <h2 class="section-title" style="margin-top: 0">{{ t('upload.s4Legend', '核对一遍再发布') }}</h2>
          <!-- 每行统一：标签 / 值 / 右对齐「改」—— 原先只有 3 行有按钮且挤成第三列，位置确实难看 -->
          <dl class="uw-sum">
            <div v-for="r in reviewRows" :key="r.label" class="uw-sum-row" :class="{ empty: r.value === '—' }">
              <dt>{{ r.label }}</dt>
              <dd :class="{ 'uw-sum-mono': r.mono }">{{ r.value }}<span v-if="r.note" class="muted"> · {{ r.note }}</span></dd>
              <dd><button type="button" class="uw-edit" @click="goStep(r.step)">{{ t('upload.fix', '改') }}</button></dd>
            </div>
          </dl>
          <p class="hint">{{ t('upload.s4Foot', '发布后进入审核队列（登录作者可直接上架）；标签和提示词随时可再编辑。') }}</p>

          <div v-if="error" class="notice notice-error">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
              <span>{{ error }}</span>
              <RouterLink v-if="dupSlug" class="btn btn-sm btn-outline" :to="`/demo/${dupSlug}`">{{ t('upload.viewDup', '查看已有 Demo →') }}</RouterLink>
            </div>
          </div>
          <div v-if="success" class="notice notice-success">
            <p style="margin-bottom: 10px">
              {{ editSlug ? t('upload.updated', '更新成功，已生成更新公告。') : success.status === 'pending' ? t('upload.pending', '已提交，等待管理员审核。') : t('upload.uploaded', '上传成功。') }}
            </p>
            <p v-if="challenge && !challengeOff && !editSlug" class="hint" style="margin: 0 0 10px">
              {{ t('upload.challengeQueued', '挑战已提交：挂题请求待管理员确认，通过后即出现在同题对比中。') }}
              <RouterLink :to="`/tasks/${challenge.slug}`">{{ t('upload.viewTask', '查看题目 →') }}</RouterLink>
            </p>
            <div class="filter-row" style="margin: 0">
              <template v-if="success.status !== 'pending'">
                <RouterLink class="btn btn-sm btn-primary" :to="`/demo/${success.status === 'updated' ? editSlug : success.slug}`">{{ t('upload.viewDemo', '查看 Demo') }}</RouterLink>
              </template>
              <span v-else class="hint">{{ t('upload.pendingHint', '审核通过后即可展示') }}</span>
              <RouterLink class="btn btn-sm btn-outline" to="/">{{ t('upload.backHome', '返回主页') }}</RouterLink>
              <RouterLink class="btn btn-sm btn-outline" to="/models">{{ t('upload.gotoModels', '看看模型页 →') }}</RouterLink>
              <button v-if="!editSlug" type="button" class="btn btn-sm btn-secondary" @click="resetAll">＋ {{ t('upload.anotherOne', '再传一个') }}</button>
            </div>
          </div>
          <div v-if="submitting" class="upload-progress">
            <div class="progress-track"><div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div></div>
            <span class="hint">{{ uploadProgress >= 100 ? t('upload.processing', '已上传，服务器处理中（解压 / 传 OSS）…') : t('upload.uploadingN', '上传中 {n}%', { n: uploadProgress }) }}</span>
          </div>
        </div>

          <!-- 步内问题：醒目红块。原先是裸 bullet，和上方清单长得一样，读起来像"又一项待办"而不是"这里卡住了" -->
          <p v-if="stepError" class="uw-err" role="alert" aria-live="assertive">{{ stepError }}</p>
          <div v-else-if="stepProblems[step]?.length" class="uw-problems" aria-live="polite">
            <b>{{ t('upload.stillMissing', '这一步还差') }}</b>
            <ul>
              <li v-for="p in stepProblems[step]" :key="p">{{ p }}</li>
            </ul>
          </div>

          <div class="uw-nav">
            <button v-if="step > 1" class="btn btn-outline" type="button" @click="goStep(step - 1)">← {{ t('upload.prev', '上一步') }}</button>
            <!-- 破坏性动作远离主行动按钮：并排放着迟早有人误点 -->
            <button v-if="!editSlug && isDirty && !success" class="btn btn-ghost" type="button" @click="resetAll">{{ t('upload.resetAll', '清空重来') }}</button>
            <span class="uw-nav-spacer"></span>
            <button v-if="step < 4" class="btn btn-secondary btn-lg" type="button" @click="next">{{ t('upload.next', '下一步') }} →</button>
            <button
              v-else
              class="btn btn-primary btn-lg"
              :class="{ 'is-uploading': submitting }"
              type="submit"
              :disabled="submitting || !readyToSubmit"
              :title="readyToSubmit ? '' : t('upload.needMust', '必答项还没齐：' + checklist.filter((c) => c.must && !c.done).map((c) => c.label).join('、'))"
            >
              {{ submitting ? (uploadProgress >= 100 ? t('upload.processingShort', '处理中…') : t('upload.uploadingN', '上传中 {n}%', { n: uploadProgress })) : editSlug ? t('upload.saveChanges', '保存修改') : t('upload.submit', '确认发布') }}
            </button>
          </div>
        </form>
      </div>

      <Teleport to="body">
        <div v-if="tagsOpen" class="tag-modal">
          <div class="tag-modal-mask" @click="tagsOpen = false"></div>
          <div class="tag-modal-panel">
            <div class="tag-modal-head">
              <span class="filter-label">{{ t('upload.tagPicker', '标签选择') }}</span>
              <button class="btn btn-sm btn-dark" type="button" @click="tagsOpen = false">{{ t('common.close', '关闭') }}</button>
            </div>
        <div class="tag-drawer-head">
          <!-- 模型与标签推导已归位到步骤 ② ③；抽屉只保留「全词表编辑器」这一职责，不再重复同一信息 -->
          <span class="hint">
            {{ t('upload.tagPickerHint', '固定值点选 · 自定义值输入添加 · 数字值填整数 · author 系统保留') }}
            <span v-if="chosenModelNames.length" class="uw-drawer-model">
              · {{ t('upload.drawerModelNow', '模型') }}：{{ chosenModelNames.map((m) => tagLabel(m)).join(' / ') }}
            </span>
          </span>
        </div>

        <TagPicker v-model="selectedTags" />
          </div>
        </div>
      </Teleport>
    </div>
  </section>
  </div>
</template>