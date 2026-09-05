<script setup lang="ts">
defineOptions({ name: 'LeaderboardView' })
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import type { DemoSummary, UserLeaderboardItem } from '../api/types'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import PaginationBar from '../components/PaginationBar.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { useListPage } from '../composables/useListPage'
import { t } from '../i18n'

// —— 双榜 + URL 即状态（照 AdminView/DemosView 惯例）：?tab=works|users&sort=…&range=all|week|month
// 同路径只改 query 不触发重挂（App.vue pageKey 用 path），所以自己 watch query 同步。
const WORK_SORTS = ['avg', 'god', 'ghost', 'net', 'count', 'heat'] as const
const USER_SORTS = ['reputation', 'likes', 'thanks', 'topics', 'replies', 'demos', 'followers'] as const
type WorkSort = (typeof WORK_SORTS)[number]
type UserSort = (typeof USER_SORTS)[number]
type Tab = 'works' | 'users'
type Range = 'all' | 'week' | 'month'

const route = useRoute()
const router = useRouter()

function parseTab(v: unknown): Tab {
  return v === 'users' ? 'users' : 'works'
}
function parseWorkSort(v: unknown): WorkSort {
  return (WORK_SORTS as readonly string[]).includes(String(v)) ? (v as WorkSort) : 'avg'
}
function parseUserSort(v: unknown): UserSort {
  return (USER_SORTS as readonly string[]).includes(String(v)) ? (v as UserSort) : 'reputation'
}
function parseRange(v: unknown): Range {
  return v === 'week' || v === 'month' ? (v as Range) : 'all'
}

const tab = ref<Tab>(parseTab(route.query.tab))
const workSort = ref<WorkSort>(parseWorkSort(route.query.sort))
const userSort = ref<UserSort>(parseUserSort(route.query.sort))
const range = ref<Range>(parseRange(route.query.range))

// 榜单数据归属门卫：切榜 loading 期间旧榜数据不渲染（union 列表跨榜复用会串形）
const loadedTab = ref<Tab>(tab.value)

const { items, total, page, pageSize, loading, error, load, apply } = useListPage<DemoSummary | UserLeaderboardItem>(
  async ({ page, page_size }) => {
    loadedTab.value = tab.value
    if (tab.value === 'users') {
      const r = await api.userLeaderboard(userSort.value, page, page_size)
      return { items: r.items, total: r.total }
    }
    const r = await api.getLeaderboard(workSort.value, page, page_size, range.value)
    return { items: r.items, total: r.total }
  },
  20,
)

function writeQuery(next: { tab?: Tab; sort?: string; range?: Range }) {
  const query: Record<string, string> = {}
  if (next.tab && next.tab !== 'works') query.tab = next.tab
  if (next.sort) query.sort = next.sort
  if (next.range && next.range !== 'all') query.range = next.range
  void router.replace({ query })
}

function switchTab(nt: Tab) {
  if (tab.value === nt) return
  tab.value = nt
  // 两榜 sort 集合不同：切 tab 回各自默认（URL 里的 sort 不跨榜复用，避免 422）
  const sortDefault = nt === 'users' ? 'reputation' : 'avg'
  if (nt === 'users') userSort.value = 'reputation'
  else workSort.value = 'avg'
  void apply()
  writeQuery({ tab: nt, sort: sortDefault, range: range.value })
}

function changeWorkSort(s: WorkSort) {
  if (tab.value === 'works' && workSort.value === s) return
  workSort.value = s
  tab.value = 'works'
  void apply()
  writeQuery({ tab: 'works', sort: s, range: range.value })
}

function changeUserSort(s: UserSort) {
  if (tab.value === 'users' && userSort.value === s) return
  userSort.value = s
  tab.value = 'users'
  void apply()
  writeQuery({ tab: 'users', sort: s, range: range.value })
}

function changeRange(r: Range) {
  if (range.value === r) return
  range.value = r
  void apply()
  writeQuery({ tab: 'works', sort: workSort.value, range: r })
}

// 外部导航（后退/前进/外链）同步本地状态；refs 无变化则不重拉
watch(
  () => route.query,
  (q) => {
    const nt = parseTab(q.tab)
    const nws = parseWorkSort(q.sort)
    const nus = parseUserSort(q.sort)
    const nr = parseRange(q.range)
    const changed = nt !== tab.value || nr !== range.value || (nt === 'works' ? nws !== workSort.value : nus !== userSort.value)
    tab.value = nt
    workSort.value = nws
    userSort.value = nus
    range.value = nr
    if (changed) void apply()
  },
)

onMounted(load)
</script>

