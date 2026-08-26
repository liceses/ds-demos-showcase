<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { ForumReply, ForumTopic } from '../api/types'
import MarkdownRenderer from './MarkdownRenderer.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import { errorMessage } from '../utils/error'

const props = defineProps<{ slug: string }>()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const topic = ref<ForumTopic | null>(null)
const replies = ref<ForumReply[]>([])
const loading = ref(true)
const replyText = ref('')
const posting = ref(false)
const pendingNotice = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await api.listForumTopics({ demo: props.slug, page_size: 1 })
    topic.value = res.items[0] || null
    if (topic.value) {
      replies.value = await api.listForumReplies(topic.value.id)
    } else {
      replies.value = []
    }
  } catch {
    topic.value = null
    replies.value = []
  } finally {
    loading.value = false
  }
}

async function submitReply() {
  if (!topic.value || !replyText.value.trim()) return
  posting.value = true
  try {
    const r = await api.createForumReply(topic.value.id, replyText.value.trim())
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
  <div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载讨论…</div>

    <template v-else>
      <template v-if="topic">
        <div class="forum-thread-head">
          <div>
            <h3 style="margin: 0">{{ topic.title }}</h3>
            <span class="muted" style="font-size: 12px">{{ topic.author || '匿名' }} · {{ topic.reply_count }} 回复 · {{ topic.view_count }} 浏览</span>
          </div>
          <RouterLink class="btn btn-sm btn-outline" :to="`/forum/topic/${topic.id}`">去论坛 →</RouterLink>
        </div>

        <div class="forum-replies" style="margin-top: 12px">
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

        <div class="card forum-reply-box" style="margin-top: 12px">
          <template v-if="auth.isLoggedIn()">
            <div v-if="pendingNotice" class="notice notice-success" style="margin-bottom: 8px">已提交，等待审核，通过后可见。</div>
            <MarkdownEditor v-model="replyText" :rows="3" placeholder="支持 Markdown…" />
            <div class="filter-row" style="margin-top: 8px">
              <button class="btn btn-primary" type="button" :disabled="posting" @click="submitReply">{{ posting ? '提交中…' : '发表回复' }}</button>
            </div>
          </template>
          <template v-else>
            <p class="muted" style="margin: 0 0 8px">登录后才能回复</p>
            <RouterLink class="btn btn-outline" :to="`/login?redirect=${route.fullPath}`">去登录</RouterLink>
          </template>
        </div>
      </template>

      <template v-else>
        <div class="empty-box">
          <p style="margin: 0 0 12px">还没有关于这个 Demo 的讨论</p>
          <RouterLink class="btn btn-primary" :to="`/forum/new?demo=${slug}`">发起讨论 →</RouterLink>
        </div>
      </template>
    </template>
  </div>
</template>
