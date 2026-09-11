<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '../stores/notifications'
import { parseDate, currentLocale } from '../utils/time'
import { t } from '../i18n'
import PageHero from '../components/PageHero.vue'
import LoadMore from '../components/LoadMore.vue'

defineOptions({ name: 'NotificationsView' })

const store = useNotificationsStore()
const router = useRouter()
const filter = ref<'all' | 'unread'>('all')
const loading = ref(false)

const typeLabel: Record<string, string> = {
  forum_reply: '讨论回复',
  demo_review: '待审核',
  review_result: '审核结果',
  report_handled: '举报处理',
  forum_reaction: '赞/感谢',
}

function typeLabelText(type: string): string {
  return t('notifications.types.' + type, typeLabel[type] || type)
}

// P4：不再本地过滤（本地过滤只能筛"已加载的那一页"，第 51 条以前的未读永远看不到）。
// 切到「未读」时改发 unread_only，由服务端筛选 + 分页。
const visible = computed(() => store.list)

async function load() {
  loading.value = true
  try {
    await store.load(true, { mode: filter.value === 'unread' ? 'unread' : 'all' })
  } finally {
    loading.value = false
  }
}

watch(filter, () => {
  void load()
})

function open(n: { id: number; demo_slug: string | null; topic_id: number | null; read: boolean }) {
  if (!n.read) store.markRead(n.id)
  if (n.demo_slug) router.push(`/demo/${n.demo_slug}`)
  else if (n.topic_id) router.push(`/forum/topic/${n.topic_id}`)
}

onMounted(load)
</script>

<template>
  <div class="route-page">  <PageHero>
    <span class="eyebrow">{{ t('notifications.eyebrow', '通知') }}</span>
    <h1 class="page-title">{{ t('notifications.title', '通知中心') }}</h1>
  </PageHero>

  <section class="section" style="padding-top: 8px">
    <div class="filter-row" style="margin-bottom: 14px">
      <!-- P4：切 tab 会触发上面的 watch 重新按服务端口径取数 -->
      <button class="tab" :class="{ active: filter === 'all' }" type="button" @click="filter = 'all'">{{ t('notifications.all', '全部') }}</button>
      <button class="tab" :class="{ active: filter === 'unread' }" type="button" @click="filter = 'unread'">{{ t('notifications.unread', '未读') }}</button>
      <button class="btn btn-sm btn-outline" type="button" style="margin-left: auto" @click="store.markAllRead()">{{ t('notifications.markAll', '全部已读') }}</button>
    </div>

    <div v-if="loading && !store.list.length" class="loading-row"><span class="spinner"></span> {{ t('notifications.loading', '加载通知…') }}</div>
    <div v-else-if="!visible.length" class="empty-box">{{ t('notifications.none', '暂无通知') }}</div>

    <div v-else class="notif-list">
      <button
        v-for="n in visible"
        :key="n.id"
        class="notif-item"
        :class="{ unread: !n.read }"
        type="button"
        @click="open(n)"
      >
        <span class="notif-type">{{ typeLabelText(n.type) }}</span>
        <span class="notif-text">
          <template v-if="n.type === 'forum_reply'">{{ t('notifications.text.reply', '{actor} 回复了你的讨论', { actor: n.actor || t('notifications.someone', '有人') }) }}</template>
          <template v-else-if="n.type === 'demo_review'">{{ t('notifications.text.demoReview', '有新的 Demo 待审核') }}</template>
          <template v-else-if="n.type === 'review_result'">{{ t('notifications.text.reviewResult', '你的 Demo 审核结果已更新') }}</template>
          <template v-else-if="n.type === 'report_handled'">{{ t('notifications.text.report', '你的举报已处理') }}</template>
          <template v-else-if="n.type === 'forum_reaction'">{{ t('notifications.text.reaction', '{actor} 赞/感谢了你的内容', { actor: n.actor || t('notifications.someone', '有人') }) }}</template>
          <template v-else>{{ t('notifications.text.other', '新通知') }}</template>
        </span>
        <span class="notif-time">{{ parseDate(n.created_at).toLocaleString(currentLocale()) }}</span>
      </button>
    </div>

    <!-- P4：翻到底不再"就这些了" —— 该接口返回裸数组（无 total），所以用显式 hasMore：
         全部口径按「满页 ⇒ 可能还有」、未读口径按服务端 unread_count。 -->
    <LoadMore
      v-if="visible.length"
      :shown="store.list.length"
      :total="store.list.length"
      :has-more="store.hasMore"
      :loading="store.loadingMore"
      @more="store.loadMore()"
    />
  </section>
  </div>
</template>
