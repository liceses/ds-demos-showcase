<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { parseDate, currentLocale } from '../utils/time'
import type { DemoSummary, User, UserProfile } from '../api/types'
import { useAuthStore } from '../stores/auth'
import { useNotificationsStore } from '../stores/notifications'
import { useQueues } from '../composables/adminQueues'
import DemoCard from '../components/DemoCard.vue'
import { t } from '../i18n'

const props = defineProps<{ username: string }>()
const auth = useAuthStore()
// M2-1 「我的」内聚页内承接（03 §10.2）：通知（未读红点镜像，铃铛同源 notifications store
// 单一口径，startPolling 幂等）/ 设置 / 工作台(admin，徽章走 adminQueues 同源) / 退出。
const notif = useNotificationsStore()
const { totalMust: adminQueueTotal } = useQueues()

const user = ref<(User & { demo_count: number }) | null>(null)
const profile = ref<UserProfile | null>(null)
const demos = ref<DemoSummary[]>([])
const loading = ref(true)
const error = ref('')

const isSelf = computed(() => !!auth.user && auth.user.username === props.username)

async function toggleFollow() {
  if (!profile.value) return
  try {
    const r = await api.toggleFollow(profile.value.id)
    profile.value.is_following = r.following
    profile.value.follower_count = r.followers_count
    profile.value.following_count = r.following_count
  } catch (e) {
    // 静默
  }
}

onMounted(async () => {
  try {
    const [u, p] = await Promise.all([
      api.getUser(props.username),
      api.getUserProfile(props.username).catch(() => null),
    ])
    user.value = u
    profile.value = p
    const res = await api.listDemos({ status: 'approved', tags: [`author:${props.username}`], page_size: 50 })
    demos.value = res.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="route-page">  <section v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('user.loading', '加载用户…') }}</section>
  <section v-else-if="error" class="empty-box">{{ error }}</section>

  <template v-else-if="user">
    <section class="page-hero">
      <span class="eyebrow">{{ t('user.eyebrow', '用户主页') }}</span>
      <h1 class="huge">{{ user.username }}</h1>
      <p class="sub">{{ user.bio || t('user.noBio', '这个人很懒，还没有写简介。') }}</p>
      <div class="filter-row" style="margin-top: 16px">
        <span class="mini-stat"><b>{{ user.demo_count }}</b> {{ t('home.demos', 'Demo') }}</span>
        <span class="mini-stat"><b>{{ profile?.reputation ?? 0 }}</b> {{ t('user.reputation', '声望') }}</span>
        <span class="mini-stat"><b>{{ profile?.topic_count ?? 0 }}</b> {{ t('user.topics', '主题') }}</span>
        <span class="mini-stat"><b>{{ profile?.reply_count ?? 0 }}</b> {{ t('user.replies', '回复') }}</span>
        <span class="mini-stat"><b>{{ profile?.follower_count ?? 0 }}</b> <RouterLink :to="`/user/${username}/followers`">{{ t('user.followers', '粉丝') }}</RouterLink></span>
        <span class="mini-stat"><b>{{ profile?.following_count ?? 0 }}</b> <RouterLink :to="`/user/${username}/following`">{{ t('user.following', '关注') }}</RouterLink></span>
        <span class="mini-stat"><b>{{ user.role }}</b> {{ t('user.role', '角色') }}</span>
        <span class="mini-stat"><b>{{ parseDate(user.created_at).toLocaleDateString(currentLocale()) }}</b> {{ t('user.joined', '加入') }}</span>
        <RouterLink v-if="isSelf" class="btn btn-sm btn-primary" to="/settings">{{ t('settings.eyebrow', '账户设置') }}</RouterLink>
        <!-- M2-1 「我的」内聚（03 §10.2）：TabBar 我的位页内承接——通知（未读红点镜像，
             notifications store 单一口径，与铃铛/TabBar 同源）/ 工作台（admin，徽章=待办合计同源 adminQueues）/ 退出 -->
        <RouterLink v-if="isSelf" class="btn btn-sm btn-outline self-notif" to="/notifications">
          {{ t('notifications.tab', '通知') }}
          <span v-if="notif.unreadCount > 0" class="self-notif-dot" aria-hidden="true"></span>
        </RouterLink>
        <RouterLink v-if="isSelf && auth.isAdmin()" class="btn btn-sm btn-outline" to="/admin">
          {{ t('app.nav.workbench', '管理工作台') }}
          <span v-if="adminQueueTotal > 0" class="self-badge">{{ adminQueueTotal }}</span>
        </RouterLink>
        <button v-if="isSelf" class="btn btn-sm btn-dark" type="button" @click="auth.logout()">{{ t('app.nav.logout', '退出') }}</button>
        <button
          v-else-if="auth.isLoggedIn() && profile"
          class="btn btn-sm btn-secondary"
          type="button"
          @click="toggleFollow"
        >{{ profile.is_following ? t('user.followingBtn', '已关注') : t('user.followBtn', '关注') }}</button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ t('user.theirDemos', 'TA 的 Demo') }}</h2>
      </div>
      <div v-if="!demos.length" class="empty-box">{{ t('user.noDemos', '还没有发布 Demo') }}</div>
      <div v-else class="waterfall">
        <div v-for="d in demos" :key="d.slug" class="waterfall-item">
          <DemoCard :demo="d" />
        </div>
      </div>
    </section>
  </template>
  </div>
</template>

<style scoped>
/* M2-1 「我的」内聚自我工具（03 §10.2）：未读红点镜像/工作台徽章——scoped，styles/ 零新增块 */
.self-notif-dot {
  width: 8px;
  height: 8px;
  background: var(--red, #ff6b6b);
  border: 2px solid var(--ink, #000);
}
.self-badge {
  min-width: 22px;
  padding: 1px 6px;
  text-align: center;
  background: var(--red, #ff6b6b);
  color: var(--on-accent, #000);
  border: 2px solid var(--ink, #000);
  font-size: 12px;
  font-weight: 900;
}
</style>
