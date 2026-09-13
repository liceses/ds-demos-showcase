<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { CollectionOut } from '../api/types'
import PageHero from '../components/PageHero.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { t } from '../i18n'
import { errorMessage } from '../utils/error'

/**
 * /u/:username/collections —— 某人的**公开**收藏夹（只读）。
 * 与 /me/collections 同构但无任何管理动作：新建/改名/删除/可见性切换都不出现。
 */
defineOptions({ name: 'PublicCollectionsView' })
const props = defineProps<{ username: string }>()

const items = ref<CollectionOut[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await api.listPublicCollections(props.username)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="route-page">
    <PageHero tight>
      <RouterLink class="eyebrow" :to="`/user/${username}`">← {{ username }}</RouterLink>
      <h1 class="page-title">{{ t('fav.publicOf', '公开收藏夹') }}</h1>
      <p class="hint" style="margin-top: var(--sp-10)">{{ t('fav.publicOfHint', 'TA 设为公开的收藏夹，任何人都能查看。') }}</p>
    </PageHero>

    <section class="section" style="padding-top: var(--sp-8)">
      <LoadingRow v-if="loading" :text="t('fav.loading', '加载收藏夹…')" />
      <EmptyBox v-else-if="error" kind="error" :text="error" @retry="load" />
      <EmptyBox v-else-if="!items.length" :text="t('fav.nonePublic', 'TA 还没有公开的收藏夹')" />

      <ul v-else class="me-list">
        <li v-for="c in items" :key="c.id" class="me-row">
          <div class="me-covers" aria-hidden="true">
            <img v-for="(u, i) in c.cover_urls" :key="i" class="me-cover" :src="u" alt="" loading="lazy" decoding="async" />
            <span v-if="!c.cover_urls.length" class="me-cover me-cover--empty">—</span>
          </div>
          <div class="me-row-main">
            <RouterLink class="me-row-title" :to="`/collections/${c.id}`">{{ c.title }}</RouterLink>
            <p class="me-row-meta">
              <span class="mono">{{ c.item_count }} {{ t('fav.items', '件') }}</span>
              <span v-if="c.description" class="muted">· {{ c.description }}</span>
            </p>
          </div>
          <div class="me-row-actions">
            <RouterLink class="btn btn-sm btn-outline" :to="`/collections/${c.id}`">{{ t('fav.view', '查看 →') }}</RouterLink>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
