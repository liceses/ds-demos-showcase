<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { ForumReply, ForumTopic } from '../api/types'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { errorMessage } from '../utils/error'
import { timeAgo } from '../utils/time'

const props = defineProps<{ slug: string }>()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const topic = ref<ForumTopic | null>(null)
const demoTitle = ref('')
const replies = ref<ForumReply[]>([])
const loading = ref(true)
const replyText = ref('')
const posting = ref(false)
const creatingTopic = ref(false)
const pendingNotice = ref(false)
const page = ref(1)
const total = ref(0)
const loadingMore = ref(false)

async function load() {
  loading.value = true
  try {
    const [res, d] = await Promise.all([
      api.listForumTopics({ demo: props.slug, page_size: 1 }),
      api.getDemo(props.slug).catch(() => null),
    ])
    topic.value = res.items[0] || null
    demoTitle.value = d?.title || props.slug
    if (topic.value) {
      const r = await api.listForumRepliesPage(topic.value.id, 1, 30)
      replies.value = r.items
      total.value = r.total
      page.value = 1
    } else {
      replies.value = []
      total.value = 0
    }
  } catch {
    topic.value = null
    demoTitle.value = props.slug
    replies.value = []
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!topic.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const r = await api.listForumRepliesPage(topic.value.id, page.value + 1, 30)
    replies.value = [...replies.value, ...r.items]
    total.value = r.total
    page.value += 1
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    loadingMore.value = false
  }
}

async function submit() {
  const text = replyText.value.trim()
  if (!text || posting.value) return
  posting.value = true
  try {
    let tid = topic.value?.id
    if (!tid) {
      creatingTopic.value = true
      const t = await api.createForumTopic({
        title: `讨论：${demoTitle.value || props.slug}`,
        content: '',
        category: 'demo',
        demo_slug: props.slug,
        tags: [],
      })
      topic.value = t
      tid = t.id
    }
    const r = await api.createForumReply(tid, text)
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
    creatingTopic.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载讨论…</div>

    <div v-else class="quick-comments">
      <div class="quick-comment-input">
        <template v-if="auth.isLoggedIn()">
          <div v-if="pendingNotice" class="notice notice-success" style="margin-bottom: 8px">已提交，等待审核，通过后可见。</div>
          <p v-if="!topic" class="muted" style="margin: 0 0 6px">第一条评论将创建该作品的讨论。</p>
          <div class="filter-row" style="margin: 0">
            <input
              v-model="replyText"
              class="input"
              type="text"
              :placeholder="topic ? '说点什么…（回车发送）' : '说点什么…（回车即发）'"
              @keyup.enter="submit"
            />
            <button class="btn btn-primary" type="button" :disabled="posting || creatingTopic || !replyText.trim()" @click="submit">{{ creatingTopic ? '创建中…' : (posting ? '发送中…' : '发送') }}</button>
          </div>
        </template>
        <template v-else>
          <p class="muted" style="margin: 0 0 8px">登录后才能评论</p>
          <RouterLink class="btn btn-outline" :to="`/login?redirect=${route.fullPath}`">去登录</RouterLink>
        </template>
      </div>

      <div class="quick-comment-list">
        <div v-for="(r, i) in replies" :key="r.id" class="quick-comment">
          <div class="quick-comment-head">
            <span class="quick-comment-author">{{ r.author || '匿名' }}</span>
            <span class="quick-comment-floor">#{{ i + 1 }}</span>
            <span class="quick-comment-time">{{ timeAgo(r.created_at) }}</span>
          </div>
          <MarkdownRenderer :content="r.content" />
        </div>
        <div v-if="!replies.length" class="empty-box">还没有评论，来抢沙发</div>
        <button
          v-if="replies.length < total"
          class="btn btn-outline btn-block"
          type="button"
          :disabled="loadingMore"
          @click="loadMore"
        >{{ loadingMore ? '加载中…' : '加载更多' }}</button>
      </div>
    </div>
  </div>
</template>
