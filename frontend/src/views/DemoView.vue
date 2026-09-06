<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { DemoDetail, DemoSummary, SamePromptResult, SessionLog, TaskDetail } from '../api/types'
import IframePreview from '../components/IframePreview.vue'
import PeekDrawer from '../components/PeekDrawer.vue'
import CopyButton from '../components/CopyButton.vue'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import DshTrajectoryView from '../components/DshTrajectoryView.vue'
import DemoCard from '../components/DemoCard.vue'
import ModelChips from '../components/ModelChips.vue'
import RatingWidget from '../components/RatingWidget.vue'
import QuickComments from '../components/QuickComments.vue'
import { parseDate, currentLocale } from '../utils/time'
import { tagLabel } from '../utils/funMode'
import { t } from '../i18n'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const slug = String(route.params.slug)

const demo = ref<DemoDetail | null>(null)
const loading = ref(true)
const error = ref('')
// 预览懒挂载：进视口（提前 200px）才真正挂 iframe。
// 注意：onMounted 时 demo 还在加载、.dv-stage 尚不存在，观察器必须等元素出现后再挂
// （第一版就在 onMounted 里 observe，结果 stageEl 为 null → 预览永远不挂载）。
const stageEl = ref<HTMLElement | null>(null)
const mountPreview = ref(false)
let io: IntersectionObserver | null = null
function attachPreviewObserver() {
  if (mountPreview.value || !stageEl.value) return
  if (!('IntersectionObserver' in window)) {
    mountPreview.value = true
    return
  }
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        mountPreview.value = true
        io?.disconnect()
        io = null
      }
    },
    { rootMargin: '200px' },
  )
  io.observe(stageEl.value)
}
watch(stageEl, (el) => {
  if (el) attachPreviewObserver()
})
onBeforeUnmount(() => {
  io?.disconnect()
  if (previewTimer) clearTimeout(previewTimer)
})

// ---------- M0-B 预览三态（02 D / 03 §6.1 修补①） ----------
// loading（海报+march 边框覆盖层）→ ready（IframePreview @load）；
// 失败兜底：跨源 iframe 无法探测 HTTP 错误（浏览器对错误页也触发 load 的反例之外，
// 被墙/CORS/大文件超时表现为「一直不 load」）→ 15s 未就绪按失败处理，给重试+外部打开。
const previewState = ref<'loading' | 'ready' | 'error'>('loading')
const previewKey = ref(0)
// 触屏默认点击播放（03 §10.4：海报 ▶ 才挂 iframe，省流量省电）；桌面保持自动
const isTouch = matchMedia('(hover: none)').matches || window.innerWidth < 720
const previewArmed = ref(!isTouch)
let previewTimer: ReturnType<typeof setTimeout> | null = null

function startPreviewLoading() {
  previewState.value = 'loading'
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    if (previewState.value === 'loading') previewState.value = 'error'
  }, 15000)
}
function armPreview() {
  if (previewArmed.value) return
  previewArmed.value = true
}
function onPreviewLoaded() {
  if (previewTimer) clearTimeout(previewTimer)
  previewState.value = 'ready'
}
function retryPreview() {
  previewKey.value += 1 // key 变更强制重建 iframe
  startPreviewLoading()
}
function openExternal() {
  if (!demo.value) return
  const url = demo.value.preview_url ?? `/preview/${demo.value.slug}/index.html`
  window.open(url, '_blank', 'noopener')
}
watch([mountPreview, previewArmed], ([m, armed]) => {
  if (m && armed) startPreviewLoading()
})

