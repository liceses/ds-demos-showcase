<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import type { CollectionItemOut, CollectionOut, CollectionVisibility } from '../api/types'
import { useUiStore } from '../stores/ui'
import PageHero from '../components/PageHero.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import PaginationBar from '../components/PaginationBar.vue'
import ModelChips from '../components/ModelChips.vue'
import CopyButton from '../components/CopyButton.vue'
import { t } from '../i18n'
import { parseDate, currentLocale } from '../utils/time'
import { errorMessage } from '../utils/error'

/**
 * /me/collections/:id —— 收藏夹详情（整理条目）。
 *
 * 设计（方案 §2D）：主任务是**整理**，所以条目用行式而非卡片墙（卡片墙里"移出"按钮很难找）。
 * 「移出」用轻量二次确认（按钮原地变「确认移出？」，3s 内再点生效）——
 * 高频低风险动作不该每次都弹全屏 confirm。
 *
 * 取数用 getPublicCollection：后端对 owner 与 public 都放行、其余 404（不泄露存在性），
 * 所以自己的私密夹与别人的公开夹走同一个接口。
 */
defineOptions({ name: 'MeCollectionDetailView' })
const props = defineProps<{ id: string }>()
const ui = useUiStore()
const router = useRouter()

const collectionId = computed(() => Number(props.id))
const collection = ref<CollectionOut | null>(null)
const items = ref<CollectionItemOut[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(true)
const error = ref('')
const busy = ref(false)
/** 轻量二次确认：正在等待"确认移出"的 slug */
const confirming = ref<string | null>(null)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

async function load() {
  loading.value = true
  error.value = ''
  try {
    collection.value = await api.getPublicCollection(collectionId.value)
    await loadItems()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function loadItems() {
  const res = await api.listCollectionItems(collectionId.value, { page: page.value, pageSize })
  items.value = res.items
  total.value = res.total
}

onMounted(load)

function setPage(next: number) {
  page.value = next
  void loadItems()
}

async function removeItem(slug: string) {
  if (confirming.value !== slug) {
    confirming.value = slug
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirming.value = null), 3000)
    return
  }
  confirming.value = null
  busy.value = true
  try {
    await api.removeFromCollection(collectionId.value, slug)
    // 原地移除 + 计数同步；若当前页空了且不是第一页 → 回退一页
    items.value = items.value.filter((x) => x.demo.slug !== slug)
    total.value = Math.max(0, total.value - 1)
    if (collection.value) collection.value.item_count = total.value
    if (!items.value.length && page.value > 1) {
      page.value -= 1
      await loadItems()
    }
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    busy.value = false
  }
}

async function toggleVisibility() {
  if (!collection.value) return
  const next: CollectionVisibility = collection.value.visibility === 'public' ? 'private' : 'public'
  busy.value = true
  try {
    collection.value = await api.updateCollection(collectionId.value, { visibility: next })
    ui.toast(
      next === 'public'
        ? t('fav.nowPublic', '已设为公开：任何拿到链接的人都能查看')
        : t('fav.nowPrivate', '已设为私密：只有你能查看'),
      'success',
    )
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    busy.value = false
  }
}

async function removeCollection() {
  if (!collection.value) return
  const ok = await ui.confirm({
    title: t('fav.delTitle', '删除收藏夹'),
    message: t('fav.delMsg', `确定删除「${collection.value.title}」？夹内 ${collection.value.item_count} 件作品的收藏记录会一并移除（作品本身不受影响）。`, {
      title: collection.value.title,
      n: collection.value.item_count,
    }),
    confirmText: t('fav.delConfirm', '删除'),
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await api.deleteCollection(collectionId.value)
    ui.toast(t('fav.deleted', '收藏夹已删除'), 'success')
    void router.push('/me/collections')
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    busy.value = false
  }
}

function addedLabel(iso: string): string {
  return parseDate(iso).toLocaleDateString(currentLocale())
}
</script>

<template>
  <div class="route-page">
    <PageHero tight>
      <RouterLink class="eyebrow" to="/me/collections">← {{ t('fav.backList', '收藏夹') }}</RouterLink>
      <h1 class="page-title">{{ collection ? collection.title : t('fav.title', '收藏夹') }}</h1>
      <div v-if="collection" class="filter-row" style="margin-top: 12px">
        <span class="mini-stat"><b>{{ collection.item_count }}</b> {{ t('fav.items', '件') }}</span>
        <span class="mono me-vis" :class="collection.visibility === 'public' ? 'me-vis--public' : ''">
          {{ collection.visibility === 'public' ? t('fav.public', '公开') : t('fav.private', '私密') }}
        </span>
        <button class="btn btn-sm btn-outline" type="button" :disabled="busy" @click="toggleVisibility">
          {{ collection.visibility === 'public' ? t('fav.makePrivate', '设为私密') : t('fav.makePublic', '设为公开') }}
        </button>
        <CopyButton v-if="collection.visibility === 'public'" :text="`${$el?.ownerDocument?.location?.origin ?? ''}/collections/${collection.id}`" :label="t('fav.copyLink', '复制链接')" />
        <button v-if="!collection.is_default" class="btn btn-sm btn-danger" type="button" :disabled="busy" @click="removeCollection">
          {{ t('fav.delThis', '删除此夹') }}
        </button>
      </div>
      <p v-if="collection?.description" class="hint" style="margin-top: 8px">{{ collection.description }}</p>
    </PageHero>

    <section class="section" style="padding-top: 8px">
      <LoadingRow v-if="loading" :text="t('fav.loadingItems', '加载条目…')" />
      <EmptyBox v-else-if="error" kind="error" :text="error" @retry="load" />
      <EmptyBox v-else-if="!items.length" :text="t('fav.empty', '这个收藏夹还是空的')">
        <template #action>
          <RouterLink class="btn btn-sm btn-primary" to="/demos">{{ t('fav.goBrowse', '去逛逛作品库 →') }}</RouterLink>
        </template>
      </EmptyBox>

      <template v-else>
        <ul class="me-list">
          <li v-for="it in items" :key="it.demo.slug" class="me-row me-row--item">
            <RouterLink class="me-thumb" :to="`/demo/${it.demo.slug}`">
              <img v-if="it.demo.cover_url" :src="it.demo.cover_url" alt="" loading="lazy" decoding="async" />
              <span v-else aria-hidden="true">{{ it.demo.title[0] }}</span>
            </RouterLink>
            <div class="me-row-main">
              <RouterLink class="me-row-title" :to="`/demo/${it.demo.slug}`">{{ it.demo.title }}</RouterLink>
              <p class="me-row-meta">
                <ModelChips v-if="it.demo.models?.length" :models="it.demo.models" :max="3" size="sm" />
                <span class="muted mono">{{ t('fav.addedOn', '加入于 {d}', { d: addedLabel(it.added_at) }) }}</span>
              </p>
            </div>
            <div class="me-row-actions">
              <button
                class="btn btn-sm"
                :class="confirming === it.demo.slug ? 'btn-danger' : 'btn-outline'"
                type="button"
                :disabled="busy"
                @click="removeItem(it.demo.slug)"
              >
                {{ confirming === it.demo.slug ? t('fav.confirmRemove', '确认移出？') : t('fav.remove', '移出') }}
              </button>
            </div>
          </li>
        </ul>
        <PaginationBar v-if="Math.ceil(total / pageSize) > 1" :page="page" :total="total" :page-size="pageSize" @change="setPage" />
      </template>
    </section>
  </div>
</template>
