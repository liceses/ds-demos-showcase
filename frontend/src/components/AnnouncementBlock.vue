<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Announcement } from '../api/types'
import { annCls, annLabel, timeAgo } from '../utils/announcement'
import MarkdownRenderer from './MarkdownRenderer.vue'
import AnnouncementModal from './AnnouncementModal.vue'

const props = defineProps<{ title: string; items: Announcement[]; showStatus?: boolean }>()

const expanded = ref(false)
const activeAnn = ref<Announcement | null>(null)
const visible = computed(() => (expanded.value ? props.items.slice(0, 6) : props.items.slice(0, 1)))

const statusLabel: Record<string, string> = { draft: '草稿', published: '已发布', offline: '已下线' }
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
        :class="[annCls(a.type), { clickable: !a.demo_slug }]"
        :role="a.demo_slug ? undefined : 'button'"
        @click="a.demo_slug ? undefined : (activeAnn = a)"
      >
        <span class="ann-stamp">{{ annLabel(a.type) }}</span>
        <div class="ann-main">
          <div class="ann-title">
            <span v-if="a.pinned" class="ann-pin">置顶</span>
            <span v-if="a.category" class="ann-cat">{{ a.category }}</span>
            <span v-if="showStatus && a.status" class="ann-status" :class="'status-' + a.status">{{ statusLabel[a.status] }}</span>
            {{ a.title }}
          </div>
          <MarkdownRenderer v-if="a.content" :content="a.content" compact />
        </div>
        <span class="ann-time">{{ timeAgo(a.created_at) }}</span>
      </component>
    </div>

    <AnnouncementModal :ann="activeAnn" @close="activeAnn = null" />
  </div>
</template>
