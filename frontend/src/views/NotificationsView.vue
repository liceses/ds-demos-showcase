<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '../stores/notifications'
import { parseDate, currentLocale } from '../utils/time'
import { t } from '../i18n'

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

const visible = computed(() => (filter.value === 'unread' ? store.list.filter((n) => !n.read) : store.list))

async function load() {
  loading.value = true
  try {
    await store.load(true)
  } finally {
    loading.value = false
  }
}

function open(n: { id: number; demo_slug: string | null; topic_id: number | null; read: boolean }) {
  if (!n.read) store.markRead(n.id)
  if (n.demo_slug) router.push(`/demo/${n.demo_slug}`)
  else if (n.topic_id) router.push(`/forum/topic/${n.topic_id}`)
}

onMounted(load)
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">{{ t('notifications.eyebrow', '通知') }}</span>
    <h1 class="huge">{{ t('notifications.title', '通知中心') }}</h1>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="filter-row" style="margin-bottom: 14px">
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
  </section>
</template>
