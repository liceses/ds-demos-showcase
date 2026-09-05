<script setup lang="ts">
// 精选管理（07 §2.2 首页策展池 / T5·M5-F1 + F2 收编 DemoPicker）：
// 内容组新面板——从已上架作品里精选（基座 DemoPicker 添加）→ 排序（上移/下移）→ 置顶 hero → 移除。
// 首页展示侧：池非空按序展示（hero=第 1 件），池空回落现状随机（本面板即策展编辑入口）。
defineOptions({ name: 'AdminFeaturedSection' })
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { AdminFeaturedItem } from '../../api/types'
import { t } from '../../i18n'
// T5·M5-F2：添加入口 = 共享 DemoPicker（kind=demo，manualSlug 兜底手输 slug）
import EntityPicker from '../picker/EntityPicker.vue'
import type { EntityPick } from '../picker/pickerSources'

const ui = useUiStore()

const rows = ref<AdminFeaturedItem[]>([])
const loading = ref(false)
const busy = ref<'move' | 'hero' | 'remove' | null>(null)
const adding = ref(false)

async function load() {
  loading.value = true
  try {
    const pool = await api.listFeatured()
    rows.value = pool.items
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

async function pickToAdd(p: EntityPick) {
  if (adding.value) return
  adding.value = true
  const slug = ((p.slug as string) || (p.label as string) || '').trim()
  try {
    if (!slug) return
    await api.addFeaturedDemo({ slug })
    ui.toast(t('admin.featured.added', '已加入精选池'), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    adding.value = false
  }
}

async function move(item: AdminFeaturedItem, direction: 'up' | 'down') {
  if (busy.value) return
  busy.value = 'move'
  try {
    await api.moveFeaturedDemo(item.id, direction)
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value = null
  }
}

async function hero(item: AdminFeaturedItem) {
  if (busy.value) return
  busy.value = 'hero'
  try {
    await api.heroFeaturedDemo(item.id)
    ui.toast(t('admin.featured.heroed', '已设为首页大卡'), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value = null
  }
}

async function remove(item: AdminFeaturedItem) {
  if (busy.value) return
  const ok = await ui.confirm({
    title: t('admin.featured.removeTitle', '移出精选池？'),
    message: t('admin.featured.removeMsg', '《{t}》将从首页精选/hero 池移除（其余项自动重排）。', { t: item.title }),
    confirmText: t('admin.featured.remove', '移除'),
    danger: true,
  })
  if (!ok) return
  busy.value = 'remove'
  try {
    await api.removeFeaturedDemo(item.id)
    ui.toast(t('admin.featured.removed', '已移出精选池'), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value = null
  }
}

onMounted(load)
</script>

<template>
  <div>
    <p class="filter-label" style="margin-bottom: 10px">
      {{ t('admin.featured.hint', '首页「精选作品」与 hero 大卡 = 本池按序展示（池空时自动回落全量随机，本面板是唯一的策展入口）。只收已上架（approved）作品。') }}
    </p>

    <div v-if="loading && !rows.length" class="loading-row"><span class="spinner"></span> {{ t('admin.featured.loading', '加载精选池…') }}</div>

    <div v-else-if="!rows.length" class="card card-default" style="padding: 14px">
      <p class="muted" style="margin: 0 0 10px">
        {{ t('admin.featured.poolEmpty', '策展池为空——首页当前回落「已上架全量随机」（60s 同批 + 换一批）。加入第一件后即切换为策展态。') }}
      </p>
      <EntityPicker
        kind="demo"
        mode="dropdown"
        manual-slug
        :placeholder="t('admin.featured.addPh', '搜作品名 / 作者 / slug，选中即加入…')"
        @pick="pickToAdd"
      />
      <p class="hint" style="margin: 8px 0 0">{{ t('admin.featured.addNote', '新件排在池尾；加入后可在下方上移/置顶。重复加入会被后端拒绝。') }}</p>
    </div>

    <template v-else>
      <div class="feat-bar">
        <button class="btn btn-sm btn-outline" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
        <span class="hint">{{ t('admin.featured.count', '池内 {n} 件', { n: rows.length }) }}</span>
      </div>

      <div class="feat-add card card-default" style="padding: 12px; margin-bottom: 12px">
        <EntityPicker
          kind="demo"
          mode="dropdown"
          manual-slug
          :placeholder="t('admin.featured.addPh', '搜作品名 / 作者 / slug，选中即加入…')"
          @pick="pickToAdd"
        />
        <p class="hint" style="margin: 8px 0 0">{{ t('admin.featured.addNote', '新件排在池尾；可在行内上移/置顶调整。重复加入会被后端拒绝。') }}</p>
      </div>

      <div class="feat-list">
        <div v-for="(item, i) in rows" :key="item.id" class="feat-row" :class="{ hero: i === 0 }">
          <span class="feat-no mono">{{ i + 1 }}</span>
          <span v-if="i === 0" class="cluster-badge cb-exact feat-hero-badge">{{ t('admin.featured.hero', '首页 hero') }}</span>
          <div class="feat-main">
            <RouterLink class="feat-title" :to="`/demo/${item.slug}`" target="_blank" rel="noopener">{{ item.title }}</RouterLink>
            <span class="muted mono feat-meta">{{ item.author }} · {{ item.slug }}<template v-if="item.rating_avg != null"> · ★{{ Number(item.rating_avg).toFixed(1) }}</template></span>
          </div>
          <div class="feat-actions">
            <button type="button" class="btn btn-sm btn-outline" :disabled="busy !== null || adding || i === 0" :title="t('admin.featured.up', '上移')" @click="move(item, 'up')">↑</button>
            <button type="button" class="btn btn-sm btn-outline" :disabled="busy !== null || adding || i === rows.length - 1" :title="t('admin.featured.down', '下移')" @click="move(item, 'down')">↓</button>
            <button v-if="i > 0" type="button" class="btn btn-sm btn-secondary" :disabled="busy !== null || adding" @click="hero(item)">{{ t('admin.featured.setHero', '置顶为 hero') }}</button>
            <button type="button" class="btn btn-sm btn-dark" :disabled="busy !== null || adding" @click="remove(item)">{{ t('admin.featured.remove', '移除') }}</button>
          </div>
        </div>
      </div>
      <p class="hint" style="margin-top: 8px">{{ t('admin.featured.heroNote', 'hero 大卡 = 池内第 1 件；首页展示顺序即本列表顺序。移除或排序均落审计。') }}</p>
    </template>
  </div>
</template>

<style scoped>
/* 精选池列表：无盒列表 + 2px 分隔（与后台其余列表同语汇；零圆角/零旋转/44px 命中） */
.feat-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.feat-list {
  border-top: 2px solid var(--ink, #000);
}
.feat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 2px solid var(--ink, #000);
}
.feat-row.hero {
  background: var(--paper-deep, #f2eee6);
}
.feat-no {
  flex: none;
  width: 26px;
  font-weight: 900;
  text-align: right;
}
.feat-hero-badge {
  flex: none;
}
.feat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.feat-title {
  font-weight: 800;
  font-size: 14px;
  color: var(--ink, #000);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.feat-title:hover {
  text-decoration: underline;
}
.feat-meta {
  font-size: 11px;
}
.feat-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
</style>
