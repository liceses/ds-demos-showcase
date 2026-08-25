<script setup lang="ts">
defineOptions({ name: 'ForumTopicView' })
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { ForumReply, ForumTopic } from '../api/types'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'

const props = defineProps<{ id: string }>()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const topic = ref<ForumTopic | null>(null)
const replies = ref<ForumReply[]>([])
const loading = ref(true)
const error = ref('')
const replyText = ref('')
const replyPreview = ref(false)
const posting = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const tid = Number(props.id)
    const [t, r] = await Promise.all([api.getForumTopic(tid), api.listForumReplies(tid)])
    topic.value = t
    replies.value = r
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
    const err = e as Error & { cause?: unknown }
    if (err.cause === 429) ui.toast('操作过于频繁，请稍后再试', 'error')
    else ui.toast(err.message, 'error')
  }
}

async function submitReply() {
  if (!replyText.value.trim()) return
  posting.value = true
  try {
    await api.createForumReply(Number(props.id), replyText.value.trim())
    replyText.value = ''
    replyPreview.value = false
    await load()
  } catch (e) {
    const err = e as Error & { cause?: unknown }
    if (err.cause === 429) ui.toast('操作过于频繁，请稍后再试', 'error')
    else ui.toast(err.message, 'error')
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
          <RouterLink v-if="topic.demo_slug" class="forum-stat" :to="`/demo/${topic.demo_slug}`">相关作品 →</RouterLink>
          <button class="btn btn-sm btn-outline" type="button" @click="reportTopic">举报</button>
        </div>
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
          <div class="filter-row" style="margin-bottom: 8px">
            <button class="btn btn-sm btn-outline" type="button" @click="replyPreview = !replyPreview">{{ replyPreview ? '编辑' : '预览' }}</button>
          </div>
          <textarea v-if="!replyPreview" v-model="replyText" class="input textarea" rows="4" placeholder="支持 Markdown…"></textarea>
          <MarkdownRenderer v-else :content="replyText" />
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
