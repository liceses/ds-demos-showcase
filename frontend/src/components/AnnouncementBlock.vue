<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Announcement } from '../api/types'

const props = defineProps<{ title: string; items: Announcement[] }>()

const expanded = ref(false)
const visible = computed(() => (expanded.value ? props.items.slice(0, 6) : props.items.slice(0, 1)))

const annTypeMeta: Record<string, { label: string; cls: string }> = {
  manual: { label: '公告', cls: 'ann-card-manual' },
  auto: { label: '新发布', cls: 'ann-card-auto' },
  demo_update: { label: '作品更新', cls: 'ann-card-demo' },
  update: { label: '站点更新', cls: 'ann-card-update' },
}

function annCls(type: string) {
  return annTypeMeta[type]?.cls || 'ann-card-manual'
}

function annLabel(type: string) {
  return annTypeMeta[type]?.label || type || '公告'
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}
</script>

<template>
  <div class="ann-block">
    <div class="ann-block-head">
      <h3 class="ann-block-title">{{ title }}</h3>
      <button v-if="props.items.length > 1" class="btn btn-sm btn-outline ann-more" type="button" @click="expanded = !expanded">
        {{ expanded ? '收起' : `更多 ${props.items.length}` }}
      </button>
    </div>

    <div v-if="!props.items.length" class="empty-box" style="padding: 16px">暂无公告</div>

    <div v-else class="ann-block-list">
      <component
        :is="a.demo_slug ? 'RouterLink' : 'div'"
        v-for="a in visible"
        :key="a.id"
        :to="a.demo_slug ? `/demo/${a.demo_slug}` : undefined"
        class="ann-item animate-in"
        :class="annCls(a.type)"
      >
        <span class="ann-stamp">{{ annLabel(a.type) }}</span>
        <div class="ann-main">
          <div class="ann-title">{{ a.title }}</div>
          <p v-if="a.content" class="ann-content">{{ a.content }}</p>
        </div>
        <span class="ann-time">{{ timeAgo(a.created_at) }}</span>
      </component>
    </div>
  </div>
</template>
