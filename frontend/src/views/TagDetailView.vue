<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary, Tag } from '../api/types'
import DemoCard from '../components/DemoCard.vue'

const props = defineProps<{ k: string; v: string }>()

const tag = ref<Tag | null>(null)
const demos = ref<DemoSummary[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    tag.value = await api.getTag(props.k, props.v)
    const res = await api.listDemos({ status: 'approved', tags: [`${props.k}:${props.v}`], page_size: 50 })
    demos.value = res.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section v-if="loading" class="loading-row"><span class="spinner"></span> 加载标签…</section>
  <section v-else-if="error" class="empty-box">{{ error }}</section>

  <template v-else-if="tag">
    <div class="breadcrumb">
      <RouterLink to="/">首页</RouterLink>
      <span class="sep">/</span>
      <RouterLink to="/tags">标签</RouterLink>
      <template v-if="tag.parent">
        <span class="sep">/</span>
        <RouterLink :to="`/tag/${tag.parent.key}/${tag.parent.value}`">{{ tag.parent.key }}:{{ tag.parent.value }}</RouterLink>
      </template>
    </div>

    <section class="page-hero" style="padding-bottom: 20px">
      <span class="eyebrow">标签详情</span>
      <h1 class="huge">{{ tag.key }}:{{ tag.value }}</h1>
      <p class="sub">{{ tag.description || '暂无介绍' }}</p>
      <div class="filter-row" style="margin-top: 16px">
        <span class="mini-stat"><b>{{ tag.demo_count }}</b> Demo</span>
        <span class="mini-stat"><b>{{ tag.child_count }}</b> 子标签</span>
      </div>
    </section>

    <section v-if="tag.children?.length" class="section" style="padding-top: 8px">
      <div class="section-head">
        <h2 class="section-title">子标签</h2>
      </div>
      <div class="filter-row">
        <RouterLink
          v-for="c in tag.children"
          :key="c.key + ':' + c.value"
          class="tag-chip teal"
          :to="`/tag/${c.key}/${c.value}`"
        >
          {{ c.key }}:{{ c.value }}
          <span class="count">{{ c.demo_count }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">关联 Demo</h2>
        <span class="mini-stat"><b>{{ demos.length }}</b> 个</span>
      </div>
      <div v-if="!demos.length" class="empty-box">该标签下暂无 Demo</div>
      <div v-else class="waterfall">
        <div v-for="d in demos" :key="d.slug" class="waterfall-item">
          <DemoCard :demo="d" />
        </div>
      </div>
    </section>
  </template>
</template>
