<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { TagKeyInfo } from '../api/types'

const keys = ref<TagKeyInfo[]>([])
const loading = ref(true)
const error = ref('')

const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }

onMounted(async () => {
  try {
    keys.value = await api.listTagKeys()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">标签系统</span>
    <h1 class="huge">标签</h1>
    <p class="sub">每个标签键定义一类客观属性或自定义维度，点击标签查看关联 Demo。</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载标签…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <div v-else class="filter-row" style="align-items: stretch">
      <div v-for="k in keys" :key="k.key" class="card card-default" style="padding: 18px; width: 100%">
        <span class="eyebrow">{{ k.key }} · {{ modeLabel[k.mode] }}</span>
        <h2 style="margin: 8px 0 6px">{{ k.label }}</h2>
        <p class="muted" style="margin-bottom: 12px">{{ k.description || '暂无介绍' }}</p>
        <div class="filter-row" style="margin-bottom: 0">
          <RouterLink
            v-for="v in k.values"
            :key="v.value"
            class="tag-chip teal"
            :to="`/tag/${k.key}/${v.value}`"
          >
            {{ k.key }}:{{ v.value }}
            <span class="count">{{ v.demo_count }}</span>
          </RouterLink>
          <span v-if="!k.values.length" class="muted">还没有值</span>
        </div>
      </div>
    </div>
  </section>
</template>
