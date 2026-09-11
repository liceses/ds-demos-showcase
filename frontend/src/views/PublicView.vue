<script setup lang="ts">
import { onMounted } from 'vue'
import { api } from '../api'
import DemoCard from '../components/DemoCard.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import LoadMore from '../components/LoadMore.vue'
import { t } from '../i18n'
import PageHero from '../components/PageHero.vue'
import { useLoadMore } from '../composables/useLoadMore'
import type { DemoSummary } from '../api/types'

// P2-d：原实现只发一次 page_size=50 —— 第 51 件起身后上传的作品**静默消失**，
// 页面上既没有"还有更多"也没有"已到底"。现在走统一的累积加载 + <LoadMore>。
const { items: demos, total, loading, error, loadFirst, loadMore } = useLoadMore<DemoSummary>(
  (params) => api.listDemos({ status: 'approved', author: 'public', ...params }),
  24,
)

onMounted(() => {
  void loadFirst()
})
</script>

<template>
  <div class="route-page">  <PageHero>
    <span class="eyebrow">{{ t('public.eyebrow', '公开用户') }}</span>
    <h1 class="page-title">{{ t('public.eyebrow', '公开用户') }}</h1>
    <p class="sub">{{ t('public.sub', '未注册用户（含 AI agent）上传的全部 Demo，统一展示在这里。') }}</p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="mini-stat"><b>{{ total }}</b> {{ t('home.demos', 'Demo') }}</span>
    </div>
  </PageHero>

  <section class="section">
    <LoadingRow v-if="loading && !demos.length" :text="t('demo.loading', '加载 Demo…')" />
    <EmptyBox v-else-if="error" kind="error" :text="error" @retry="loadFirst" />
    <EmptyBox v-else-if="!demos.length" :text="t('public.empty', '还没有公开用户上传的 Demo')" />
    <template v-else>
      <div class="waterfall">
        <div v-for="d in demos" :key="d.slug" class="waterfall-item">
          <DemoCard :demo="d" />
        </div>
      </div>
      <LoadMore :shown="demos.length" :total="total" :loading="loading" @more="loadMore" />
    </template>
  </section>
  </div>
</template>
