<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary, Tag, TagKeyInfo } from '../api/types'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import TagGroupBox from '../components/TagGroupBox.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'

const props = defineProps<{ k: string; v: string }>()

const tag = ref<Tag | null>(null)
const keyDef = ref<TagKeyInfo | null>(null)
const demos = ref<DemoSummary[]>([])
const forumCount = ref(0)
const loading = ref(true)
const error = ref('')

const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }

const valueInfo = computed(() => keyDef.value?.values.find((x) => x.value === props.v) || null)
const sameKeyValues = computed(() => keyDef.value?.values || [])

onMounted(async () => {
  try {
    const [t, keys, res, fr] = await Promise.all([
      api.getTag(props.k, props.v),
      api.listTagKeys().catch(() => [] as TagKeyInfo[]),
      api.listDemos({ status: 'approved', tags: [`${props.k}:${props.v}`], page_size: 50 }),
      api.listForumTopics({ tag: `${props.k}:${props.v}`, page_size: 1 }).catch(() => ({ total: 0 } as never)),
    ])
    tag.value = t
    keyDef.value = keys.find((x) => x.key === props.k) || null
    demos.value = res.items
    forumCount.value = (fr as { total?: number }).total || 0
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <LoadingRow v-if="loading" text="加载标签…" />
  <EmptyBox v-else-if="error" :text="error" />

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
      <div class="filter-row" style="margin: 0 0 12px">
        <span v-if="keyDef" class="mode-badge" :class="'mode-badge-' + keyDef.mode">
          {{ keyDef.label || keyDef.key }} · {{ modeLabel[keyDef.mode] }}
        </span>
        <span class="eyebrow">标签详情</span>
      </div>
      <h1 class="huge">{{ tag.key }}:{{ tag.value }}</h1>
      <p class="sub">
        <template v-if="keyDef">{{ keyDef.description || '' }}</template>
        <template v-if="valueInfo?.description"><br />{{ valueInfo.description }}</template>
        <template v-if="!keyDef && !valueInfo?.description">暂无介绍</template>
      </p>
      <div class="filter-row" style="margin-top: 16px">
        <span class="mini-stat"><b>{{ tag.demo_count }}</b> Demo</span>
        <span class="mini-stat"><b>{{ sameKeyValues.length }}</b> 同键值</span>
        <RouterLink v-if="forumCount > 0" class="mini-stat" :to="`/forum?tag=${tag.key}:${tag.value}`">相关讨论 {{ forumCount }} →</RouterLink>
      </div>
    </section>

    <section v-if="sameKeyValues.length > 1" class="section" style="padding-top: 8px">
      <div class="section-head">
        <h2 class="section-title">同键切换</h2>
      </div>
      <TagGroupBox
        v-if="sameKeyValues.length"
        :values="sameKeyValues"
        :route-key="tag.key"
        :active-value="tag.value"
      />
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
      <EmptyBox v-if="!demos.length" text="这个标签还很年轻，还没有 Demo" />
      <MasonryGrid v-else :items="demos" :item-key="(d: unknown) => (d as DemoSummary).slug">
        <template #default="{ item }">
          <DemoCard :demo="item as DemoSummary" />
        </template>
      </MasonryGrid>
    </section>
  </template>
</template>
