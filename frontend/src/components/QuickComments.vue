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
import { t } from '../i18n'

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
      const topicNew = await api.createForumTopic({
        title: t('quick.topicTitle', '讨论：{title}', { title: demoTitle.value || props.slug }),
        content: '',
        category: 'demo',
        demo_slug: props.slug,
        tags: [],
      })
      topic.value = topicNew
      tid = topicNew.id
    }
    const r = await api.createForumReply(tid, text)
    replyText.value = ''
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
    creatingTopic.value = false
  }
}

onMounted(load)
</script>

<style scoped>
/* M1-fix-8（05 §3.2）：0 条紧凑空态——单行 flex，虚线上缘与列表节奏一致，不再用 empty-box 占高 */
.qc-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 2px;
  border-top: 2px dashed rgba(0, 0, 0, 0.18);
  font-size: 13px;
}
</style>

<template>
  <div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('quick.loading', '加载讨论…') }}</div>

    <div v-else class="quick-comments">
      <div class="quick-comment-input">
        <template v-if="auth.isLoggedIn()">
          <div v-if="pendingNotice" class="notice notice-success" style="margin-bottom: 8px">{{ t('forum.reviewingVisible', '已提交，等待审核，通过后可见。') }}</div>
          <p v-if="!topic" class="muted" style="margin: 0 0 6px">{{ t('quick.firstComment', '第一条评论将创建该作品的讨论。') }}</p>
          <div class="filter-row" style="margin: 0">
            <input
              v-model="replyText"
              class="input"
              type="text"
              :placeholder="topic ? t('quick.placeholderSend', '说点什么…（回车发送）') : t('quick.placeholder', '说点什么…（回车即发）')"
              @keyup.enter="submit"
            />
            <button class="btn btn-primary" type="button" :disabled="posting || creatingTopic || !replyText.trim()" @click="submit">{{ creatingTopic ? t('quick.creating', '创建中…') : (posting ? t('quick.sending', '发送中…') : t('quick.send', '发送')) }}</button>
          </div>
        </template>
        <template v-else>
          <p class="muted" style="margin: 0 0 8px">{{ t('forum.loginToReply', '登录后才能评论') }}</p>
          <RouterLink class="btn btn-outline" :to="`/login?redirect=${route.fullPath}`">{{ t('auth.toLogin', '去登录') }}</RouterLink>
        </template>
      </div>

      <div class="quick-comment-list">
        <div v-for="(r, i) in replies" :key="r.id" class="quick-comment">
          <div class="quick-comment-head">
            <span class="quick-comment-author">{{ r.author || t('forum.anon', '匿名') }}</span>
            <span class="quick-comment-floor">#{{ i + 1 }}</span>
            <span class="quick-comment-time">{{ timeAgo(r.created_at) }}</span>
          </div>
          <MarkdownRenderer :content="r.content" />
        </div>
        <!-- M1-fix-8（05 §3.2）：0 条紧凑空态——一行不占高，「抢首楼」直达论坛预填发帖
             （/forum/new?demo= 既有机制：自动挂 demo 分类+关联作品） -->
        <div v-if="!replies.length" class="qc-empty">
          <span class="muted">{{ t('quick.emptyCompact', '还没有评论——第一层楼还空着') }}</span>
          <RouterLink class="btn btn-sm btn-outline" :to="`/forum/new?demo=${slug}`">{{ t('quick.grabFirst', '抢首楼 →') }}</RouterLink>
        </div>
        <button
          v-if="replies.length < total"
          class="btn btn-outline btn-block"
          type="button"
          :disabled="loadingMore"
          @click="loadMore"
        >{{ loadingMore ? t('common.loading', '加载中…') : t('quick.loadMore', '加载更多') }}</button>
      </div>
    </div>
  </div>
</template>
