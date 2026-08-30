<script setup lang="ts">
defineOptions({ name: 'LeaderboardView' })
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary } from '../api/types'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import PaginationBar from '../components/PaginationBar.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { useListPage } from '../composables/useListPage'
import { t } from '../i18n'

const sorts = [
  { key: 'avg', label: '平均分' },
  { key: 'god', label: '神作榜' },
  { key: 'ghost', label: '鬼作榜' },
  { key: 'net', label: '净口碑' },
  { key: 'count', label: '评分人数' },
  { key: 'heat', label: '综合热度' },
] as const

const sort = ref<'avg' | 'god' | 'ghost' | 'net' | 'count' | 'heat'>('avg')

const { items, total, page, pageSize, loading, error, load } = useListPage<DemoSummary>(
  async ({ page, page_size }) => {
    const res = await api.getLeaderboard(sort.value, page, page_size)
    return { items: res.items, total: res.total }
  },
  20,
)

function changeSort(s: typeof sort.value) {
  if (sort.value === s) return
  sort.value = s
  page.value = 1
  load()
}

onMounted(load)
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">{{ t('app.nav.leaderboard', '排行榜') }}</span>
    <h1 class="huge">{{ t('leaderboard.title', '神鬼榜') }}</h1>
    <p class="sub">{{ t('leaderboard.sub', '用「神作 / 鬼作」两极语义给作品投票，看看大家的口碑。') }}</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="filter-row" style="margin-bottom: 8px">
      <button v-for="s in sorts" :key="s.key" class="tab" :class="{ active: sort === s.key }" type="button" @click="changeSort(s.key)">
        {{ t('leaderboard.sorts.' + s.key, s.label) }}
      </button>
    </div>
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading && !items.length" :text="t('leaderboard.loading', '加载榜单…')" />
    <EmptyBox v-else-if="!items.length" :text="t('leaderboard.empty', '暂无上榜作品')" />

    <MasonryGrid v-else :items="items" :item-key="(d: unknown) => (d as DemoSummary).slug">
      <template #default="{ item }">
        <DemoCard :demo="item as DemoSummary" />
      </template>
    </MasonryGrid>

    <PaginationBar v-if="items.length" :page="page" :total="total" :page-size="pageSize" @change="(p) => { page = p; load() }" />
  </section>
</template>
