<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import type { TagKeyInfo } from '../api/types'

const keys = ref<TagKeyInfo[]>([])
const loading = ref(true)
const error = ref('')
const modeFilter = ref<'all' | 'fixed' | 'open' | 'int'>('all')
const activeKey = ref('')
const tagSearch = ref('')

const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }

const filteredKeys = computed(() => {
  const q = tagSearch.value.trim().toLowerCase()
  let list = [...keys.value].filter((k) => modeFilter.value === 'all' || k.mode === modeFilter.value)
  if (q) {
    list = list.filter(
      (k) =>
        k.key.toLowerCase().includes(q) ||
        (k.label || '').toLowerCase().includes(q) ||
        k.values.some((v) => v.value.toLowerCase().includes(q)),
    )
  }
  return list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.key.localeCompare(b.key))
})

const activeTagKey = computed(() => keys.value.find((k) => k.key === activeKey.value) || null)

function isValueHit(k: TagKeyInfo, value: string) {
  const q = tagSearch.value.trim().toLowerCase()
  return !!q && (k.key.toLowerCase().includes(q) || value.toLowerCase().includes(q))
}

watch(tagSearch, () => {
  if (!filteredKeys.value.length) return
  if (!filteredKeys.value.some((k) => k.key === activeKey.value)) {
    activeKey.value = filteredKeys.value[0].key
  }
})

function maxCount(k: TagKeyInfo) {
  return Math.max(1, ...k.values.map((v) => v.demo_count))
}

onMounted(async () => {
  try {
    keys.value = await api.listTagKeys()
    if (keys.value.length) activeKey.value = keys.value[0].key
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
    <p class="sub">每个标签键定义一类属性：固定值是客观事实，开放值由用户创造，数字值是量化参数。</p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="tag-stat"><b>{{ keys.length }}</b> 标签键</span>
      <span class="tag-stat"><b>{{ keys.reduce((n, k) => n + k.values.length, 0) }}</b> 标签值</span>
    </div>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载标签…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <template v-else>
      <div class="filter-row" style="margin-bottom: 14px">
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
        <div class="search-box tag-pane-search" style="flex: 1; max-width: 320px; margin-left: auto">
          <input v-model="tagSearch" class="input" type="search" placeholder="搜索标签键 / 值…" />
        </div>
      </div>

      <div class="tag-pane tag-pane-tall">
        <!-- 左：键列表 -->
        <div class="tag-pane-keys">
          <template v-for="m in (['fixed', 'open', 'int'] as const)" :key="m">
            <div v-if="filteredKeys.some((k) => k.mode === m)" class="tag-pane-group-label">{{ modeLabel[m] }}</div>
            <button
              v-for="k in filteredKeys.filter((k) => k.mode === m)"
              :key="k.key"
              class="tag-pane-key"
              :class="{ active: activeKey === k.key }"
              type="button"
              @click="activeKey = k.key"
            >
              <span class="tag-pane-key-label">{{ k.label || k.key }} <code>{{ k.key }}</code></span>
              <span class="tag-pane-key-count">{{ k.demo_count }}</span>
            </button>
          </template>
          <div v-if="!filteredKeys.length" class="muted" style="padding: 8px">无匹配标签</div>
        </div>

        <!-- 右：值面板 -->
        <div class="tag-pane-values">
          <template v-if="activeTagKey">
            <div class="tag-key-head">
              <b>{{ activeTagKey.label || activeTagKey.key }} <code>{{ activeTagKey.key }}</code></b>
              <span class="mode-badge" :class="'mode-badge-' + activeTagKey.mode">{{ modeLabel[activeTagKey.mode] }}</span>
            </div>
            <p class="muted" style="margin: 0 0 10px">{{ activeTagKey.description || '暂无介绍' }}</p>
            <div v-if="activeTagKey.mode === 'int' && activeTagKey.min != null && activeTagKey.max != null" class="muted" style="font-size: 12px; margin-bottom: 8px">
              值域：{{ activeTagKey.min }} ~ {{ activeTagKey.max }}
            </div>

            <div v-if="activeTagKey.values.length" class="tag-dist-bars" style="margin-bottom: 12px">
              <div v-for="v in activeTagKey.values" :key="v.value" class="tag-dist-bar-col" :title="`${v.value}: ${v.demo_count}`">
                <div class="tag-dist-bar-fill" :class="'mode-' + activeTagKey.mode" :style="{ height: Math.max(4, Math.round((v.demo_count / maxCount(activeTagKey)) * 36)) + 'px' }"></div>
                <span class="tag-dist-bar-label">{{ v.value }}</span>
              </div>
            </div>

            <div class="filter-row" style="margin: 0">
              <RouterLink
                v-for="v in activeTagKey.values"
                :key="v.value"
                class="tag-chip"
                :class="['mode-' + activeTagKey.mode, { 'search-hit': isValueHit(activeTagKey, v.value) }]"
                :to="`/tag/${activeTagKey.key}/${v.value}`"
              >
                {{ v.value }}<span class="count">{{ v.demo_count }}</span>
              </RouterLink>
              <span v-if="!activeTagKey.values.length" class="muted">还没有值</span>
            </div>
          </template>
          <div v-else class="muted">请选择左侧标签键</div>
        </div>
      </div>
    </template>
  </section>
</template>
