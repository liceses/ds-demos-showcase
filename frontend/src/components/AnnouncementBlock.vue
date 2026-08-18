<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Announcement } from '../api/types'
import { annCls, annLabel, timeAgo } from '../utils/announcement'

const props = defineProps<{ title: string; items: Announcement[] }>()

const expanded = ref(false)
const visible = computed(() => (expanded.value ? props.items.slice(0, 6) : props.items.slice(0, 1)))
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
