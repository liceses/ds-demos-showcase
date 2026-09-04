<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { parseDate, currentLocale } from '../utils/time'
import type { DemoSummary, User, UserProfile } from '../api/types'
import { useAuthStore } from '../stores/auth'
import DemoCard from '../components/DemoCard.vue'
import { t } from '../i18n'

const props = defineProps<{ username: string }>()
const auth = useAuthStore()

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