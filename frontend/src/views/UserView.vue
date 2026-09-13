<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { parseDate, currentLocale } from '../utils/time'
import type { DemoSummary, User, UserProfile } from '../api/types'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { errorMessage } from '../utils/error'
import { useNotificationsStore } from '../stores/notifications'
import { useQueues } from '../composables/adminQueues'
import { openSearch } from '../composables/useSearch'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import LoadMore from '../components/LoadMore.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { t } from '../i18n'
import PageHero from '../components/PageHero.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { useLocalHistory } from '../composables/useLocalHistory'
import { relativeTime } from '../utils/relTime'
import type { CollectionOut } from '../api/types'
import CoverImg from '../components/CoverImg.vue'

const props = defineProps<{ username: string }>()
const auth = useAuthStore()
const ui = useUiStore()
// M2-1 「我的」内聚页内承接（03 §10.2）：通知（未读红点镜像，铃铛同源 notifications store
// 单一口径，startPolling 幂等）/ 设置 / 工作台(admin，徽章走 adminQueues 同源) / 退出。
const notif = useNotificationsStore()
const { totalMust: adminQueueTotal } = useQueues()

const user = ref<(User & { demo_count: number }) | null>(null)
const profile = ref<UserProfile | null>(null)
// P2-d：原实现只发一次 page_size=50 —— 第 51 件起静默消失。改走统一累积加载。
const {
  items: demos,
  total: demoTotal,
  loading: demoLoading,
  loadFirst: loadDemos,
  loadMore: loadMoreDemos,
} = useLoadMore<DemoSummary>(
  (params) => api.listDemos({ status: 'approved', tags: [`author:${props.username}`], ...params }),
  24,
)
const loading = ref(true)
const error = ref('')

const isSelf = computed(() => !!auth.user && auth.user.username === props.username)

// ── 收藏夹 / 最近浏览（本轮） ──
// 两条刻意的规则：
//   ①「最近浏览」**只在本人页**显示 —— 否则等于把访客自己的本机记录摆在别人主页上；
//   ② 他人页没有公开收藏夹时**整块不渲染** —— 不在每个访客面前摆一个空盒子。
const myCollections = ref<CollectionOut[]>([])
const collectionsLoading = ref(false)
const local = useLocalHistory()
const recentRows = computed(() => local.items.value.slice(0, 6))
const showCollections = computed(() => collectionsLoading.value || myCollections.value.length > 0)

async function loadCollections() {
  collectionsLoading.value = true
  try {
    myCollections.value = isSelf.value
      ? ((await api.listMyCollections()) ?? []).slice(0, 3)
      : ((await api.listPublicCollections(props.username)) ?? []).slice(0, 3)
  } catch {
    myCollections.value = []
  } finally {
    collectionsLoading.value = false
  }
}
onMounted(loadCollections)
watch(isSelf, loadCollections)

