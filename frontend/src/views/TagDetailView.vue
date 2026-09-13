<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary, Tag, TagKeyInfo } from '../api/types'
import { tagLabel } from '../utils/funMode'
import { t, modeLabel, keyLabel } from '../i18n'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import TagGroupBox from '../components/TagGroupBox.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import PageHero from '../components/PageHero.vue'
import LoadMore from '../components/LoadMore.vue'
import { useLoadMore } from '../composables/useLoadMore'

const props = defineProps<{ k: string; v: string }>()

const tag = ref<Tag | null>(null)
const keyDef = ref<TagKeyInfo | null>(null)
// P2-d：原实现只发一次 page_size=50 —— 第 51 件起静默消失（页面既不提示"还有更多"也不提示"已到底"）。
// 改走统一的累积加载 + <LoadMore>。
const {
  items: demos,
  total: demoTotal,
  loading: demoLoading,
  loadFirst: loadDemos,
  loadMore: loadMoreDemos,
} = useLoadMore<DemoSummary>(
  (params) => api.listDemos({ status: 'approved', tags: [`${props.k}:${props.v}`], ...params }),
  24,
)
const forumCount = ref(0)
const loading = ref(true)
const error = ref('')

const valueInfo = computed(() => keyDef.value?.values.find((x) => x.value === props.v) || null)
const sameKeyValues = computed(() => keyDef.value?.values || [])

onMounted(async () => {
  try {
    const [t, keys, fr] = await Promise.all([
      api.getTag(props.k, props.v),
      api.listTagKeys().catch(() => [] as TagKeyInfo[]),
      api.listForumTopics({ tag: `${props.k}:${props.v}`, page_size: 1 }).catch(() => ({ total: 0 } as never)),
    ])
    tag.value = t
    keyDef.value = keys.find((x) => x.key === props.k) || null
    await loadDemos()
    forumCount.value = (fr as { total?: number }).total || 0
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="route-page">  <LoadingRow v-if="loading" :text="t('tags.loading', '加载标签…')" />
  <EmptyBox v-else-if="error" :text="error" />

  <template v-else-if="tag">
    <div class="breadcrumb">
      <RouterLink to="/">{{ t('tagDetail.home', '首页') }}</RouterLink>
      <span class="sep">/</span>
      <RouterLink to="/tags">{{ t('tagDetail.explore', '探索') }}</RouterLink>
      <span class="sep">/</span>
      <RouterLink to="/tags/keys">{{ t('tagDetail.tags', '标签') }}</RouterLink>
      <template v-if="tag.parent">
        <span class="sep">/</span>
        <RouterLink :to="`/tag/${tag.parent.key}/${tag.parent.value}`">{{ keyLabel(tag.parent.key) }}:{{ tagLabel(tag.parent.value) }}</RouterLink>
      </template>
    </div>

    <PageHero tight>
      <div class="filter-row" style="margin: 0 0 var(--sp-12)">
        <span v-if="keyDef" class="mode-badge" :class="'mode-badge-' + keyDef.mode">
          {{ keyLabel(keyDef.key, keyDef.label) }} · {{ modeLabel(keyDef.mode) }}
        </span>
        <span class="eyebrow">{{ t('tagDetail.eyebrow', '标签详情') }} <code>{{ tag.key }}</code></span>
      </div>
      <!-- P2-b：主标题改为**人读的值标签**，机器标识（键名）降为上方 eyebrow 里的 code。
           原先这里把内部标识当标题渲染成一行 115px 的「model:dsv4」——那是把内部标识端给用户。 -->
      <h1 class="page-title">{{ tagLabel(tag.value) }}</h1>
      <p class="sub">
        <template v-if="keyDef">{{ keyDef.description || '' }}</template>
        <template v-if="valueInfo?.description"><br />{{ valueInfo.description }}</template>
        <template v-if="!keyDef && !valueInfo?.description">{{ t('tagDetail.noDesc', '暂无介绍') }}</template>
      </p>
      <div class="filter-row" style="margin-top: var(--sp-16)">
        <span class="mini-stat"><b>{{ tag.demo_count }}</b> {{ t('tagDetail.demos', 'Demo') }}</span>
        <span class="mini-stat"><b>{{ sameKeyValues.length }}</b> {{ t('tagDetail.sameKey', '同键值') }}</span>
        <RouterLink v-if="forumCount > 0" class="mini-stat" :to="`/forum?tag=${tag.key}:${tag.value}`">{{ t('tagDetail.related', '相关讨论 {n} →', { n: forumCount }) }}</RouterLink>
      </div>
    </PageHero>

    <section v-if="sameKeyValues.length > 1" class="section" style="padding-top: var(--sp-8)">
      <div class="section-head">
        <h2 class="section-title">{{ t('tagDetail.switchKey', '同键切换') }}</h2>
      </div>
      <TagGroupBox
        v-if="sameKeyValues.length"
        :values="sameKeyValues"
        :route-key="tag.key"
        :active-value="tag.value"
      />
    </section>

    <section v-if="tag.children?.length" class="section" style="padding-top: var(--sp-8)">
      <div class="section-head">
        <h2 class="section-title">{{ t('tagDetail.children', '子标签') }}</h2>
      </div>
      <div class="filter-row">
        <RouterLink
          v-for="c in tag.children"
          :key="c.key + ':' + c.value"
          class="tag-chip teal"
          :to="`/tag/${c.key}/${c.value}`"
        >
          {{ keyLabel(c.key) }}:{{ tagLabel(c.value) }}
          <span class="count">{{ c.demo_count }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">关联 Demo</h2>
        <span class="mini-stat"><b>{{ demoTotal }}</b> 个</span>
      </div>
      <EmptyBox v-if="!demos.length" text="这个标签还很年轻，还没有 Demo" />
      <template v-else>
        <MasonryGrid :items="demos" :item-key="(d: unknown) => (d as DemoSummary).slug">
          <template #default="{ item }">
            <DemoCard :demo="item as DemoSummary" />
          </template>
        </MasonryGrid>
        <LoadMore :shown="demos.length" :total="demoTotal" :loading="demoLoading" @more="loadMoreDemos" />
      </template>
    </section>
  </template>
  </div>
</template>
