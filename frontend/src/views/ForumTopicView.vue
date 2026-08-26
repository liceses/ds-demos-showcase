<script setup lang="ts">
defineOptions({ name: 'ForumTopicView' })
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { DemoDetail, ForumReply, ForumTopic } from '../api/types'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { errorMessage } from '../utils/error'

const props = defineProps<{ id: string }>()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const topic = ref<ForumTopic | null>(null)
const replies = ref<ForumReply[]>([])
const demoCard = ref<DemoDetail | null>(null)
const demoCardLoading = ref(false)
const loading = ref(true)
const error = ref('')
const replyText = ref('')
const posting = ref(false)
const pendingNotice = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const tid = Number(props.id)
    const [t, r] = await Promise.all([api.getForumTopic(tid), api.listForumReplies(tid)])
    topic.value = t
    replies.value = r
    demoCard.value = null
    if (t?.demo_slug) {
      demoCardLoading.value = true
      try {
        demoCard.value = await api.getDemo(t.demo_slug)
      } catch {
        demoCard.value = null
      } finally {
        demoCardLoading.value = false
      }
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function reportTopic() {
  if (!topic.value) return
  const reason = window.prompt('举报理由（必填）')
  if (!reason || !reason.trim()) return
  try {
    await api.createForumReport({ target_type: 'topic', target_id: topic.value.id, reason: reason.trim() })
    ui.toast('举报已提交，感谢反馈', 'success')
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  }
}

async function submitReply() {
  if (!replyText.value.trim()) return
  posting.value = true
  try {
    const r = await api.createForumReply(Number(props.id), replyText.value.trim())
    replyText.value = ''
    if (r.status === 'reviewing') {
      pendingNotice.value = true
      ui.toast('已提交，等待审核', 'success')
    } else {
      pendingNotice.value = false
      await load()
    }
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    posting.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="forum-section">
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载主题…</div>

    <template v-else-if="topic">
      <div class="breadcrumb">
        <RouterLink to="/forum">讨论区</RouterLink>
        <span class="sep">/</span>
        <span>{{ topic.title }}</span>
      </div>

      <div class="card forum-topic-main">
        <div class="forum-topic-title">
          <span v-if="topic.pinned" class="forum-badge forum-badge-pin">置顶</span>
          <span v-if="topic.sticky" class="forum-badge forum-badge-sticky">加精</span>
          <span class="forum-cat">{{ topic.category }}</span>
          {{ topic.title }}
        </div>
        <div class="forum-topic-meta">
          <span>{{ topic.author || '匿名' }}</span>
          <span class="forum-stat">回复 {{ topic.reply_count }}</span>
          <span class="forum-stat">浏览 {{ topic.view_count }}</span>
          <span>{{ new Date(topic.created_at).toLocaleString('zh-CN') }}</span>
          <RouterLink v-if="topic.demo_slug && !demoCard && !demoCardLoading" class="forum-stat" :to="`/demo/${topic.demo_slug}`">相关作品 →</RouterLink>
          <button class="btn btn-sm btn-outline" type="button" @click="reportTopic">举报</button>
        </div>
        <div v-if="topic.demo_slug && demoCardLoading" class="forum-demo-card forum-demo-loading">加载关联作品…</div>
        <RouterLink v-else-if="topic.demo_slug && demoCard" :to="`/demo/${topic.demo_slug}`" class="forum-demo-card">
          <img class="forum-demo-cover" :src="demoCard.cover_url" :alt="demoCard.title" loading="lazy" />
          <span class="forum-demo-main">
            <span class="forum-demo-title">{{ demoCard.title }}</span>
            <span class="forum-demo-meta">{{ demoCard.author }} · {{ demoCard.tags.length }} 标签 · 查看作品 →</span>
          </span>
        </RouterLink>
        <MarkdownRenderer :content="topic.content" />
      </div>

      <div class="forum-replies">
        <div v-for="(r, i) in replies" :key="r.id" class="card forum-reply">
          <div class="forum-reply-head">
            <span class="forum-reply-author">{{ r.author || '匿名' }}</span>
            <span class="forum-reply-floor">#{{ i + 1 }}</span>
            <span class="forum-reply-time">{{ new Date(r.created_at).toLocaleString('zh-CN') }}</span>
          </div>
          <MarkdownRenderer :content="r.content" />
        </div>
        <div v-if="!replies.length" class="empty-box">还没有回复</div>
      </div>

      <div class="card forum-reply-box">
        <h3 style="margin-bottom: 10px">回复</h3>
        <template v-if="auth.isLoggedIn()">
          <div v-if="pendingNotice" class="notice notice-success" style="margin-bottom: 8px">已提交，等待审核，通过后可见。</div>
          <MarkdownEditor v-model="replyText" :rows="4" placeholder="支持 Markdown…" />
          <div class="filter-row" style="margin-top: 10px">
            <button class="btn btn-primary" type="button" :disabled="posting" @click="submitReply">{{ posting ? '提交中…' : '发表回复' }}</button>
          </div>
        </template>
        <template v-else>
          <p class="muted">登录后才能回复</p>
          <RouterLink class="btn btn-outline" :to="`/login?redirect=${route.fullPath}`">去登录</RouterLink>
        </template>
      </div>
    </template>
  </section>
</template>