async function toggleFollow() {
  if (!profile.value) return
  try {
    const r = await api.toggleFollow(profile.value.id)
    profile.value.is_following = r.following
    profile.value.follower_count = r.followers_count
    profile.value.following_count = r.following_count
  } catch (e) {
    // P4：原先是 catch { // 静默 } —— 关注失败时按钮点了没反应、状态也不回滚，
    // 用户只会以为"点了没用"。改为报错（不擅自改本地状态：服务端没成功就不该显示已关注）。
    ui.toast(errorMessage(e), 'error')
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
    await loadDemos()
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
    <PageHero>
      <span class="eyebrow">{{ t('user.eyebrow', '用户主页') }}</span>
      <h1 class="page-title">{{ user.username }}</h1>
      <p class="sub">{{ user.bio || t('user.noBio', '这个人很懒，还没有写简介。') }}</p>
      <div class="filter-row" style="margin-top: var(--sp-16)">
        <span class="mini-stat"><b>{{ user.demo_count }}</b> {{ t('home.demos', 'Demo') }}</span>
        <span class="mini-stat"><b>{{ profile?.reputation ?? 0 }}</b> {{ t('user.reputation', '声望') }}</span>
        <span class="mini-stat"><b>{{ profile?.topic_count ?? 0 }}</b> {{ t('user.topics', '主题') }}</span>
        <span class="mini-stat"><b>{{ profile?.reply_count ?? 0 }}</b> {{ t('user.replies', '回复') }}</span>
        <span class="mini-stat"><b>{{ profile?.follower_count ?? 0 }}</b> <RouterLink :to="`/user/${username}/followers`">{{ t('user.followers', '粉丝') }}</RouterLink></span>
        <span class="mini-stat"><b>{{ profile?.following_count ?? 0 }}</b> <RouterLink :to="`/user/${username}/following`">{{ t('user.following', '关注') }}</RouterLink></span>
        <span class="mini-stat"><b>{{ user.role }}</b> {{ t('user.role', '角色') }}</span>
        <span class="mini-stat"><b>{{ parseDate(user.created_at).toLocaleDateString(currentLocale()) }}</b> {{ t('user.joined', '加入') }}</span>
        <RouterLink v-if="isSelf" class="btn btn-sm btn-primary" to="/settings">{{ t('settings.eyebrow', '账户设置') }}</RouterLink>
        <!-- M2-3 移动搜索入口（任务书二选一，记录：TabBar 无搜索键 + 顶栏 ⌕ 桌面限定 → 移动从「我的」内聚页进；
             覆盖层挂在 App 根，此处 openSearch() 全路由可达） -->
        <button v-if="isSelf" class="btn btn-sm btn-outline" type="button" @click="openSearch()">{{ t('search.open', '搜索') }}</button>
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
    </PageHero>

    <!-- 收藏夹（本人 = 我的夹 / 他人 = TA 的公开夹；空则整块不渲染） -->
    <section v-if="showCollections" class="section">
      <div class="section-head">
        <h2 class="section-title">{{ isSelf ? t('fav.title', '收藏夹') : t('fav.publicOf', '公开收藏夹') }}</h2>
        <RouterLink class="btn btn-sm btn-outline" :to="isSelf ? '/me/collections' : `/user/${username}/collections`">
          {{ t('fav.viewAll', '查看全部 →') }}
        </RouterLink>
      </div>
      <LoadingRow v-if="collectionsLoading" :text="t('fav.loading', '加载收藏夹…')" />
      <ul v-else class="me-cards">
        <li v-for="c in myCollections" :key="c.id">
          <RouterLink class="card card-default me-card" :to="c.visibility === 'public' ? `/collections/${c.id}` : `/me/collections/${c.id}`">
            <span class="me-covers" aria-hidden="true">
              <CoverImg v-for="(u, i) in c.cover_urls" :key="i" class="me-cover" :src="u" tier="thumb" alt="" />
              <span v-if="!c.cover_urls.length" class="me-cover me-cover--empty">—</span>
            </span>
            <span class="me-card-title">{{ c.title }}</span>
            <span class="me-row-meta">
              <span class="mono">{{ c.item_count }} {{ t('fav.items', '件') }}</span>
              <span class="me-dot" aria-hidden="true">·</span>
              <span class="mono me-vis" :class="c.visibility === 'public' ? 'me-vis--public' : ''">
                {{ c.visibility === 'public' ? t('fav.public', '公开') : t('fav.private', '私密') }}
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- 最近浏览：**仅本人**（读本机 localStorage，不发请求） -->
    <section v-if="isSelf" class="section">
      <div class="section-head">
        <h2 class="section-title">{{ t('hist.recent', '最近浏览') }}</h2>
        <span class="mono muted">{{ t('hist.localOnly', '仅本机可见') }}</span>
        <RouterLink class="btn btn-sm btn-outline" to="/me/history">{{ t('fav.viewAll', '查看全部 →') }}</RouterLink>
      </div>
      <EmptyBox v-if="!recentRows.length" :text="t('hist.empty', '还没有浏览记录')" />
      <ul v-else class="me-list">
        <li v-for="r in recentRows" :key="r.slug" class="me-row me-row--item">
          <RouterLink class="me-thumb" :to="`/demo/${r.slug}`">
            <CoverImg v-if="r.cover_url" :src="r.cover_url" tier="thumb" alt="" />
            <span v-else aria-hidden="true">{{ r.title[0] }}</span>
          </RouterLink>
          <div class="me-row-main">
            <RouterLink class="me-row-title" :to="`/demo/${r.slug}`">{{ r.title }}</RouterLink>
            <p class="me-row-meta">
              <span v-for="m in r.model_labels.slice(0, 2)" :key="m" class="tag-chip">{{ m }}</span>
              <span class="muted mono">{{ relativeTime(new Date(r.ts).toISOString()) }}</span>
            </p>
          </div>
        </li>
      </ul>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ t('user.theirDemos', 'TA 的 Demo') }}</h2>
      </div>
      <div v-if="!demos.length" class="empty-box">{{ t('user.noDemos', '还没有发布 Demo') }}</div>
      <template v-else>
        <MasonryGrid :items="demos" :item-key="(d: unknown) => (d as DemoSummary).slug">
          <template #default="{ item }">
            <DemoCard :demo="item as DemoSummary" />
          </template>
        </MasonryGrid>
        <LoadMore :shown="demos.length" :total="demoTotal" :loading="demoLoading" @more="loadMoreDemos" />
      </template>
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
  padding: 1px var(--sp-6);
  text-align: center;
  background: var(--red, #ff6b6b);
  color: var(--on-accent, #000);
  border: 2px solid var(--ink, #000);
  font-size: var(--fs-12);
  font-weight: 900;
}
</style>
