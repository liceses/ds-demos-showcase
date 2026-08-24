<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { TagKeyInfo } from '../api/types'

const keys = ref<TagKeyInfo[]>([])
const loading = ref(true)
const error = ref('')
const modeFilter = ref<'all' | 'fixed' | 'open' | 'int'>('all')

const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }

const sortedKeys = computed(() =>
  [...keys.value]
    .filter((k) => modeFilter.value === 'all' || k.mode === modeFilter.value)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.key.localeCompare(b.key)),
)

const keyCount = computed(() => keys.value.length)
const valueCount = computed(() => keys.value.reduce((n, k) => n + k.values.length, 0))

function maxCount(k: TagKeyInfo) {
  return Math.max(1, ...k.values.map((v) => v.demo_count))
}

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
    <p class="sub">
      每个标签键定义一类属性：固定值是客观事实，开放值由用户创造，数字值是量化参数。
    </p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="tag-stat"><b>{{ keyCount }}</b> 标签键</span>
      <span class="tag-stat"><b>{{ valueCount }}</b> 标签值</span>
    </div>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载标签…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <template v-else>
      <div class="filter-row">
        <button
          v-for="f in ['all', 'fixed', 'open', 'int']"
          :key="f"
          class="tag-chip"
          :class="['mode-' + f, { active: modeFilter === f }]"
          type="button"
          @click="modeFilter = f as typeof modeFilter"
        >
          {{ f === 'all' ? '全部' : modeLabel[f] }}
        </button>
      </div>

      <div v-if="!sortedKeys.length" class="empty-box">该类型下还没有标签键</div>

      <div v-else class="filter-row" style="align-items: stretch; gap: 18px">
        <div
          v-for="k in sortedKeys"
          :key="k.key"
          class="card card-default tag-key-card"
          :class="'mode-' + k.mode"
          style="padding: 18px; width: 100%"
        >
          <div class="section-head" style="margin-bottom: 8px">
            <div>
              <span class="eyebrow">{{ k.key }}</span>
              <h2 style="margin: 8px 0 4px">{{ k.label || k.key }}</h2>
            </div>
            <span class="mode-badge" :class="'mode-badge-' + k.mode">{{ modeLabel[k.mode] }}</span>
          </div>
          <p class="muted" style="margin-bottom: 12px">{{ k.description || '暂无介绍' }}</p>
          <div v-if="k.mode === 'int' && k.min != null && k.max != null" class="muted" style="font-size: 12px; margin-bottom: 8px">
            值域：{{ k.min }} ~ {{ k.max }}
          </div>
          <div v-if="k.mode === 'int' && k.values.length" class="int-dist" style="margin-bottom: 12px">
            <div v-for="v in k.values" :key="v.value" class="int-dist-row">
              <span class="int-dist-label">{{ v.value }}</span>
              <div class="int-dist-track"><div class="int-dist-fill" :style="{ width: (v.demo_count / maxCount(k)) * 100 + '%' }"></div></div>
              <span class="int-dist-count">{{ v.demo_count }}</span>
            </div>
          </div>
          <div v-else-if="k.values.length" class="int-dist" style="margin-bottom: 12px">
            <div v-for="v in k.values" :key="v.value" class="int-dist-row">
              <span class="int-dist-label">{{ v.value }}</span>
              <div class="int-dist-track"><div class="int-dist-fill" :class="'mode-' + k.mode" :style="{ width: (v.demo_count / maxCount(k)) * 100 + '%' }"></div></div>
              <span class="int-dist-count">{{ v.demo_count }}</span>
            </div>
          </div>
          <div class="filter-row" style="margin-bottom: 0">
            <RouterLink
              v-for="v in k.values"
              :key="v.value"
              class="tag-chip"
              :class="'mode-' + k.mode"
              :to="`/tag/${k.key}/${v.value}`"
            >
              {{ k.key }}:{{ v.value }}
              <span class="count">{{ v.demo_count }}</span>
            </RouterLink>
            <span v-if="!k.values.length" class="muted">还没有值</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
