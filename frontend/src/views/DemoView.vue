<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { Comment, DemoDetail, DemoSummary, SessionLog } from '../api/types'
import IframePreview from '../components/IframePreview.vue'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import DshTrajectoryView from '../components/DshTrajectoryView.vue'
import CommentTree from '../components/CommentTree.vue'
import DemoCard from '../components/DemoCard.vue'
import RatingWidget from '../components/RatingWidget.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const slug = String(route.params.slug)

const demo = ref<DemoDetail | null>(null)
const loading = ref(true)
const error = ref('')
const activeTab = ref<'info' | 'timeline' | 'session' | 'comments'>('info')

const sessionLogs = ref<SessionLog[]>([])
const comments = ref<Comment[]>([])
const selectedLog = ref<string | null>(null)
const logContent = ref('')
const loadingLog = ref(false)
const commentText = ref('')
const posting = ref(false)
const commentError = ref('')

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
    const [s, cm] = await Promise.all([
      api.listSessionLogs(slug).catch(() => []),
      api.listComments(slug).catch(() => []),
    ])
    sessionLogs.value = s
    comments.value = cm
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

async function submitComment() {
  if (!commentText.value.trim()) return
  posting.value = true
  commentError.value = ''
  try {
    await api.postComment(slug, commentText.value.trim())
    commentText.value = ''
    comments.value = await api.listComments(slug)
  } catch (e) {
    commentError.value = (e as Error).message
  } finally {
    posting.value = false
  }
}

