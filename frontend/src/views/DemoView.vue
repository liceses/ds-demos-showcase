<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { Comment, DemoDetail, SessionLog } from '../api/types'
import IframePreview from '../components/IframePreview.vue'
import MarkdownView from '../components/MarkdownView.vue'
import CommentTree from '../components/CommentTree.vue'

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
    alert((e as Error).message)
  }
}

const canEdit = computed(
  () => !!demo.value && auth.isLoggedIn() && (auth.user?.role === 'admin' || auth.user?.username === demo.value.author),
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
        <span class="mini-stat"><b>{{ demo.author }}</b> 作者</span>
        <span class="mini-stat"><b>{{ new Date(demo.created_at).toLocaleDateString('zh-CN') }}</b> 创建</span>
        <span class="mini-stat"><b>{{ demo.view_count }}</b> 浏览</span>
        <span class="mini-stat"><b>{{ demo.download_count }}</b> 下载</span>
        <span class="mini-stat"><b>{{ demo.comment_count }}</b> 评论</span>
        <div class="btn-group">
          <button class="btn btn-sm btn-secondary" type="button" @click="onDownload">下载 ZIP</button>
          <template v-if="canEdit">
            <RouterLink class="btn btn-sm btn-outline" :to="`/upload?slug=${demo.slug}`">编辑</RouterLink>
            <button class="btn btn-sm btn-danger" type="button" @click="onDelete">删除</button>
          </template>
        </div>
      </div>
    </section>

    <IframePreview
      :srcdoc="demo.previewHtml"
      :src="demo.previewHtml ? undefined : `/preview/${demo.slug}/index.html`"
      :title="demo.title"
    />

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
              <MarkdownView v-else :content="logContent" />
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
  </template>
</template>