<template>
  <div class="route-page">  <section class="page-hero page-hero--compact">
    <span class="eyebrow">{{ t('app.nav.leaderboard', '排行榜') }}</span>
    <h1 class="page-title">{{ t('leaderboard.title', '神鬼榜') }}</h1>
    <p class="sub">{{ tab === 'users' ? t('leaderboard.usersSub', '谁在给这个社区添砖加瓦——声望、获赞与作品说话。') : t('leaderboard.sub', '用「神作 / 鬼作」两极语义给作品投票，看看大家的口碑。') }}</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="filter-row" style="margin-bottom: 8px">
      <button class="tab" :class="{ active: tab === 'works' }" type="button" @click="switchTab('works')">
        {{ t('leaderboard.tab.works', '作品神鬼榜') }}
      </button>
      <button class="tab" :class="{ active: tab === 'users' }" type="button" @click="switchTab('users')">
        {{ t('leaderboard.tab.users', '用户声望榜') }}
      </button>
    </div>

    <!-- 时间窗：作品榜后端已支持（/leaderboard?range=…）；声望榜实测不支持（未知参数被静默忽略），
         禁用 + 「即将支持」，不做假开关（M0-1）。 -->
    <div class="filter-row" style="margin-bottom: 8px">
      <button
        v-for="r in (['week', 'month', 'all'] as const)"
        :key="r"
        class="tag-chip"
        :class="{ active: tab === 'works' && range === r }"
        type="button"
        :disabled="tab === 'users'"
        @click="changeRange(r)"
      >
        {{ t('leaderboard.range.' + r, r === 'week' ? '本周' : r === 'month' ? '本月' : '总榜') }}
      </button>
      <span v-if="tab === 'users'" class="muted">{{ t('leaderboard.rangeSoon', '时间窗即将支持（当前仅总榜）') }}</span>
    </div>

    <div v-if="tab === 'works'" class="filter-row" style="margin-bottom: 8px">
      <button
        v-for="s in WORK_SORTS"
        :key="s"
        class="tab"
        :class="{ active: workSort === s }"
        type="button"
        @click="changeWorkSort(s)"
      >
        {{ t('leaderboard.sorts.' + s, { avg: '平均分', god: '神作榜', ghost: '鬼作榜', net: '净口碑', count: '评分人数', heat: '综合热度' }[s]) }}
      </button>
    </div>

    <LoadingRow
      v-if="loading && loadedTab !== tab"
      :text="tab === 'users' ? t('leaderboard.usersLoading', '加载声望榜…') : t('leaderboard.loading', '加载榜单…')"
    />
    <template v-else>
      <div v-if="error" class="notice notice-error">{{ error }}</div>
      <EmptyBox
        v-else-if="!items.length"
        :text="tab === 'users' ? t('leaderboard.usersEmpty', '还没有上榜用户') : t('leaderboard.empty', '暂无上榜作品')"
      />

      <!-- 作品神鬼榜 -->
      <MasonryGrid v-else-if="tab === 'works'" :items="items" :item-key="(d: unknown) => (d as DemoSummary).slug">
        <template #default="{ item }">
          <DemoCard :demo="item as DemoSummary" />
        </template>
      </MasonryGrid>

      <!-- 用户声望榜：列头即排序（7 维度与后端 sort 枚举一一对应） -->
      <template v-else>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>#</th>
                <th>{{ t('leaderboard.col.user', '用户') }}</th>
                <th v-for="s in USER_SORTS" :key="s">
                  <button class="tab" :class="{ active: userSort === s }" type="button" @click="changeUserSort(s)">
                    {{ t('leaderboard.col.' + s, { reputation: '声望', likes: '获赞', thanks: '感谢', topics: '主题', replies: '回复', demos: '作品', followers: '粉丝' }[s]) }}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(u, i) in (items as UserLeaderboardItem[])" :key="u.id">
                <td class="mono">{{ (page - 1) * pageSize + i + 1 }}</td>
                <td>
                  <RouterLink :to="`/user/${u.username}`" style="font-weight: 900">{{ u.username }}</RouterLink>
                  <span v-if="u.bio" class="muted" style="margin-left: 6px; font-size: 12px">{{ u.bio }}</span>
                </td>
                <td class="mono">{{ u.reputation }}</td>
                <td class="mono">{{ u.received_likes }}</td>
                <td class="mono">{{ u.received_thanks }}</td>
                <td class="mono">{{ u.topic_count }}</td>
                <td class="mono">{{ u.reply_count }}</td>
                <td class="mono">{{ u.demo_count }}</td>
                <td class="mono">{{ u.follower_count }}</td>
              </tr>
              <tr v-if="!(items as UserLeaderboardItem[]).length">
                <td colspan="9" style="text-align: center">{{ t('leaderboard.usersEmpty', '还没有上榜用户') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted" style="margin-top: 10px">
          {{ t('leaderboard.howRep', '声望怎么算？') }}
          <RouterLink to="/about#reputation">{{ t('leaderboard.howRepLink', '看规则 →') }}</RouterLink>
        </p>
      </template>

      <PaginationBar v-if="items.length" :page="page" :total="total" :page-size="pageSize" @change="(p) => { page = p; load() }" />
    </template>
  </section>
  </div>
</template>
