<script setup lang="ts">
defineOptions({ name: 'ForumTopicView' })
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { DemoDetail, ForumReply, ForumTopic, UserProfile } from '../api/types'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { errorMessage } from '../utils/error'
import { parseDate } from '../utils/time'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
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
const replyPage = ref(1)
const replyTotal = ref(0)
const replyParentId = ref<number | null>(null)
const loadingMore = ref(false)
const hotTopics = ref<ForumTopic[]>([])
const authorProfile = ref<UserProfile | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const tid = Number(props.id)
    const [t, r] = await Promise.all([api.getForumTopic(tid), api.listForumRepliesPage(tid, 1, 50)])
    topic.value = t
    replies.value = r.items
    replyTotal.value = r.total
    replyPage.value = 1
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
    if (t?.author) {
      api.getUserProfile(t.author).then((p) => (authorProfile.value = p)).catch(() => (authorProfile.value = null))
    }
    api.listForumTopics({ sort: 'hot', page_size: 5 }).then((r) => (hotTopics.value = r.items)).catch(() => (hotTopics.value = []))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function avatarClass(name: string) {
  const n = (name.charCodeAt(0) || 0) % 4
  return `avatar-${n + 1}`
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

async function loadMore() {
  if (!topic.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const r = await api.listForumRepliesPage(Number(props.id), replyPage.value + 1, 50)
    replies.value = [...replies.value, ...r.items]
    replyTotal.value = r.total
    replyPage.value += 1
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    loadingMore.value = false
  }
}

function quoteReply(r: ForumReply) {
  replyParentId.value = r.id
  const first = r.content.split('\n')[0].slice(0, 80)
  replyText.value = `> ${first}\n\n`
}

async function toggleReaction(targetType: 'topic' | 'reply', targetId: number, reactionType: 'like' | 'thanks') {
  if (!auth.isLoggedIn()) {
    router.push(`/login?redirect=${route.fullPath}`)
    return
  }
  const obj = targetType === 'topic' ? topic.value : replies.value.find((r) => r.id === targetId)
  if (!obj) return
  const anyObj = obj as unknown as { like_count?: number; thanks_count?: number; my_reactions?: string[] }
  const before = { like: anyObj.like_count || 0, thanks: anyObj.thanks_count || 0, reactions: [...(anyObj.my_reactions || [])] }
  if (anyObj.my_reactions?.includes(reactionType)) {
    anyObj.my_reactions = anyObj.my_reactions.filter((x) => x !== reactionType)
    if (reactionType === 'like') anyObj.like_count = Math.max(0, (anyObj.like_count || 0) - 1)
    else anyObj.thanks_count = Math.max(0, (anyObj.thanks_count || 0) - 1)
  } else {
    anyObj.my_reactions = [...(anyObj.my_reactions || []), reactionType]
    if (reactionType === 'like') anyObj.like_count = (anyObj.like_count || 0) + 1
    else anyObj.thanks_count = (anyObj.thanks_count || 0) + 1
  }
  try {
    await api.toggleReaction(targetType, targetId, reactionType)
  } catch (e) {
    anyObj.like_count = before.like
    anyObj.thanks_count = before.thanks
    anyObj.my_reactions = before.reactions
    ui.toast(errorMessage(e), 'error')
  }
}

async function submitReply() {
  if (!replyText.value.trim()) return
  posting.value = true
  try {
    const r = await api.createForumReply(Number(props.id), replyText.value.trim(), replyParentId.value ?? undefined)
    replyText.value = ''
    replyParentId.value = null
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

      <div class="forum-layout">
        <div class="forum-main">
          <div class="card forum-topic-main">
            <div class="forum-topic-head">
              <span class="forum-avatar" :class="avatarClass(topic.author || '匿名')">{{ (topic.author || '匿')[0] }}</span>
              <div class="forum-topic-head-main">
                <div class="forum-topic-title">
                  <span v-if="topic.pinned" class="forum-badge forum-badge-pin">置顶</span>
                  <span v-if="topic.sticky" class="forum-badge forum-badge-sticky">加精</span>
                  <span v-if="topic.solved" class="forum-badge" style="background: var(--mint)">已解决</span>
                  <span v-if="topic.locked" class="forum-badge" style="background: var(--ink); color: var(--paper)">已关闭</span>
                  <span class="forum-cat">{{ topic.category }}</span>
                  {{ topic.title }}
                </div>
                <div class="forum-topic-meta">
                  <span>{{ topic.author || '匿名' }}</span>
                  <span class="forum-stat">回复 {{ topic.reply_count }}</span>
                  <span class="forum-stat">浏览 {{ topic.view_count }}</span>
                  <span>{{ parseDate(topic.created_at).toLocaleString('zh-CN') }}</span>
                </div>
              </div>
            </div>
            <MarkdownRenderer :content="topic.content" />
            <div class="forum-topic-actions">
              <button class="btn btn-sm btn-outline" :class="{ active: topic.my_reactions.includes('like') }" type="button" @click="toggleReaction('topic', topic.id, 'like')">赞 {{ topic.like_count }}</button>
              <button class="btn btn-sm btn-outline" :class="{ active: topic.my_reactions.includes('thanks') }" type="button" @click="toggleReaction('topic', topic.id, 'thanks')">感谢 {{ topic.thanks_count }}</button>
              <button class="btn btn-sm btn-outline" type="button" @click="reportTopic">举报</button>
            </div>
          </div>

          <div class="forum-replies">
            <div v-for="(r, i) in replies" :key="r.id" class="card forum-reply" :class="{ nested: r.parent_id }">
              <div class="forum-reply-head">
                <span class="forum-avatar avatar-sm" :class="avatarClass(r.author || '匿名')">{{ (r.author || '匿')[0] }}</span>
                <span class="forum-reply-author">{{ r.author || '匿名' }}</span>
                <span class="forum-reply-floor">#{{ i + 1 }}</span>
                <span v-if="r.parent_id" class="forum-reply-parent">↳ 回复 #{{ replies.findIndex((x) => x.id === r.parent_id) + 1 }}</span>
                <span class="forum-reply-time">{{ parseDate(r.created_at).toLocaleString('zh-CN') }}</span>
              </div>
              <MarkdownRenderer :content="r.content" />
              <div class="forum-reply-actions">
                <button class="btn btn-sm btn-outline" :class="{ active: (r.my_reactions || []).includes('like') }" type="button" @click="toggleReaction('reply', r.id, 'like')">赞 {{ r.like_count || 0 }}</button>
                <button class="btn btn-sm btn-outline" :class="{ active: (r.my_reactions || []).includes('thanks') }" type="button" @click="toggleReaction('reply', r.id, 'thanks')">感谢 {{ r.thanks_count || 0 }}</button>
                <button class="btn btn-sm btn-outline" type="button" @click="quoteReply(r)">引用</button>
              </div>
            </div>
            <div v-if="!replies.length" class="empty-box">还没有回复</div>
            <button
              v-if="replies.length < replyTotal"
              class="btn btn-outline btn-block"
              type="button"
              :disabled="loadingMore"
              @click="loadMore"
            >{{ loadingMore ? '加载中…' : '加载更多回复' }}</button>
          </div>

          <div class="card forum-reply-box">
            <h3 style="margin-bottom: 10px">回复</h3>
            <div v-if="topic.locked" class="notice notice-warn" style="margin-bottom: 8px">该主题已关闭讨论。</div>
            <template v-else-if="auth.isLoggedIn()">
              <div v-if="pendingNotice" class="notice notice-success" style="margin-bottom: 8px">已提交，等待审核，通过后可见。</div>
              <div v-if="replyParentId" class="filter-row" style="margin-bottom: 6px">
                <span class="tag-chip active">正在回复 #{{ replies.findIndex((x) => x.id === replyParentId) + 1 }}</span>
                <button class="btn btn-sm btn-dark" type="button" @click="replyParentId = null; replyText = ''">取消</button>
              </div>
              <MarkdownEditor v-model="replyText" :rows="4" placeholder="支持 Markdown…" />
              <div class="filter-row" style="margin-top: 10px">
                <button class="btn btn-primary" type="button" :disabled="posting || !replyText.trim()" @click="submitReply">{{ posting ? '提交中…' : '发表回复' }}</button>
              </div>
            </template>
            <template v-else>
              <p class="muted">登录后才能回复</p>
              <RouterLink class="btn btn-outline" :to="`/login?redirect=${route.fullPath}`">去登录</RouterLink>
            </template>
          </div>
        </div>

        <aside class="forum-side">
          <div class="forum-side-card">
            <h3 class="forum-side-title">作者</h3>
            <div class="forum-side-author">
              <span class="forum-avatar" :class="avatarClass(topic.author || '匿名')">{{ (topic.author || '匿')[0] }}</span>
              <div>
                <div class="forum-side-author-name">{{ topic.author || '匿名' }}</div>
                <div v-if="authorProfile" class="muted" style="font-size: 12px">声望 {{ authorProfile.reputation }} · 粉丝 {{ authorProfile.follower_count }}</div>
              </div>
            </div>
            <RouterLink v-if="topic.author && !authorProfile?.is_self" class="btn btn-sm btn-outline btn-block" :to="`/user/${topic.author}`">个人主页</RouterLink>
          </div>

          <div v-if="topic.demo_slug" class="forum-side-card">
            <h3 class="forum-side-title">相关 Demo</h3>
            <div v-if="demoCardLoading" class="muted">加载中…</div>
            <RouterLink v-else-if="demoCard" :to="`/demo/${topic.demo_slug}`" class="forum-demo-card">
              <img class="forum-demo-cover" :src="demoCard.cover_url" :alt="demoCard.title" loading="lazy" />
              <span class="forum-demo-main">
                <span class="forum-demo-title">{{ demoCard.title }}</span>
                <span class="forum-demo-meta">{{ demoCard.author }}</span>
              </span>
            </RouterLink>
            <RouterLink v-else class="btn btn-sm btn-outline btn-block" :to="`/demo/${topic.demo_slug}`">查看作品 →</RouterLink>
          </div>

          <div class="forum-side-card">
            <h3 class="forum-side-title">热门话题</h3>
            <div class="forum-side-list">
              <RouterLink v-for="t in hotTopics.slice(0, 5)" :key="t.id" class="forum-side-item" :to="`/forum/topic/${t.id}`">
                <span class="forum-side-item-title">{{ t.title }}</span>
                <span class="forum-stat">{{ t.reply_count }}</span>
              </RouterLink>
              <div v-if="!hotTopics.length" class="muted">暂无</div>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>
