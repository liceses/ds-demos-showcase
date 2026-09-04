<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { DemoDetail, DemoSummary, SamePromptResult, SessionLog, TaskDetail } from '../api/types'
import IframePreview from '../components/IframePreview.vue'
import PeekDrawer from '../components/PeekDrawer.vue'
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

// 侧滑预览：图谱的边不该以"离开本页"为代价（否则没人点，图谱就白建了）
const peekTarget = ref<{ kind: 'model' | 'task' | 'demo'; slug: string } | null>(null)
function peekNavigate(path: string) {
  peekTarget.value = null
  void router.push(path)
}

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
      <div class="dv-stage" ref="stageEl">
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
      </div>

      <!-- 收起/展开带动效：状态变化必须"看得见地发生"，否则用户以为按钮坏了 -->
      <Transition name="dv-panel" mode="out-in">
        <aside v-if="factsOpen" key="facts" class="dv-facts">
          <div class="dv-facts-head">
            <span class="eyebrow">{{ demo.status || 'approved' }}</span>
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

          <!-- 评分常驻：玩完顺手就能给分，不必回头找入口 -->
          <div class="dv-group dv-rate">
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
    </div>

    <!-- ① 它是什么：从 tab 里提出来（描述与提示词是理解作品的主路径，不该藏在第二个标签页） -->
    <section class="section dv-story">
      <div class="card card-default dv-desc-card">
        <h2 class="dv-h2">{{ t('demo.descTitle', '描述') }}</h2>
        <p style="line-height: 1.8">{{ demo.description }}</p>
        <template v-if="demo.prompt">
          <h2 class="dv-h2" style="margin-top: 22px">{{ t('demo.promptTitle', '第一轮提示词') }}</h2>
          <div class="card card-mint dv-prompt">
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

    <!-- ③ 讨论：收成一行标题（带条数），点开才占版面 —— 没人在读时不该吃掉半屏 -->
    <section class="section dv-archive">
      <details id="dv-comments" class="dv-disclose">
        <summary>
          <b>{{ t('demo.tabDiscussion', '讨论') }}</b>
          <span class="dv-disclose-n">{{ demo.comment_count }}</span>
          <span class="dv-disclose-hint">{{ t('demo.commentsHint', '点开看评论并发言') }}</span>
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
      <div class="card card-mint same-prompt-quote">
        <span class="same-prompt-label mono">PROMPT · {{ t('demo.samePromptHint', '同一句提示词，不同模型的回答') }}</span>
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
  /* 覆盖层（loading/error）的定位锚 */
  position: relative;
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
</style>