async function onDownload() {
  try {
    await api.downloadDemo(slug)
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

const canEdit = computed(
  () => !!demo.value && auth.isLoggedIn() && (auth.user?.role === 'admin' || !!demo.value.is_author),
)

async function onDelete() {
  if (!demo.value) return
  const ok = await ui.confirm({
    title: '删除 Demo',
    message: `确定删除「${demo.value.title}」？此操作不可恢复，本地文件与 OSS 对象都会被清理。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await api.deleteDemo(slug)
    ui.toast('Demo 已删除', 'success')
    router.push('/')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

onMounted(load)
</script>

<template>
  <section v-if="loading" class="loading-row"><span class="spinner"></span> 加载 Demo…</section>

  <section v-else-if="error" class="empty-box">{{ error }}</section>

  <template v-else-if="demo">
    <section class="page-hero" style="padding-bottom: 20px">
      <span class="eyebrow">{{ demo.status || 'approved' }}</span>
      <h1 class="huge" style="margin-top: 14px">{{ demo.title }}</h1>
      <div class="filter-row" style="margin-top: 16px">
        <span class="mini-stat">
          <b>
            <RouterLink v-if="demo.author_id == null" to="/author/public" style="color: inherit">{{ demo.author }}</RouterLink>
            <RouterLink v-else :to="`/user/${demo.author}`" style="color: inherit">{{ demo.author }}</RouterLink>
          </b>
          作者
        </span>
        <span class="mini-stat"><b>{{ new Date(demo.created_at).toLocaleDateString('zh-CN') }}</b> 创建</span>
        <span class="mini-stat"><b>{{ demo.view_count }}</b> 浏览</span>
        <span class="mini-stat"><b>{{ demo.download_count }}</b> 下载</span>
        <span class="mini-stat"><b>{{ demo.comment_count }}</b> 评论</span>
        <div class="btn-group">
          <button v-if="demo.demo_type !== 'link'" class="btn btn-sm btn-secondary" type="button" @click="onDownload">{{ demo.single_file ? '下载文件' : '下载 ZIP' }}</button>
          <template v-if="canEdit">
            <RouterLink class="btn btn-sm btn-outline" :to="`/upload?slug=${demo.slug}`">编辑</RouterLink>
            <button class="btn btn-sm btn-danger" type="button" @click="onDelete">删除</button>
          </template>
        </div>
      </div>
    </section>

    <!-- 评分 -->
    <RatingWidget :slug="demo.slug" />

    <template v-if="demo.demo_type === 'web'">
      <IframePreview
        :srcdoc="demo.previewHtml"
        :src="demo.previewHtml ? undefined : (demo.preview_url ?? `/preview/${demo.slug}/index.html`)"
        :title="demo.title"
      />
    </template>

    <template v-else-if="demo.demo_type === 'zip'">
      <div class="card card-mint" style="padding: 32px; text-align: center">
        <h2 style="margin-bottom: 10px">文件包项目</h2>
        <p class="muted" style="margin-bottom: 18px">这是一个项目文件包（非网页应用），不提供在线预览，请下载后本地查看。</p>
        <button class="btn btn-primary" type="button" @click="onDownload">下载 ZIP（{{ demo.download_count }} 次）</button>
      </div>
    </template>

    <template v-else>
      <div class="card card-coral" style="padding: 32px; text-align: center">
        <h2 style="margin-bottom: 10px">外部链接项目</h2>
        <p class="muted" style="margin-bottom: 18px">内容托管在外部站点，点击下方按钮跳转访问。</p>
        <a class="btn btn-primary" :href="demo.external_url ?? undefined" target="_blank" rel="noopener">打开链接 →</a>
      </div>
    </template>

    <section class="section">
      <div class="tabs">
        <button class="tab" :class="{ active: activeTab === 'info' }" type="button" @click="activeTab = 'info'">信息</button>
        <button class="tab" :class="{ active: activeTab === 'timeline' }" type="button" @click="activeTab = 'timeline'">时间线</button>
        <button class="tab" :class="{ active: activeTab === 'session' }" type="button" @click="activeTab = 'session'">会话日志</button>
        <button class="tab" :class="{ active: activeTab === 'comments' }" type="button" @click="activeTab = 'comments'">评论</button>
      </div>

      <Transition name="tab-pane" mode="out-in">
        <div :key="activeTab" class="tab-pane">
          <template v-if="activeTab === 'info'">
            <div class="card card-default" style="padding: 22px">
              <h2 style="margin-bottom: 12px">描述</h2>
              <p style="line-height: 1.8">{{ demo.description }}</p>

              <template v-if="demo.prompt">
                <h2 style="margin: 22px 0 12px">第一轮提示词</h2>
                <div class="card card-mint" style="padding: 16px; border-left: 4px solid var(--ink)">
                  <p style="margin: 0; line-height: 1.8; white-space: pre-wrap; font-family: var(--font-mono); font-size: 13px">{{ demo.prompt }}</p>
                </div>
              </template>

              <template v-if="demo.video_url">
                <h2 style="margin: 22px 0 12px">介绍视频</h2>
                <a class="btn btn-sm btn-outline" :href="demo.video_url" target="_blank" rel="noopener">观看介绍视频 ↗</a>
              </template>

              <h2 style="margin: 22px 0 12px">标签</h2>
              <div class="filter-row">
                <RouterLink
                  v-for="t in demo.tags"
                  :key="t.key + ':' + t.value"
                  class="tag-chip"
                  :class="t.key === 'author' ? 'yellow' : t.key === 'model' ? 'teal' : ''"
                  :to="`/tag/${t.key}/${t.value}`"
                >
                  {{ t.key }}:{{ t.value }}
                </RouterLink>
              </div>
              <div class="notice notice-info" style="margin-top: 20px">
                <strong>时间线说明：</strong>版本记录仅表示该 Demo 的创建与更新演进过程。
              </div>
            </div>
          </template>

          <template v-else-if="activeTab === 'timeline'">
            <div v-if="!demo.timeline?.length" class="empty-box">暂无版本记录</div>
            <div v-else class="timeline">
              <div v-for="t in demo.timeline" :key="t.id" class="timeline-item">
                <span class="tag-chip" :class="{ active: true }">{{ t.version_label }}</span>
                <div class="timeline-body">
                  <p style="margin: 0">{{ t.message }}</p>
                  <RouterLink v-if="t.old_slug" class="btn btn-sm btn-outline" :to="`/demo/${t.old_slug}`" style="margin-top: 6px">
                    查看旧版 →
                  </RouterLink>
                </div>
                <span class="muted" style="white-space: nowrap">{{ new Date(t.created_at).toLocaleString('zh-CN') }}</span>
              </div>
            </div>
          </template>

          <template v-else-if="activeTab === 'session'">
            <div v-if="!sessionLogs.length" class="empty-box">暂无会话日志</div>
            <div v-else class="filter-row">
              <button
                v-for="log in sessionLogs"
                :key="log.id"
                class="tab"
                :class="{ active: selectedLog === log.filename }"
                type="button"
                @click="openLog(log.filename)"
              >
                {{ log.filename }}
              </button>
            </div>
            <div v-if="selectedLog" class="card card-mint" style="padding: 20px">
              <div v-if="loadingLog" class="loading-row"><span class="spinner"></span> 加载会话…</div>
              <DshTrajectoryView v-else-if="selectedLog.endsWith('.jsonl')" :raw="logContent" />
              <MarkdownRenderer v-else :content="logContent" />
            </div>
          </template>

          <template v-else-if="activeTab === 'comments'">
            <div v-if="auth.isLoggedIn()" class="card card-coral" style="padding: 18px; margin-bottom: 20px">
              <textarea v-model="commentText" class="input textarea" rows="3" placeholder="写下你的评论…"></textarea>
              <div class="filter-row" style="margin-top: 10px">
                <button class="btn btn-primary" type="button" :disabled="posting || !commentText.trim()" @click="submitComment">
                  {{ posting ? '提交中…' : '发表评论' }}
                </button>
                <span v-if="commentError" class="notice notice-error" style="margin: 0">{{ commentError }}</span>
              </div>
            </div>
            <div v-else class="notice notice-warn">
              登录后即可发表评论。<RouterLink to="/login">去登录</RouterLink>
            </div>
            <CommentTree v-if="comments.length" :slug="slug" :comments="comments" :on-posted="load" />
            <div v-else class="empty-box">还没有评论，来抢沙发。</div>
          </template>
        </div>
      </Transition>
    </section>

    <!-- 相关推荐 -->
    <section class="section" style="padding-top: 8px">
      <div class="section-head">
        <h2 class="section-title">相关推荐</h2>
        <button class="btn btn-sm btn-outline" type="button" @click="drawRelated">换一批</button>
      </div>
      <div v-if="relatedLoading && !relatedShown.length" class="loading-row"><span class="spinner"></span> 加载推荐…</div>
      <div v-else-if="!relatedShown.length" class="empty-box">暂无相关推荐</div>
      <div v-else class="waterfall">
        <div v-for="d in relatedShown" :key="d.slug" class="waterfall-item">
          <DemoCard :demo="d" />
        </div>
      </div>
    </section>
  </template>
</template>
