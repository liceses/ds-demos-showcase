<script setup lang="ts">
defineOptions({ name: 'FollowListView' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { UserPublic } from '../api/types'
import { useAuthStore } from '../stores/auth'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import PaginationBar from '../components/PaginationBar.vue'
import { useLocalPagination } from '../composables/useLocalPagination'
import { t } from '../i18n'

// 粉丝/关注名单页（M0-2）：同一实现按 mode 复用，路由用 props 函数注入。
// 名单接口后端不分页（返回全量 UserPublic），前端用 useLocalPagination 兜底切页。
const props = defineProps<{ username: string; mode: 'followers' | 'following' }>()
const auth = useAuthStore()

const list = ref<UserPublic[]>([])
const loading = ref(true)
const error = ref('')
const pending = ref<Record<number, boolean>>({})
// viewer 已关注集合：关注按钮初始态 + 「互相关注」标记的统一口径（1 次请求，替代逐行 profile 轮询）
const viewerFollowingIds = ref<Set<number>>(new Set())

const isSelfList = computed(() => auth.user?.username === props.username)

function isFollowing(u: UserPublic): boolean {
  return viewerFollowingIds.value.has(u.id)
}
/** 互相关注：仅在看自己的 followers 页时可见——u 关注我=本页成员资格；我关注 u=集合命中 */
function mutual(u: UserPublic): boolean {
  return isSelfList.value && props.mode === 'followers' && isFollowing(u)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    list.value = props.mode === 'followers' ? await api.listFollowers(props.username) : await api.listFollowing(props.username)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function toggle(u: UserPublic) {
  if (pending.value[u.id]) return
  pending.value[u.id] = true
  try {
    const r = await api.toggleFollow(u.id)
    // 本地翻转集合：按钮态与互关标记即时更新，不重拉名单
    const next = new Set(viewerFollowingIds.value)
    if (r.following) next.add(u.id)
    else next.delete(u.id)
    viewerFollowingIds.value = next
  } catch {
    /* 静默（同 UserView.toggleFollow 口径） */
  } finally {
    pending.value[u.id] = false
  }
}

const { page, total, pages, paged, setPage, pageSize } = useLocalPagination<UserPublic>(() => list.value, 20)

onMounted(async () => {
  await load()
  if (auth.isLoggedIn() && auth.user) {
    try {
      const fl = await api.listFollowing(auth.user.username)
      viewerFollowingIds.value = new Set(fl.map((u) => u.id))
    } catch {
      /* 集合拉不到时按钮退化为「关注」首态，不影响浏览 */
    }
  }
})
</script>

<template>
  <div class="route-page">  <section class="page-hero">
    <span class="eyebrow">{{ t('user.eyebrow', '用户主页') }}</span>
    <h1 class="huge">{{ mode === 'followers' ? t('user.followers', '粉丝') : t('user.following', '关注') }}</h1>
    <p class="sub">
      {{ mode === 'followers' ? t('user.fl.subFollowers', '关注 {u} 的人', { u: username }) : t('user.fl.subFollowing', '{u} 正在关注的人', { u: username }) }}
      ·
      <RouterLink :to="`/user/${username}`" style="font-weight: 900">{{ username }}</RouterLink>
    </p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('user.fl.loading', '加载名单…')" />
    <EmptyBox
      v-else-if="!list.length"
      :text="mode === 'followers' ? t('user.fl.emptyFollowers', '还没有粉丝') : t('user.fl.emptyFollowing', '还没有关注任何人')"
    />
    <div v-else class="fl-list">
      <div v-for="u in paged" :key="u.id" class="fl-row">
        <span class="fl-avatar" aria-hidden="true">{{ u.username.slice(0, 1).toUpperCase() }}</span>
        <div class="fl-main">
          <RouterLink :to="`/user/${u.username}`" class="fl-name">{{ u.username }}</RouterLink>
          <span v-if="mutual(u)" class="fl-mutual">{{ t('user.fl.mutual', '互相关注') }}</span>
          <span v-if="u.bio" class="muted fl-bio">{{ u.bio }}</span>
        </div>
        <span class="mini-stat mono"><b>{{ u.demo_count }}</b> {{ t('home.demos', 'Demo') }}</span>
        <button
          v-if="auth.isLoggedIn() && auth.user?.id !== u.id"
          class="btn btn-sm"
          :class="isFollowing(u) ? 'btn-outline' : 'btn-secondary'"
          type="button"
          :disabled="!!pending[u.id]"
          @click="toggle(u)"
        >
          {{ isFollowing(u) ? t('user.followingBtn', '已关注') : t('user.followBtn', '关注') }}
        </button>
      </div>
    </div>

    <PaginationBar v-if="pages > 1" :page="page" :total="total" :page-size="pageSize" @change="setPage" />
  </section>
  </div>
</template>
