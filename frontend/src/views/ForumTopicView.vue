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
import { parseDate, currentLocale } from '../utils/time'
import { t, forumCatLabel } from '../i18n'

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
const sideOpen = ref(true)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const tid = Number(props.id)
    const [tp, rp] = await Promise.all([api.getForumTopic(tid), api.listForumRepliesPage(tid, 1, 50)])
    topic.value = tp
    replies.value = rp.items
    replyTotal.value = rp.total
    replyPage.value = 1
    demoCard.value = null
    if (tp?.demo_slug) {
      demoCardLoading.value = true
      try {
        demoCard.value = await api.getDemo(tp.demo_slug)
      } catch {
        demoCard.value = null
      } finally {
        demoCardLoading.value = false
      }
    }
    if (tp?.author) {
      api.getUserProfile(tp.author).then((p) => (authorProfile.value = p)).catch(() => (authorProfile.value = null))
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
  const reason = window.prompt(t('forum.reportReason', '举报理由（必填）'))
  if (!reason || !reason.trim()) return
  try {
    await api.createForumReport({ target_type: 'topic', target_id: topic.value.id, reason: reason.trim() })
    ui.toast(t('forum.reported', '举报已提交，感谢反馈'), 'success')
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
      ui.toast(t('forum.reviewing', '已提交，等待审核'), 'success')
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
  <div class="route-page">  <section class="forum-section">
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('forum.loading', '加载主题…') }}</div>

    <template v-else-if="topic">
      <div class="breadcrumb">
        <RouterLink to="/forum">{{ t('forum.title', '讨论区') }}</RouterLink>
        <span class="sep">/</span>
        <span>{{ topic.title }}</span>
        <button class="btn btn-sm btn-outline" style="margin-left: auto" type="button" @click="sideOpen = !sideOpen">{{ sideOpen ? t('forum.hideSide', '收起侧栏') : t('forum.showSide', '展开侧栏') }}</button>
      </div>

      <div class="forum-layout">
        <div class="forum-main">
          <div class="card forum-topic-main">
            <div class="forum-topic-head">
              <span class="forum-avatar" :class="avatarClass(topic.author || t('forum.anon', '匿名'))">{{ (topic.author || t('forum.anon', '匿名'))[0] }}</span>
              <div class="forum-topic-head-main">
                <div class="forum-topic-title">
                  <span v-if="topic.pinned" class="forum-badge forum-badge-pin">{{ t('forum.pinned', '置顶') }}</span>
                  <span v-if="topic.sticky" class="forum-badge forum-badge-sticky">{{ t('forum.sticky', '加精') }}</span>
                  <span v-if="topic.solved" class="forum-badge" style="background: var(--mint)">{{ t('forum.solved', '已解决') }}</span>
                  <span v-if="topic.locked" class="forum-badge" style="background: var(--ink); color: var(--paper)">{{ t('forum.locked', '已关闭') }}</span>
                  <span class="forum-cat">{{ forumCatLabel(topic.category) }}</span>
                  {{ topic.title }}
                </div>
                <div class="forum-topic-meta">
                  <span>{{ topic.author || t('forum.anon', '匿名') }}</span>
                  <span class="forum-stat">{{ t('forum.replies', '回复 {n}', { n: topic.reply_count }) }}</span>
                  <span class="forum-stat">{{ t('forum.views', '浏览 {n}', { n: topic.view_count }) }}</span>
                  <span>{{ parseDate(topic.created_at).toLocaleString(currentLocale()) }}</span>
                </div>
              </div>
            </div>
            <MarkdownRenderer :content="topic.content" />
            <div class="forum-topic-actions">
              <button class="btn btn-sm btn-outline" :class="{ active: topic.my_reactions.includes('like') }" type="button" @click="toggleReaction('topic', topic.id, 'like')">{{ t('forum.likeN', '赞 {n}', { n: topic.like_count }) }}</button>
              <button class="btn btn-sm btn-outline" :class="{ active: topic.my_reactions.includes('thanks') }" type="button" @click="toggleReaction('topic', topic.id, 'thanks')">{{ t('forum.thanksN', '感谢 {n}', { n: topic.thanks_count }) }}</button>
              <button class="btn btn-sm btn-outline" type="button" @click="reportTopic">{{ t('forum.report', '举报') }}</button>
            </div>
          </div>

          <div class="forum-replies">
            <div v-for="(r, i) in replies" :key="r.id" class="card forum-reply" :class="{ nested: r.parent_id }">
              <div class="forum-reply-head">
                <span class="forum-avatar avatar-sm" :class="avatarClass(r.author || t('forum.anon', '匿名'))">{{ (r.author || t('forum.anon', '匿名'))[0] }}</span>
                <span class="forum-reply-author">{{ r.author || t('forum.anon', '匿名') }}</span>
                <span class="forum-reply-floor">#{{ i + 1 }}</span>
                <span v-if="r.parent_id" class="forum-reply-parent">↳ {{ t('forum.replyTo', '回复 #{n}', { n: replies.findIndex((x) => x.id === r.parent_id) + 1 }) }}</span>
                <span class="forum-reply-time">{{ parseDate(r.created_at).toLocaleString(currentLocale()) }}</span>
              </div>
              <MarkdownRenderer :content="r.content" />
              <div class="forum-reply-actions">
                <button class="btn btn-sm btn-outline" :class="{ active: (r.my_reactions || []).includes('like') }" type="button" @click="toggleReaction('reply', r.id, 'like')">{{ t('forum.likeN', '赞 {n}', { n: r.like_count || 0 }) }}</button>
                <button class="btn btn-sm btn-outline" :class="{ active: (r.my_reactions || []).includes('thanks') }" type="button" @click="toggleReaction('reply', r.id, 'thanks')">{{ t('forum.thanksN', '感谢 {n}', { n: r.thanks_count || 0 }) }}</button>
                <button class="btn btn-sm btn-outline" type="button" @click="quoteReply(r)">{{ t('forum.quote', '引用') }}</button>
              </div>
            </div>
            <div v-if="!replies.length" class="empty-box">{{ t('forum.noReplies', '还没有回复') }}</div>
            <button
              v-if="replies.length < replyTotal"
              class="btn btn-outline btn-block"
              type="button"
              :disabled="loadingMore"
              @click="loadMore"
            >{{ loadingMore ? t('common.loading', '加载中…') : t('forum.loadMoreReplies', '加载更多回复') }}</button>
          </div>

          <div class="card forum-reply-box">
            <h3 style="margin-bottom: 10px">{{ t('forum.reply', '回复') }}</h3>
            <div v-if="topic.locked" class="notice notice-warn" style="margin-bottom: 8px">{{ t('forum.lockedNotice', '该主题已关闭讨论。') }}</div>
            <template v-else-if="auth.isLoggedIn()">
              <div v-if="pendingNotice" class="notice notice-success" style="margin-bottom: 8px">{{ t('forum.reviewingVisible', '已提交，等待审核，通过后可见。') }}</div>
              <div v-if="replyParentId" class="filter-row" style="margin-bottom: 6px">
                <span class="tag-chip active">{{ t('forum.replyingTo', '正在回复 #{n}', { n: replies.findIndex((x) => x.id === replyParentId) + 1 }) }}</span>
                <button class="btn btn-sm btn-dark" type="button" @click="replyParentId = null; replyText = ''">{{ t('common.cancel', '取消') }}</button>
              </div>
              <MarkdownEditor v-model="replyText" :rows="4" :placeholder="t('forum.replyPlaceholder', '支持 Markdown…')" />
              <div class="filter-row" style="margin-top: 10px">
                <button class="btn btn-primary" type="button" :disabled="posting || !replyText.trim()" @click="submitReply">{{ posting ? t('settings.submitting', '提交中…') : t('forum.submitReply', '发表回复') }}</button>
              </div>
            </template>
            <template v-else>
              <p class="muted">{{ t('forum.loginToReply', '登录后才能回复') }}</p>
              <RouterLink class="btn btn-outline" :to="`/login?redirect=${route.fullPath}`">{{ t('auth.toLogin', '去登录') }}</RouterLink>
            </template>
          </div>
        </div>

        <aside v-if="sideOpen" class="forum-side">
          <div class="forum-side-card">
            <h3 class="forum-side-title">{{ t('forum.author', '作者') }}</h3>
            <div class="forum-side-author">
              <span class="forum-avatar" :class="avatarClass(topic.author || t('forum.anon', '匿名'))">{{ (topic.author || t('forum.anon', '匿名'))[0] }}</span>
              <div>
                <div class="forum-side-author-name">{{ topic.author || t('forum.anon', '匿名') }}</div>
                <div v-if="authorProfile" class="muted" style="font-size: 12px">{{ t('forum.reputationN', '声望 {n}', { n: authorProfile.reputation }) }} · {{ t('forum.followersN', '粉丝 {n}', { n: authorProfile.follower_count }) }}</div>
              </div>
            </div>
            <RouterLink v-if="topic.author && !authorProfile?.is_self" class="btn btn-sm btn-outline btn-block" :to="`/user/${topic.author}`">{{ t('forum.profile', '个人主页') }}</RouterLink>
          </div>

          <div v-if="topic.demo_slug" class="forum-side-card">
            <h3 class="forum-side-title">{{ t('forum.relatedDemo', '相关 Demo') }}</h3>
            <div v-if="demoCardLoading" class="muted">{{ t('common.loading', '加载中…') }}</div>
            <RouterLink v-else-if="demoCard" :to="`/demo/${topic.demo_slug}`" class="forum-demo-card">
              <img class="forum-demo-cover" :src="demoCard.cover_url" :alt="demoCard.title" loading="lazy" />
              <span class="forum-demo-main">
                <span class="forum-demo-title">{{ demoCard.title }}</span>
                <span class="forum-demo-meta">{{ demoCard.author }}</span>
              </span>
            </RouterLink>
            <RouterLink v-else class="btn btn-sm btn-outline btn-block" :to="`/demo/${topic.demo_slug}`">{{ t('forum.viewDemo', '查看作品 →') }}</RouterLink>
          </div>

          <div class="forum-side-card">
            <h3 class="forum-side-title">{{ t('forum.hotTopics', '热门话题') }}</h3>
            <div class="forum-side-list">
              <RouterLink v-for="t3 in hotTopics.slice(0, 5)" :key="t3.id" class="forum-side-item" :to="`/forum/topic/${t3.id}`">
                <span class="forum-side-item-title">{{ t3.title }}</span>
                <span class="forum-stat">{{ t3.reply_count }}</span>
              </RouterLink>
              <div v-if="!hotTopics.length" class="muted">{{ t('forum.none', '暂无') }}</div>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </section>
  </div>
</template>
