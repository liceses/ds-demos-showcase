<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { Tag } from '../api/types'

const tags = ref<Tag[]>([])
const loading = ref(true)
const error = ref('')

const groups = ref<{ key: string; items: Tag[] }[]>([])

onMounted(async () => {
  try {
    tags.value = await api.listTags()
    const map = new Map<string, Tag[]>()
    for (const t of tags.value) {
      const list = map.get(t.key) || []
      list.push(t)
      map.set(t.key, list)
    }
    groups.value = [...map.entries()].map(([key, items]) => ({ key, items }))
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
    <p class="sub">键值对标签，支持层级关系。点击标签查看关联 Demo。</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载标签…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <div v-else class="filter-row">
      <div v-for="g in groups" :key="g.key" class="card card-default" style="padding: 18px; width: 100%">
        <h2 style="margin-bottom: 12px">{{ g.key }}</h2>
        <div class="filter-row" style="margin-bottom: 0">
          <RouterLink
            v-for="t in g.items"
            :key="t.key + ':' + t.value"
            class="tag-chip"
            :class="t.parent_id ? '' : 'teal'"
            :to="`/tag/${t.key}/${t.value}`"
          >
            {{ t.key }}:{{ t.value }}
            <span class="count">{{ t.demo_count }}</span>
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
