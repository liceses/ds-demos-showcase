<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { CollectionOut, CollectionVisibility } from '../api/types'
import { useUiStore } from '../stores/ui'
import PageHero from '../components/PageHero.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import CopyButton from '../components/CopyButton.vue'
import { t } from '../i18n'
import { errorMessage } from '../utils/error'

/**
 * /me/collections —— 我的收藏夹（管理页）。
 *
 * 设计（docs 方案 §2C）：管理场景要**密度**不要美观墙 → 行式列表（.me-row），
 * 每行：封面缩略 ×3 / 名称 / 件数 · 可见性 / 行内操作（改名、公开⇄私密、复制链接、删除）。
 * 危险动作（删除）统一走 ui.confirm；改名走行内输入框，不弹窗。
 */
defineOptions({ name: 'MeCollectionsView' })
const ui = useUiStore()

const items = ref<CollectionOut[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref<number | null>(null)
/** 行内改名：正在编辑的夹 id 与草稿 */
const editingId = ref<number | null>(null)
const draftTitle = ref('')
/** 新建：行内展开，不跳页 */
const creating = ref(false)
const newTitle = ref('')
const newVisibility = ref<CollectionVisibility>('private')

const MAX_COLLECTIONS = 20
const canCreate = computed(() => items.value.length < MAX_COLLECTIONS)

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await api.listMyCollections()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function create() {
  const title = newTitle.value.trim()
  if (!title) return
  busy.value = -1
  try {
    const c = await api.createCollection({ title, visibility: newVisibility.value })
    items.value = [...items.value, c]
    newTitle.value = ''
    newVisibility.value = 'private'
    creating.value = false
    ui.toast(t('fav.created', '收藏夹已创建'), 'success')
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    busy.value = null
  }
}

function startRename(c: CollectionOut) {
  editingId.value = c.id
  draftTitle.value = c.title
}

async function saveRename(c: CollectionOut) {
  const title = draftTitle.value.trim()
  if (!title || title === c.title) {
    editingId.value = null
    return
  }
  busy.value = c.id
  try {
    const updated = await api.updateCollection(c.id, { title })
    items.value = items.value.map((x) => (x.id === c.id ? updated : x))
    editingId.value = null
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    busy.value = null
  }
}

async function toggleVisibility(c: CollectionOut) {
  busy.value = c.id
  const next: CollectionVisibility = c.visibility === 'public' ? 'private' : 'public'
  try {
    const updated = await api.updateCollection(c.id, { visibility: next })
    items.value = items.value.map((x) => (x.id === c.id ? updated : x))
    ui.toast(
      next === 'public'
        ? t('fav.nowPublic', '已设为公开：任何拿到链接的人都能查看')
        : t('fav.nowPrivate', '已设为私密：只有你能查看'),
      'success',
    )
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    busy.value = null
  }
}

async function remove(c: CollectionOut) {
  const ok = await ui.confirm({
    title: t('fav.delTitle', '删除收藏夹'),
    message: t('fav.delMsg', `确定删除「${c.title}」？夹内 ${c.item_count} 件作品的收藏记录会一并移除（作品本身不受影响）。`, {
      title: c.title,
      n: c.item_count,
    }),
    confirmText: t('fav.delConfirm', '删除'),
    danger: true,
  })
  if (!ok) return
  busy.value = c.id
  try {
    await api.deleteCollection(c.id)
    items.value = items.value.filter((x) => x.id !== c.id)
    ui.toast(t('fav.deleted', '收藏夹已删除'), 'success')
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    busy.value = null
  }
}

function shareLink(c: CollectionOut): string {
  return `${location.origin}/collections/${c.id}`
}
</script>

<template>
  <div class="route-page">
    <PageHero>
      <span class="eyebrow">{{ t('fav.title', '收藏夹') }}</span>
      <h1 class="page-title">{{ t('fav.mine', '我的收藏夹') }}</h1>
      <p class="hint" style="margin-top: 10px">
        {{ t('fav.pageHint', '公开的收藏夹可以被别人看到，也能把链接发出去；私密的只有你自己能看。') }}
      </p>
    </PageHero>

    <section class="section" style="padding-top: 8px">
      <!-- 新建：行内展开（不跳页、不弹窗） -->
      <div class="me-toolbar">
        <button v-if="!creating" class="btn btn-sm btn-primary" type="button" :disabled="!canCreate" @click="creating = true">
          ＋ {{ t('fav.new', '新建收藏夹') }}
        </button>
        <span v-else class="me-create">
          <input
            v-model="newTitle"
            class="input"
            :placeholder="t('fav.namePlaceholder', '收藏夹名称')"
            maxlength="60"
            @keydown.enter.prevent="create"
            @keydown.esc="creating = false"
          />
          <button class="btn btn-sm btn-outline" type="button" @click="newVisibility = newVisibility === 'public' ? 'private' : 'public'">
            {{ newVisibility === 'public' ? t('fav.public', '公开') : t('fav.private', '私密') }}
          </button>
          <button class="btn btn-sm btn-primary" type="button" :disabled="busy === -1" @click="create">
            {{ t('common.create', '创建') }}
          </button>
          <button class="btn btn-sm btn-outline" type="button" @click="creating = false">{{ t('common.cancel', '取消') }}</button>
        </span>
        <span v-if="!canCreate" class="muted">{{ t('fav.limit', '最多 20 个收藏夹', { n: MAX_COLLECTIONS }) }}</span>
      </div>

      <LoadingRow v-if="loading" :text="t('fav.loading', '加载收藏夹…')" />
      <EmptyBox v-else-if="error" kind="error" :text="error" />
      <EmptyBox v-else-if="!items.length" :text="t('fav.noCollections', '还没有收藏夹')">
        <template #action>
          <button class="btn btn-sm btn-primary" type="button" @click="creating = true">{{ t('fav.new', '新建收藏夹') }}</button>
        </template>
      </EmptyBox>

      <ul v-else class="me-list">
        <li v-for="c in items" :key="c.id" class="me-row">
          <div class="me-covers" aria-hidden="true">
            <img v-for="(u, i) in c.cover_urls" :key="i" class="me-cover" :src="u" alt="" loading="lazy" decoding="async" />
            <span v-if="!c.cover_urls.length" class="me-cover me-cover--empty">—</span>
          </div>

          <div class="me-row-main">
            <template v-if="editingId === c.id">
              <input v-model="draftTitle" class="input" maxlength="60" @keydown.enter.prevent="saveRename(c)" @keydown.esc="editingId = null" />
            </template>
            <template v-else>
              <RouterLink class="me-row-title" :to="`/me/collections/${c.id}`">{{ c.title }}</RouterLink>
            </template>
            <p class="me-row-meta">
              <span class="mono">{{ c.item_count }} {{ t('fav.items', '件') }}</span>
              <span class="me-dot" aria-hidden="true">·</span>
              <span class="mono" :class="c.visibility === 'public' ? 'me-vis me-vis--public' : 'me-vis'">
                {{ c.visibility === 'public' ? t('fav.public', '公开') : t('fav.private', '私密') }}
              </span>
              <span v-if="c.is_default" class="muted">· {{ t('fav.defaultHint', '默认收藏夹，不可删除') }}</span>
            </p>
          </div>

          <div class="me-row-actions">
            <template v-if="editingId === c.id">
              <button class="btn btn-sm btn-primary" type="button" :disabled="busy === c.id" @click="saveRename(c)">{{ t('common.save', '保存') }}</button>
              <button class="btn btn-sm btn-outline" type="button" @click="editingId = null">{{ t('common.cancel', '取消') }}</button>
            </template>
            <template v-else>
              <RouterLink class="btn btn-sm btn-outline" :to="`/me/collections/${c.id}`">{{ t('fav.manageItems', '管理条目 →') }}</RouterLink>
              <button v-if="!c.is_default" class="btn btn-sm btn-outline" type="button" :disabled="busy === c.id" @click="startRename(c)">
                {{ t('common.rename', '改名') }}
              </button>
              <button v-if="!c.is_default" class="btn btn-sm btn-outline" type="button" :disabled="busy === c.id" @click="toggleVisibility(c)">
                {{ c.visibility === 'public' ? t('fav.makePrivate', '设为私密') : t('fav.makePublic', '设为公开') }}
              </button>
              <CopyButton v-if="c.visibility === 'public'" :text="shareLink(c)" :label="t('fav.copyLink', '复制链接')" />
              <button v-if="!c.is_default" class="btn btn-sm btn-danger" type="button" :disabled="busy === c.id" @click="remove(c)">
                {{ t('common.delete', '删除') }}
              </button>
            </template>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