// ---------- M1-B 移动动作条（03 §6.1 移动线框）：≤720 底部固定 5 键 ----------
// 全屏=Fullscreen API；iOS（元素级 requestFullscreen 缺席/被拒）降级为固定定位层
// （z 在 topbar 之上、toast 之下）；重开=重建 iframe（key 变更）+ 回加载态；
// ★评分=滚到信息卡评分组并闪一次；讨论=展开 #dv-comments 并滚过去。
const nativeFs = ref(false)
const fakeFs = ref(false)
const fsActive = computed(() => nativeFs.value || fakeFs.value)
function onFsChange() {
  nativeFs.value = !!document.fullscreenElement
}
function onFsKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && fakeFs.value) fakeFs.value = false
}
onMounted(() => {
  document.addEventListener('fullscreenchange', onFsChange)
  document.addEventListener('keydown', onFsKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFsChange)
  document.removeEventListener('keydown', onFsKey)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
})
// 动作条是 fixed，只遮「main 里的内容」垫不住 App 级 footer（footer 在 route-page 之外，
// App.vue 红线不可动）→ 页脚抬升用 body padding 精确挂载/卸载（组件卸载即还原，无样式泄漏）
const MQL_BAR = '(max-width: 720px)'
const mqlBar = window.matchMedia(MQL_BAR)
function syncBodyPad() {
  document.body.style.paddingBottom = mqlBar.matches ? 'calc(60px + env(safe-area-inset-bottom, 0px))' : ''
}
onMounted(() => {
  mqlBar.addEventListener('change', syncBodyPad)
  syncBodyPad()
})
onBeforeUnmount(() => {
  mqlBar.removeEventListener('change', syncBodyPad)
  document.body.style.paddingBottom = ''
})
async function toggleFullscreen() {
  if (fsActive.value) {
    fakeFs.value = false
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
    return
  }
  const el = stageEl.value
  if (el && el.requestFullscreen) {
    try {
      await el.requestFullscreen()
      return
    } catch {
      /* 元素级全屏被拒（iOS Safari 等）→ 走固定定位层 */
    }
  }
  fakeFs.value = true
}
// 重开：与 M0-B 三态衔接——重建 iframe 强制走一遍 loading（march 边框）→ready/error
function restartPreview() {
  previewKey.value += 1
  previewArmed.value = true
  mountPreview.value = true
  startPreviewLoading()
}
// ★评分：评分住在信息卡里（收起先展开），滚过去再闪一下（给分动作有可感回应 03 §6.1）
const ratingFlash = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null
function scrollToRating() {
  if (!factsOpen.value) toggleFacts(true)
  void nextTick(() => {
    document.getElementById('dv-rating')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    ratingFlash.value = true
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (ratingFlash.value = false), 1200)
  })
}
// 讨论：展开评论区 disclosure 并滚过去（showArchive 同款机制）
function openDiscussion() {
  void nextTick(() => {
    const el = document.getElementById('dv-comments')
    if (el) {
      el.setAttribute('open', '')
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
}

// 侧滑预览：图谱的边不该以"离开本页"为代价（否则没人点，图谱就白建了）
const peekTarget = ref<{ kind: 'model' | 'task' | 'demo'; slug: string } | null>(null)
function peekNavigate(path: string) {
  peekTarget.value = null
  void router.push(path)
}

// t22：审核状态章对外隐藏（游客无信息量）——作者本人/admin 可见。
// is_author = 服务端判定（真后端）；username 匹配为 mock 兜底（mock 的 is_author 恒 false）
const showStatusChip = computed(() => {
  const d = demo.value
  if (!d) return false
  return !!d.is_author || auth.isAdmin() || (auth.isLoggedIn() && auth.user?.username === d.author)
})

// ④ 继续逛：把图谱的三条边变成明确的下一步，而不是被动陈列的区块
const browseNext = computed(() => {
  const d = demo.value
  if (!d) return []
  const out: { to: string; label: string; why: string; peek?: { kind: 'model' | 'task'; slug: string } }[] = []
  if (d.models?.length) out.push({ to: `/models/${d.models[0].slug}`, label: t('demo.nextModel', '这个模型的其他作品'), why: d.models[0].name, peek: { kind: 'model', slug: d.models[0].slug } })
  if (sameTask.value) out.push({ to: `/tasks/${sameTask.value.slug}`, label: t('demo.nextTask', '这道题的其他答案'), why: sameTask.value.title, peek: { kind: 'task', slug: sameTask.value.slug } })
  if (samePrompt.value?.items.length) out.push({ to: `/demos?q=${encodeURIComponent((d.prompt || '').slice(0, 40))}`, label: t('demo.nextPrompt', '同一句提示词的作品'), why: t('demo.nextPromptWhy', '严格复现对照') })
  return out
})

// tab 结构已废除（诊断 #10：tab 与正文是两套组织逻辑，读者不知道该往哪找）。
// 过程档案改成正文里的原生 <details>；这里只留"从事实卡一键跳过去并展开"的能力。
const opened = ref<'session' | 'timeline' | ''>('')
function showArchive(kind: 'session' | 'timeline') {
  opened.value = kind
  void nextTick(() => {
    const el = document.getElementById(`dv-${kind}`)
    if (el) {
      el.setAttribute('open', '')
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
}

// 预览有时就是主角：信息卡可收起，且**记住选择**（每次进来都要重按一遍是失礼）
const factsOpen = ref(localStorage.getItem('demo.factsOpen') !== '0')
function toggleFacts(v?: boolean) {
  factsOpen.value = v ?? !factsOpen.value
  try {
    localStorage.setItem('demo.factsOpen', factsOpen.value ? '1' : '0')
  } catch {
    /* 隐私模式：收得起就行，记住是增值能力 */
  }
}
function onFactsKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName) || el.isContentEditable)) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'i' || e.key === 'I') toggleFacts()
}
onMounted(() => window.addEventListener('keydown', onFactsKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onFactsKey))

const sessionLogs = ref<SessionLog[]>([])
const selectedLog = ref<string | null>(null)
const logContent = ref('')
const loadingLog = ref(false)

// v2 B2′：同提示词的其他作品（prompt_id 精确共享 = 同一句话交给不同模型）
const samePrompt = ref<SamePromptResult | null>(null)

async function loadSamePrompt() {
  try {
    const res = await api.getSamePrompt(slug, 6)
    // 空结果不占版面（空状态尊严：没有对比素材时不打扰）
    samePrompt.value = res.items.length ? res : null
  } catch {
    samePrompt.value = null
  }
}

// v2 §7.3：同题作品 —— 同一个题目（同一条挑战/同一个玩法命题）下别的模型交了什么
const sameTask = ref<TaskDetail | null>(null)

async function loadSameTask() {
  const t = demo.value?.tasks?.[0]
  if (!t) {
    sameTask.value = null
    return
  }
  try {
    const res = await api.getTask(t.slug)
    // 排掉自己；没人可对照就不占版面
    sameTask.value = res && res.demos.filter((d) => d.slug !== slug).length ? res : null
  } catch {
    sameTask.value = null
  }
}

// 相关推荐：候选池 + 本地换一批（不重复）
const RELATED_BATCH = 6
const relatedPool = ref<DemoSummary[]>([])
const relatedShown = ref<DemoSummary[]>([])
const relatedSeen = ref<string[]>([])
const relatedLoading = ref(false)

function drawRelated() {
  if (!relatedPool.value.length) return
  const out: DemoSummary[] = []
  for (const d of relatedPool.value) {
    if (relatedSeen.value.includes(d.slug)) continue
    out.push(d)
    relatedSeen.value.push(d.slug)
    if (out.length >= RELATED_BATCH) break
  }
  relatedShown.value = out
  // 池子快用完时提前补一池，保证一直能换
  if (relatedPool.value.filter((d) => !relatedSeen.value.includes(d.slug)).length < RELATED_BATCH) {
    loadRelated()
  }
}

async function loadRelated() {
  relatedLoading.value = true
  try {
    const pool = await api.getRelated(slug)
    // 合并新池，去重
    const seen = new Set(relatedSeen.value)
    relatedPool.value = pool.filter((d) => !seen.has(d.slug))
  } catch {
    /* 推荐失败静默 */
  } finally {
    relatedLoading.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    demo.value = await api.getDemo(slug)
    sessionLogs.value = await api.listSessionLogs(slug).catch(() => [])
    void loadSamePrompt()
    void loadSameTask()
    await loadRelated()
    drawRelated()
    if (!relatedShown.value.length && relatedPool.value.length) drawRelated()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function openLog(filename: string) {
  selectedLog.value = filename
  loadingLog.value = true
  try {
    logContent.value = await api.getSessionLog(slug, filename)
  } catch (e) {
    logContent.value = `加载失败：${(e as Error).message}`
  } finally {
    loadingLog.value = false
  }
}

async function onDownload() {
  try {
    await api.downloadDemo(slug)
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

const hasModelEntity = computed(() => !!demo.value?.models?.length)

const canEdit = computed(
  () => !!demo.value && auth.isLoggedIn() && (auth.user?.role === 'admin' || !!demo.value.is_author),
)

async function onDelete() {
  if (!demo.value) return
  const ok = await ui.confirm({
    title: t('demo.delTitle', '删除 Demo'),
    message: t('demo.delMsg', `确定删除「${demo.value.title}」？此操作不可恢复，本地文件与 OSS 对象都会被清理。`, { title: demo.value.title }),
    confirmText: t('demo.delConfirm', '删除'),
    danger: true,
  })
  if (!ok) return
  try {
    await api.deleteDemo(slug)
    ui.toast(t('demo.deleted', 'Demo 已删除'), 'success')
    router.push('/')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

onMounted(load)
</script>

<template>
  <div class="route-page">  <section v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('demo.loading', '加载 Demo…') }}</section>

  <section v-else-if="error" class="empty-box">{{ error }}</section>

  <template v-else-if="demo">
    <!-- v2 重设计第 1 期：作品本体（左，sticky）+ 事实卡（右）。
         依据：详情页第一任务是"让它跑起来"，评分是社区唯一信号源必须常驻（Demo页重设计.md §3） -->
    <div class="dv-shell" :class="{ 'facts-collapsed': !factsOpen }">
      <!-- M1-fix-8 修法 A（05 §3.1）：row1 包装层收窄 sticky 容纳块——
           dv-stage 的 sticky 约束块从 dv-shell（跨 row1+row2）变为 row1 包装层，
           滚到 dv-story 时预览被自然推出视口（标准释放），几何上不再与 row2 重叠 -->
      <div class="dv-row-preview">
        <div class="dv-stage" ref="stageEl" :class="{ 'dv-stage--fs': fakeFs }">
        <!-- 全屏退出把手：Fullscreen API 与固定定位层两条路共用（fixed 层里它是唯一回得来的门） -->
        <button v-if="fsActive" class="dv-fs-exit" type="button" @click="toggleFullscreen">
          {{ t('demo.barExitFs', '退出全屏') }}
        </button>
        <!-- iframe 懒挂载：预览进视口才加载，移动端/长页面不必为一块看不见的区域付渲染与流量 -->
        <!-- M0-B 预览三态：触屏默认海报点击播放；桌面进视口自动挂载（既有懒挂载逻辑不变） -->
        <template v-if="demo.demo_type === 'web'">
          <div
            v-if="!previewArmed"
            class="pv-poster"
            role="button"
            tabindex="0"
            :aria-label="t('demo.playHint', '点击播放预览')"
            @click="armPreview"
            @keydown.enter="armPreview"
            @keydown.space.prevent="armPreview"
          >
            <img v-if="demo.cover_url" :src="demo.cover_url" :alt="demo.title" loading="lazy" decoding="async" />
            <div v-else class="pv-poster-fallback" aria-hidden="true">{{ demo.title[0] }}</div>
            <span class="pv-play" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="22" height="22"><path d="M4 2l10 6-10 6V2z" fill="currentColor" /></svg>
            </span>
            <span class="pv-poster-label">{{ t('demo.tapToPlay', '点击播放') }}</span>
          </div>
          <template v-else-if="mountPreview">
            <IframePreview
              :key="previewKey"
              :srcdoc="demo.previewHtml"
              :src="demo.previewHtml ? undefined : (demo.preview_url ?? `/preview/${demo.slug}/index.html`)"
              :title="demo.title"
              @loaded="onPreviewLoaded"
            />
            <!-- 加载中：march 边框覆盖层（stamp-in 微档出场；@load 或 15s 超时切换）；role=status 静默通报 -->
            <div v-if="previewState === 'loading'" class="pv-overlay pv-loading" role="status">
              <div class="pv-loading-inner">
                <span class="pv-march" aria-hidden="true"></span>
                <p>{{ t('demo.previewLoading', '加载预览…') }}</p>
              </div>
            </div>
            <!-- 失败兜底：错误文案 + 重试 + 外部打开；role=alert 即时通报（SR 用户不漏听失败） -->
            <div v-else-if="previewState === 'error'" class="pv-overlay pv-fail" role="alert">
              <p class="pv-fail-title">{{ t('demo.previewFailed', '预览加载失败') }}</p>
              <p class="pv-fail-hint">{{ t('demo.previewFailHint', '可能原因：预览域被墙 / 大文件超时 / 跨源限制') }}</p>
              <div class="filter-row" style="margin: 0">
                <button class="btn btn-sm" type="button" @click="retryPreview">{{ t('demo.retry', '重试') }}</button>
                <button class="btn btn-sm btn-dark" type="button" @click="openExternal">{{ t('demo.openExternal', '在外部浏览器打开') }}</button>
              </div>
            </div>
          </template>
        </template>
        <template v-else-if="demo.demo_type === 'zip'">
          <div class="card card-mint dv-standin">
            <h2>{{ t('demo.zipTitle', '文件包项目') }}</h2>
            <p class="muted">{{ t('demo.zipDesc', '这是一个项目文件包（非网页应用），不提供在线预览，请下载后本地查看。') }}</p>
            <button class="btn btn-primary" type="button" @click="onDownload">{{ t('demo.downloadZipN', '下载 ZIP（{n} 次）', { n: demo.download_count }) }}</button>
          </div>
        </template>
        <template v-else>
          <div class="card card-coral dv-standin">
            <h2>{{ t('demo.linkTitle', '外部链接项目') }}</h2>
            <p class="muted">{{ t('demo.linkDesc', '内容托管在外部站点，点击下方按钮跳转访问。') }}</p>
            <a class="btn btn-primary" :href="demo.external_url ?? undefined" target="_blank" rel="noopener">{{ t('demo.openLink', '打开链接 →') }}</a>
          </div>
        </template>
        </div><!-- /dv-stage -->
      </div><!-- /dv-row-preview（sticky 容纳块=row1，M1-fix-8） -->

      <!-- 收起/展开带动效：状态变化必须"看得见地发生"，否则用户以为按钮坏了 -->
      <Transition name="dv-panel" mode="out-in">
        <aside v-if="factsOpen" key="facts" class="dv-facts">
          <div class="dv-facts-head">
            <!-- t22：审核状态章只对作者本人/admin 可见（对外无信息量）；is_author=服务端判定，username 匹配为 mock 兜底 -->
            <span v-if="showStatusChip" class="eyebrow">{{ demo.status || 'approved' }}</span>
            <button
              class="dv-collapse"
              type="button"
              :title="t('demo.hideFactsTip', '收起信息卡，让预览占满（快捷键 I）')"
              :aria-expanded="true"
              @click="toggleFacts(false)"
            >
              {{ t('demo.collapse', '收起') }} ›
            </button>
          </div>

          <!-- 分组：身份 → 热度 → 评分 → 词表 → 动作 → 档案摘要 -->
          <div class="dv-group">
            <h1 class="dv-title">{{ demo.title }}</h1>
            <!-- v2：模型一等地位（新标签打开，不把作者从自己的作品上赶走） -->
            <div v-if="demo.models?.length" class="dv-byline">
              <ModelChips :models="demo.models" :max="6" size="md" peek @peek="(s: string) => (peekTarget = { kind: 'model', slug: s })" />
            </div>
            <div class="dv-by">
              <RouterLink v-if="demo.author_id == null" to="/author/public">{{ demo.author }}</RouterLink>
              <RouterLink v-else :to="`/user/${demo.author}`">{{ demo.author }}</RouterLink>
              <span class="muted">{{ t('demo.created', '创建') }} · {{ parseDate(demo.created_at).toLocaleDateString(currentLocale()) }}</span>
            </div>
          </div>

          <div class="dv-group dv-meter">
            <span class="dv-cell"><b>{{ demo.view_count }}</b>{{ t('demo.views', '浏览') }}</span>
            <span class="dv-cell"><b>{{ demo.download_count }}</b>{{ t('demo.downloads', '下载') }}</span>
            <span class="dv-cell"><b>{{ demo.comment_count }}</b>{{ t('demo.discussions', '讨论') }}</span>
          </div>

          <!-- 评分常驻：玩完顺手就能给分，不必回头找入口；M1-B 动作条 ★评分 的滚动锚 -->
          <div id="dv-rating" class="dv-group dv-rate" :class="{ 'dv-rate--flash': ratingFlash }">
            <RatingWidget :slug="demo.slug" layout="rows" :dist-max="34" />
          </div>

          <div v-if="demo.tags.length" class="dv-group dv-tags">
            <RouterLink
              v-for="tg in demo.tags.filter((x) => x.key !== 'model' || !hasModelEntity)"
              :key="tg.key + ':' + tg.value"
              class="tag-chip"
              :class="tg.key === 'author' ? 'yellow' : tg.key === 'model' ? 'teal' : ''"
              :to="`/tag/${tg.key}/${tg.value}`"
            >{{ tg.key }}:{{ tagLabel(tg.value) }}</RouterLink>
          </div>

          <div class="dv-group dv-actions">
            <button v-if="demo.demo_type !== 'link'" class="btn btn-secondary dv-action-main" type="button" @click="onDownload">{{ demo.single_file ? t('demo.downloadFile', '下载文件') : t('demo.downloadZip', '下载 ZIP') }}</button>
            <div class="dv-action-row">
              <RouterLink class="btn btn-sm btn-outline" :to="`/forum?demo=${demo.slug}`">{{ t('demo.discuss', '讨论 →') }}</RouterLink>
              <template v-if="canEdit">
                <RouterLink class="btn btn-sm btn-outline" :to="`/upload?slug=${demo.slug}`">{{ t('demo.edit', '编辑') }}</RouterLink>
                <button class="btn btn-sm btn-danger" type="button" @click="onDelete">{{ t('demo.del', '删除') }}</button>
              </template>
            </div>
          </div>

          <!-- 变化可见：更新过几次、最近一次改了什么（原来只藏在时间线 tab 里） -->
          <p v-if="demo.timeline?.length" class="dv-updates">
            <b>{{ t('demo.updatedN', '更新过 {n} 次', { n: demo.timeline.length }) }}</b>
            <span class="muted">· {{ demo.timeline[0].message }}</span>
            <button type="button" class="uw-edit" @click="showArchive('timeline')">{{ t('demo.viewTimeline', '看版本 →') }}</button>
          </p>
        </aside>
        <!-- 收起后必须留一条"回得来"的路：细轨上带分数与标题，一眼知道还能展开什么 -->
        <button v-else key="rail" class="dv-rail" type="button" :aria-expanded="false" :title="t('demo.showFactsTip', '展开信息卡（快捷键 I）')" @click="toggleFacts(true)">
          <span class="dv-rail-label">{{ t('demo.expand', '信息') }}</span>
          <span class="dv-rail-score">{{ demo.rating_count ? Number(demo.rating_avg || 0).toFixed(1) : '—' }}</span>
          <span class="dv-rail-title">{{ demo.title }}</span>
        </button>
      </Transition>

      <!-- t22 版式定稿：①它是什么移入主列第二行（dv-story）——与预览同列同宽、行间距 24px 呼吸（不再粘） -->
      <section class="section dv-story">
        <div class="card card-default dv-desc-card">
          <h2 class="dv-h2">{{ t('demo.descTitle', '描述') }}</h2>
          <p style="line-height: 1.8">{{ demo.description }}</p>
          <template v-if="demo.prompt">
            <h2 class="dv-h2" style="margin-top: 22px">{{ t('demo.promptTitle', '第一轮提示词') }}</h2>
            <div class="card card-mint dv-prompt" style="position: relative">
              <!-- t21 追加：提示词一键复制（复制 stamp 语汇） -->
              <CopyButton :text="demo.prompt" style="position: absolute; top: 10px; right: 10px" />
              <p class="dv-prompt-text">{{ demo.prompt }}</p>
            </div>
            <!-- 这里不再放"有了它才能互相对照"那句话：那是上传页用来劝作者填字段的说明，
                 本页提示词就在眼前、下方紧接「严格复现」，重复一遍只是噪音 -->
          </template>
          <template v-if="demo.video_url">
            <h2 class="dv-h2" style="margin-top: 22px">{{ t('demo.videoTitle', '介绍视频') }}</h2>
            <a class="btn btn-sm btn-outline" :href="demo.video_url" target="_blank" rel="noopener">{{ t('demo.watchVideo', '观看介绍视频 ↗') }}</a>
          </template>
        </div>
      </section>
    </div>


    <!-- ② 怎么做出来的：本站最独特的证据（真实生成过程），原来藏在第三个 tab 里。
         用原生 <details>：键盘可达、无需 JS 状态、展开即读。 -->
    <section class="section dv-archive">
      <div class="section-head">
        <h2 class="section-title">{{ t('demo.howTitle', '怎么做出来的') }}</h2>
        <span class="muted">{{ t('demo.howNote', '过程记录仅表示创建与更新演进，不等同于 AI 生成真实性证明') }}</span>
      </div>

      <div class="dv-disclose-grid">
        <details v-if="sessionLogs.length" id="dv-session" class="dv-disclose" :open="opened === 'session'">
        <summary>
          <b>{{ t('demo.tabSession', '会话日志') }}</b>
          <span class="dv-disclose-n">{{ sessionLogs.length }}</span>
          <span class="dv-disclose-hint">{{ t('demo.sessionHint', '点开可读原始对话轨迹') }}</span>
        </summary>
        <div class="dv-disclose-body">
          <div class="filter-row" style="margin-bottom: 10px">
            <button
              v-for="log in sessionLogs"
              :key="log.id"
              class="tag-chip"
              :class="{ active: selectedLog === log.filename }"
              type="button"
              @click="openLog(log.filename)"
            >
              {{ log.filename }}<span v-if="log.file_size" class="count">{{ Math.round(log.file_size / 1024) }}K</span>
            </button>
          </div>
          <div v-if="!selectedLog" class="muted">{{ t('demo.pickSession', '选一个文件查看内容') }}</div>
          <div v-else class="card card-mint" style="padding: 20px">
            <div v-if="loadingLog" class="loading-row"><span class="spinner"></span> {{ t('demo.loadingSession', '加载会话…') }}</div>
            <DshTrajectoryView v-else-if="selectedLog.endsWith('.jsonl')" :raw="logContent" />
            <MarkdownRenderer v-else :content="logContent" />
          </div>
        </div>
      </details>

      <details v-if="demo.timeline?.length" id="dv-timeline" class="dv-disclose" :open="opened === 'timeline'">
        <summary>
          <b>{{ t('demo.tabTimeline', '时间线') }}</b>
          <span class="dv-disclose-n">{{ demo.timeline.length }}</span>
          <span class="dv-disclose-hint">{{ t('demo.timelineHint', '版本与更新说明') }}</span>
        </summary>
        <div class="dv-disclose-body">
          <div class="timeline">
            <div v-for="t2 in demo.timeline" :key="t2.id" class="timeline-item">
              <span class="tag-chip active">{{ t2.version_label }}</span>
              <div class="timeline-body">
                <p style="margin: 0">{{ t2.message }}</p>
                <RouterLink v-if="t2.old_slug" class="btn btn-sm btn-outline" :to="`/demo/${t2.old_slug}`" style="margin-top: 6px">
                  {{ t('demo.viewOld', '查看旧版 →') }}
                </RouterLink>
              </div>
              <span class="muted" style="white-space: nowrap">{{ parseDate(t2.created_at).toLocaleString(currentLocale()) }}</span>
            </div>
          </div>
        </div>
      </details>
      </div><!-- /dv-disclose-grid -->

      <p v-if="!sessionLogs.length && !demo.timeline?.length" class="muted dv-archive-empty">
        {{ t('demo.noArchive', '这件作品没有留下过程记录（早期上传或未开启日志）') }}
      </p>
    </section>

    <!-- ④ 讨论（M1-fix-8 05 §3.2）：交互件不是阅读件——常开（发言零门槛），可手动收起；
         进页每次回到常开（默认偏好不持久化）。③时间线/②会话日志保持折叠（渐进披露语义保留） -->
    <section class="section dv-archive">
      <details id="dv-comments" class="dv-disclose" open>
        <summary>
          <b>{{ t('demo.tabDiscussion', '讨论') }}</b>
          <span class="dv-disclose-n">{{ demo.comment_count }}</span>
          <span class="dv-disclose-hint">{{ t('demo.commentsOpenHint', '输入框常开——看完就能评') }}</span>
          <RouterLink class="btn btn-sm btn-outline dv-summary-cta" :to="`/forum?demo=${demo.slug}`" @click.stop>{{ t('demo.discuss', '讨论 →') }}</RouterLink>
        </summary>
        <div class="dv-disclose-body">
          <QuickComments :slug="slug" />
        </div>
      </details>
    </section>

    <!-- v2：同提示词的其他作品（同一句话交给不同模型 → 严格复现对比，零 Task 依赖） -->
    <section v-if="samePrompt" class="section dv-cmp dv-cmp-repro" style="padding-top: 8px">
      <div class="section-head">
        <h2 class="section-title">{{ t('demo.samePromptTitle', '严格复现：同一句提示词，别的模型交出什么') }}</h2>
        <span class="dv-cmp-tag mono">PROMPT =</span>
        <span class="mini-stat"><b>{{ samePrompt.items.length }}</b> {{ t('demo.samePromptN', '个对照') }}</span>
      </div>
      <div class="card card-mint same-prompt-quote" style="position: relative">
        <span class="same-prompt-label mono">PROMPT · {{ t('demo.samePromptHint', '同一句提示词，不同模型的回答') }}</span>
        <!-- t21 追加：PROMPT= 复现块一键复制（与①区同款 CopyButton） -->
        <CopyButton :text="samePrompt.prompt" style="position: absolute; top: 10px; right: 10px" />
        <p class="same-prompt-text">{{ samePrompt.prompt }}</p>
      </div>
      <div class="waterfall" style="margin-top: 14px">
        <div v-for="d in samePrompt.items" :key="d.slug" class="waterfall-item">
          <DemoCard :demo="d" />
        </div>
      </div>
    </section>

    <!-- 相关推荐 -->
    <!-- v2 §7.3：同题作品（这道题别的模型交了什么）—— 与同提示词互补：一个严格复现，一个同命题发挥 -->
    <section v-if="sameTask" class="section dv-cmp dv-cmp-task" style="padding-top: 8px">
      <div class="section-head">
        <h2 class="section-title">{{ t('demo.sameTaskTitle', '同命题发挥：这道题其他模型交了什么') }}</h2>
        <span class="dv-cmp-tag mono">TASK =</span>
        <RouterLink class="btn btn-sm btn-outline" :to="`/tasks/${sameTask.slug}`">
          {{ t('demo.sameTaskCta', '看同题对比 →') }}
        </RouterLink>
      </div>
      <p class="muted" style="margin: 0 0 10px">
        <b>{{ sameTask.title }}</b>
        <span v-if="sameTask.description"> · {{ sameTask.description }}</span>
      </p>
      <div class="task-lines">
        <RouterLink
          v-for="d in sameTask.demos.filter((x) => x.slug !== slug)"
          :key="d.slug"
          class="task-line"
          :to="`/demo/${d.slug}`"
        >
          <span class="task-line-title">{{ d.title }}</span>
          <ModelChips v-if="d.models?.length" :models="d.models" :max="2" size="sm" />
          <span v-if="d.rating_count" class="stat stat-mint">R {{ (d.rating_avg ?? 0).toFixed(1) }}/{{ d.rating_count }}</span>
          <span class="task-line-cta">{{ t('demo.sameTaskOpen', '看这个版本 →') }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="section dv-cmp dv-cmp-random" style="padding-top: 8px">
      <div class="section-head">
        <h2 class="section-title">{{ t('demo.related', '随便逛逛（与本页无因果关系）') }}</h2>
        <span class="dv-cmp-tag mono">RANDOM</span>
        <button class="btn btn-sm btn-outline" type="button" @click="drawRelated">{{ t('home.shuffle', '换一批') }}</button>
      </div>
      <div v-if="relatedLoading && !relatedShown.length" class="loading-row"><span class="spinner"></span> {{ t('demo.loadingRelated', '加载推荐…') }}</div>
      <div v-else-if="!relatedShown.length" class="empty-box">{{ t('demo.noRelated', '暂无相关推荐') }}</div>
      <div v-else class="waterfall">
        <div v-for="d in relatedShown" :key="d.slug" class="waterfall-item">
          <DemoCard :demo="d" />
        </div>
      </div>
    </section>

    <!-- ④ 继续逛：目标梯度需要明确的"下一步"，不能只把相关区块被动陈列在这里 -->
    <section v-if="browseNext.length" class="section dv-next">
      <div class="dv-next-grid">
        <component
          :is="n.peek ? 'button' : 'RouterLink'"
          v-for="n in browseNext"
          :key="n.to"
          class="dv-next-card"
          :type="n.peek ? 'button' : undefined"
          :to="n.peek ? undefined : n.to"
          @click="n.peek ? (peekTarget = n.peek) : undefined"
        >
          <span class="dv-next-label">{{ n.label }}</span>
          <span class="dv-next-why mono">{{ n.why }}</span>
          <!-- ◱ = 就地预览（不离开本页），→ = 直接导航 -->
          <span class="dv-next-arrow">{{ n.peek ? '◱' : '→' }}</span>
        </component>
      </div>
    </section>

    <PeekDrawer :target="peekTarget" @close="peekTarget = null" @navigate="peekNavigate" />

    <!-- M1-B 移动动作条（03 §6.1 移动线框）：≤720 底部固定；5 键全 ≥44px；主动作(全屏)居中；
         safe-area 垫底；仅 web 型（zip/link 站立卡自带各自 CTA，动作条只服务可玩预览） -->
    <nav v-if="demo.demo_type === 'web'" class="dv-mbar" aria-label="预览动作">
      <button class="dv-mbar-btn" type="button" @click="restartPreview">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10a6 6 0 1 1-2.2-4.6" fill="none" stroke="currentColor" stroke-width="2" /><path d="M16 2v4h-4" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        <span>{{ t('demo.barRestart', '重开') }}</span>
      </button>
      <button class="dv-mbar-btn" type="button" @click="scrollToRating">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L2.2 8.2l5.4-.8z" fill="currentColor" /></svg>
        <span>{{ t('demo.barRate', '评分') }}</span>
      </button>
      <button class="dv-mbar-btn dv-mbar-main" type="button" :aria-pressed="fsActive" @click="toggleFullscreen">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        <span>{{ t('demo.barFullscreen', '全屏') }}</span>
      </button>
      <button class="dv-mbar-btn" type="button" @click="openExternal">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4H4v12h12v-4" fill="none" stroke="currentColor" stroke-width="2" /><path d="M11 3h6v6M17 3l-8 8" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        <span>{{ t('demo.barExternal', '外部打开') }}</span>
      </button>
      <button class="dv-mbar-btn" type="button" @click="openDiscussion">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14v9H9l-4 3.5V13H3z" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        <span>{{ t('demo.barDiscuss', '讨论') }}</span>
      </button>
    </nav>
  </template>
  </div>
</template>

<style scoped>
/* ============================================================
   M0-B 预览三态（组件级样式；全局 style.css 冻结到 P1 拆迁——
   令牌引用全局 --b-dur/--b-ease/--b-stamp-in 与既有语义 token，
   b-march 关键帧本地定义（名随 preview 样板，Vue scoped 自动哈希））
   ============================================================ */
.dv-stage {
  /* t22 修正：此处原设 position:relative 作覆盖层（pv-overlay）定位锚——
     但 scoped 特异度(0,1,1)压过全局 .dv-stage{position:sticky}(0,1,0)，静默废掉 sticky
     并让 top:78 以 relative 语义把预览下推 78px（与描述卡重叠 -46px 的根源）。
     sticky 本身即定位上下文（positioned），覆盖层锚定由全局 sticky 提供——此处不再覆写。 */
}
/* 触屏点击播放海报 */
.pv-poster {
  position: relative;
  aspect-ratio: 16 / 10;
  border: 4px solid var(--ink, #000);
  background: var(--paper-deep, #f2eee6);
  display: grid;
  place-items: center;
  cursor: pointer;
  overflow: hidden;
}
.pv-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pv-poster-fallback {
  font-family: var(--font-heading, sans-serif);
  font-weight: 900;
  font-size: 56px;
  text-transform: uppercase;
}
.pv-play {
  position: absolute;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  background: var(--paper, #fff);
  border: 4px solid var(--ink, #000);
  box-shadow: 4px 4px 0 0 rgba(0, 0, 0, 1);
  color: var(--ink, #000);
  transition: transform var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1)),
    box-shadow var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1));
}
/* 法则 01：按压位移 = 阴影偏移，阴影清零（hover 设备给轻抬起） */
@media (hover: hover) {
  .pv-poster:hover .pv-play {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 0 rgba(0, 0, 0, 1);
  }
}
.pv-poster:active .pv-play {
  transform: translate(4px, 4px);
  box-shadow: none;
  transition-duration: 0ms;
}
.pv-poster-label {
  position: absolute;
  left: 8px;
  bottom: 8px;
  font-family: var(--font-body, monospace);
  font-size: 11px;
  font-weight: 700;
  background: var(--paper, #fff);
  border: 2px solid var(--ink, #000);
  padding: 2px 8px;
}
/* 覆盖层骨架：stamp-in 微档出场（复用全局 b-stamp-in 关键帧与令牌） */
.pv-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  background: var(--paper, #fff);
  animation: b-stamp-in var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1)) both;
}
.pv-loading-inner {
  display: grid;
  gap: 10px;
  justify-items: center;
  padding: 16px 20px;
  border: 4px solid var(--ink, #000);
  background: var(--paper, #fff);
  font-family: var(--font-body, monospace);
  font-size: 12px;
}
/* 蚂蚁线（b-march 语汇，照 preview 样板；关键帧本地定义） */
.pv-march {
  display: block;
  width: 120px;
  height: 4px;
  animation: b-march 0.6s linear infinite;
  background-image: repeating-linear-gradient(90deg, var(--ink, #000) 0 8px, transparent 8px 16px);
  background-size: 32px 4px;
  background-repeat: repeat-x;
  background-position: bottom;
}
@keyframes b-march {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 32px 0;
  }
}
/* 失败兜底卡 */
.pv-fail {
  border-left: 6px solid var(--err, #a4001d);
}
.pv-fail-title {
  font-family: var(--font-heading, sans-serif);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: -0.02em;
}
.pv-fail-hint {
  font-size: 12px;
  color: var(--ink-soft, #555);
  margin: 4px 0 10px;
  max-width: 40ch;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .pv-overlay,
  .pv-play {
    animation: none;
    transition: none;
  }
}

/* ============================================================
   M1-B 移动动作条（03 §6.1 移动线框）——styles/ 冻结令：全 scoped。
   桌面 display:none（纯 CSS 门控，不依赖 JS 视口判断）；≤720 五键网格。
   ============================================================ */
.dv-mbar {
  display: none;
}
@media (max-width: 720px) {
  .dv-mbar {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60; /* 与 dv-rail 同段位：peek(z80)/toast(z1100) 仍在之上 */
    border-top: var(--border-w, 4px) solid var(--ink, #000);
    background: var(--paper, #fff);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  /* 页脚不被遮的垫底走 body padding（脚本挂载/卸载，见 syncBodyPad——footer 在 App.vue，红线不可动） */
}
.dv-mbar-btn {
  min-height: 56px; /* ≥44px 触达底线（图标+标签留白后仍超线） */
  display: grid;
  place-items: center;
  align-content: center;
  gap: 3px;
  padding: 6px 2px;
  background: none;
  border: none;
  border-right: 2px solid var(--ink, #000);
  color: var(--ink, #000);
  font-family: var(--font-body, monospace);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  cursor: pointer;
}
.dv-mbar-btn:last-child {
  border-right: none;
}
.dv-mbar-btn svg {
  width: 20px;
  height: 20px;
}
@media (hover: hover) {
  .dv-mbar-btn:hover {
    background: var(--paper-deep, #f2eee6);
  }
}
.dv-mbar-btn:active {
  transform: translate(2px, 2px);
  transition-duration: 0ms; /* 法则 01：按压位移瞬时化 */
}
/* 主动作（全屏）居中且物理地位最高：反色章（双主题自动：--ink/--paper 互换即反色） */
.dv-mbar-main {
  background: var(--ink, #000);
  color: var(--paper, #fff);
}
@media (hover: hover) {
  .dv-mbar-main:hover {
    background: var(--ink, #000);
  }
}

/* iOS 降级全屏层：固定定位盖住顶栏（z 1050：topbar 1000 之上、toast 1100 之下）；
   Fullscreen API 路径由浏览器接管，无需此类 */
.dv-stage--fs {
  position: fixed;
  inset: 0;
  z-index: 1050;
  max-height: none;
  overflow: auto;
  background: var(--paper, #fff);
  padding: 8px;
}
.dv-stage--fs iframe {
  max-height: calc(100vh - 16px);
}
.dv-fs-exit {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  min-height: 44px; /* 触达底线 */
  padding: 6px 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  background: var(--paper, #fff);
  color: var(--ink, #000);
  border: var(--border-w, 4px) solid var(--ink, #000);
  box-shadow: 4px 4px 0 0 var(--ink, #000);
  cursor: pointer;
}
.dv-fs-exit:active {
  transform: translate(2px, 2px);
  box-shadow: none;
  transition-duration: 0ms;
}

/* ★评分滚达闪档：黄底一闪（峰终：给分入口有可感回应）；reduced-motion 退场 */
.dv-rate--flash {
  animation: dv-rate-flash 0.6s ease both;
}
@keyframes dv-rate-flash {
  0% {
    background: var(--yellow, #ffd93d);
  }
  100% {
    background: transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dv-rate--flash {
    animation: none;
  }
  .dv-mbar-btn:active,
  .dv-fs-exit:active {
    transform: none;
  }
}

/* ============================================================
   M1-fix-8（05 §3.1 修法 A）：row1 包装层 = sticky 容纳块收窄。
   dv-stage 的 sticky 约束块从 dv-shell（跨 row1+row2，全局 demo-detail.css
   未动）变为本包装层——滚到 dv-story 时预览被自然推出视口（标准释放），
   几何上不再与 row2 重叠；dv-story 的显式 grid-row:2 与 facts 跨行不受影响。
   ============================================================ */
.dv-row-preview {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
}
/* 顺带收敛（05 §3.1）：窄主列下 68vh 偏高——预览不超过首屏视口（topbar 78 + 余量），
   释放点可预期；≤1024 全局 62vh 更小，此上限只在桌面大列生效 */
.dv-stage {
  max-height: calc(100vh - 96px);
}
</style>
