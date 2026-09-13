<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { CollectionItemOut, CollectionOut, DemoSummary } from '../api/types'
import PageHero from '../components/PageHero.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import DemoCard from '../components/DemoCard.vue'
import PaginationBar from '../components/PaginationBar.vue'
import CopyButton from '../components/CopyButton.vue'
import { t } from '../i18n'
import { parseDate, currentLocale } from '../utils/time'
import { errorMessage } from '../utils/error'

/**
 * /collections/:id —— 公开收藏夹的**分享落地页**（陌生人第一眼要有上下文）。
 *
 * 可见性规则：public 任何人可读；private 只有 owner 可读；其余一律**不存在**（notfound），
 * 不提示"存在但无权" —— 避免暴露私密夹的存在性。
 * 浏览场景用卡片墙（MasonryGrid + DemoCard），与"管理条目"的行式列表刻意不同。
 */
defineOptions({ name: 'PublicCollectionView' })
const props = defineProps<{ id: string }>()

const collectionId = computed(() => Number(props.id))
const collection = ref<CollectionOut | null>(null)
const items = ref<CollectionItemOut[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 24
const loading = ref(true)
const error = ref('')
const notFound = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  notFound.value = false
  try {
    collection.value = await api.getPublicCollection(collectionId.value)
    await loadItems()
  } catch (e) {
    const msg = errorMessage(e)
    // 后端对"无权/不存在"统一返回同一种错误；前端一律按 notfound 呈现
    if (/不存在|无权限|not found|404/i.test(msg)) notFound.value = true
    else error.value = msg
  } finally {
    loading.value = false
  }
}

async function loadItems() {
  const res = await api.listPublicCollectionItems(collectionId.value, { page: page.value, pageSize })
  items.value = res.items
  total.value = res.total
}

onMounted(load)
function setPage(next: number) {
  page.value = next
  void loadItems()
}

const shareLink = computed(() => `${location.origin}/collections/${collectionId.value}`)
const updatedLabel = computed(() =>
  collection.value ? parseDate(collection.value.updated_at).toLocaleDateString(currentLocale()) : '',
)
</script>

<template>
  <div class="route-page">
    <LoadingRow v-if="loading" :text="t('fav.loading', '加载收藏夹…')" />
    <EmptyBox v-else-if="notFound" kind="notfound" :text="t('fav.notFound', '这个收藏夹不存在或未公开')">
      <template #action>
        <RouterLink class="btn btn-sm btn-outline" to="/demos">{{ t('fav.goBrowse', '去逛逛作品库 →') }}</RouterLink>
      </template>
    </EmptyBox>
    <EmptyBox v-else-if="error" kind="error" :text="error" @retry="load" />

    <template v-else-if="collection">
      <PageHero tight>
        <span class="eyebrow">{{ t('fav.title', '收藏夹') }}</span>
        <h1 class="page-title">{{ collection.title }}</h1>
        <p class="me-row-meta" style="margin-top: var(--sp-10)">
          <RouterLink :to="`/user/${collection.owner_username}`" style="font-weight: 900">@{{ collection.owner_username }}</RouterLink>
          <span class="me-dot" aria-hidden="true">·</span>
          <span class="mono">{{ collection.item_count }} {{ t('fav.items', '件') }}</span>
          <span class="me-dot" aria-hidden="true">·</span>
          <span class="muted mono">{{ t('fav.updatedOn', '更新于 {d}', { d: updatedLabel }) }}</span>
        </p>
        <div class="filter-row" style="margin-top: var(--sp-12)">
          <CopyButton :text="shareLink" :label="t('fav.copyLink', '复制链接')" />
          <RouterLink class="btn btn-sm btn-outline" :to="`/user/${collection.owner_username}/collections`">
            {{ t('fav.moreOf', 'TA 的其他收藏夹 →') }}
          </RouterLink>
        </div>
        <p v-if="collection.description" class="hint" style="margin-top: var(--sp-10)">{{ collection.description }}</p>
      </PageHero>

      <section class="section" style="padding-top: var(--sp-8)">
        <p class="card card-mint hist-notice">
          <span>{{ t('fav.publicNotice', '这是一份公开收藏夹，任何拿到链接的人都能查看。') }}</span>
        </p>

        <EmptyBox v-if="!items.length" :text="t('fav.empty', '这个收藏夹还是空的')" />
        <template v-else>
          <MasonryGrid :items="items" :item-key="(it: unknown) => (it as CollectionItemOut).demo.slug">
            <template #default="{ item }">
              <DemoCard :demo="(item as CollectionItemOut).demo as DemoSummary" />
            </template>
          </MasonryGrid>
          <PaginationBar v-if="Math.ceil(total / pageSize) > 1" :page="page" :total="total" :page-size="pageSize" @change="setPage" />
        </template>
      </section>
    </template>
  </div>
</template>
