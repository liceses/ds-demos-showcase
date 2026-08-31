<script setup lang="ts">
defineOptions({ name: 'AdminDemosSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { AdminDemo } from '../../api/types'
import PaginationBar from '../PaginationBar.vue'
import LoadingRow from '../LoadingRow.vue'
import { useLocalPagination } from '../../composables/useLocalPagination'

const ui = useUiStore()
const demos = ref<AdminDemo[]>([])
const loading = ref(true)
const demoQuery = ref('')
const demoStatus = ref<'all' | 'approved' | 'pending' | 'rejected'>('all')
const astraOnly = ref(false)

async function load() {
  loading.value = true
  try {
    demos.value = await api.adminDemos()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

// ---------- astra 橱窗策展（sites 通行证 + lang；乐观更新 + 失败回滚） ----------
function sitesList(d: AdminDemo): string[] {
  return (d.sites || 'deep').split(',').filter(Boolean)
}
function hasScope(d: AdminDemo, scope: 'deep' | 'astra'): boolean {
  return sitesList(d).includes(scope)
}
async function toggleScope(d: AdminDemo, scope: 'deep' | 'astra') {
  const cur = sitesList(d)
  const next = cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope]
  // 至少保留一个站点，否则等于把作品从所有面上删除（应该走删除/拒绝，而非取消可见）
  if (!next.length) {
    ui.toast('至少要留一个可见站点（想彻底下架请删除或拒绝）', 'error')
    return
  }
  const old = d.sites
  const granting = !cur.includes(scope)
  d.sites = next.join(',')
  try {
    const r = await api.setCuration(d.slug, { sites: next })
    d.sites = r.sites
    const label = scope === 'astra' ? '橱窗' : '主站'
    ui.toast(`${label}：${granting ? '已发放通行证' : '已隐藏'}`, 'success')
  } catch (e) {
    d.sites = old
    ui.toast((e as Error).message, 'error')
  }
}
async function setLang(d: AdminDemo, lang: 'zh' | 'en') {
  const old = d.lang
  d.lang = lang
  try {
    const r = await api.setCuration(d.slug, { lang })
    d.lang = r.lang
    ui.toast(`语言已标记为 ${lang === 'en' ? '英文' : '中文'}`, 'success')
  } catch (e) {
    d.lang = old
    ui.toast((e as Error).message, 'error')
  }
}

const demoFiltered = computed(() => {
  let items = demos.value
  if (demoStatus.value !== 'all') items = items.filter((d) => d.status === demoStatus.value)
  if (astraOnly.value) items = items.filter((d) => hasScope(d, 'astra'))
  const q = demoQuery.value.trim().toLowerCase()
  if (q) {
    items = items.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.author || '').toLowerCase().includes(q) ||
        d.slug.toLowerCase().includes(q) ||
        (d.tags || []).some((t) => `${t.key}:${t.value}`.toLowerCase().includes(q)),
    )
  }
  return items
})
const {
  page: demoPage,
  total: demoTotal,
  pages: demoPages,
  paged: demoPaged,
  pageSize: demoPageSize,
  setPage: setDemoPage,
} = useLocalPagination<AdminDemo>(() => demoFiltered.value, 8)

async function setDemoStatus(slug: string, action: 'approve' | 'reject') {
  const d = demos.value.find((x) => x.slug === slug)
  const old = d?.status
  if (d) d.status = action === 'approve' ? 'approved' : 'rejected'
  try {
    await api.adminApprove(slug, action)
    ui.toast(action === 'approve' ? '已通过' : '已拒绝', 'success')
  } catch (e) {
    if (d && old) d.status = old
    ui.toast((e as Error).message, 'error')
  }
}

async function deleteDemoRow(d: AdminDemo) {
  const ok = await ui.confirm({ title: '删除 Demo', message: `确定删除「${d.title}」？`, confirmText: '删除', danger: true })
  if (!ok) return
  const idx = demos.value.findIndex((x) => x.slug === d.slug)
  const removed = idx >= 0 ? demos.value[idx] : null
  if (idx >= 0) demos.value.splice(idx, 1)
  try {
    await api.deleteDemo(d.slug)
    ui.toast('Demo 已删除', 'success')
  } catch (e) {
    if (removed) demos.value.splice(idx, 0, removed)
    ui.toast((e as Error).message, 'error')
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 14px">
      <div class="search-box" style="flex: 1">
        <input v-model="demoQuery" class="input" type="search" placeholder="搜索标题 / 作者 / slug / 标签…" @input="demoPage = 1" />
        <span class="search-icon">Q</span>
      </div>
      <div class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: demoStatus === 'all' }" type="button" @click="demoStatus = 'all'; demoPage = 1">全部</button>
        <button class="tab" :class="{ active: demoStatus === 'approved' }" type="button" @click="demoStatus = 'approved'; demoPage = 1">已上线</button>
        <button class="tab" :class="{ active: demoStatus === 'pending' }" type="button" @click="demoStatus = 'pending'; demoPage = 1">待审</button>
        <button class="tab" :class="{ active: demoStatus === 'rejected' }" type="button" @click="demoStatus = 'rejected'; demoPage = 1">已拒</button>
        <button class="tab" :class="{ active: astraOnly }" type="button" @click="astraOnly = !astraOnly; demoPage = 1">橱窗池</button>
      </div>
    </div>

    <LoadingRow v-if="loading" text="加载 Demo…" />
    <div v-else class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>标题</th><th>作者</th><th>状态</th><th>橱窗</th><th>浏览</th><th>存储</th><th>一致性</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in demoPaged" :key="d.slug" :class="{ inconsistent: d.inconsistency }">
            <td><RouterLink :to="`/demo/${d.slug}`">{{ d.title }}</RouterLink></td>
            <td>{{ d.author }}</td>
            <td><span class="status-pill" :class="`status-${d.status}`">{{ d.status }}</span></td>
            <td>
              <div class="curate-cell">
                <button class="chip-toggle" :class="{ on: hasScope(d, 'deep') }" type="button" title="deepdemos 主站可见" @click="toggleScope(d, 'deep')">主</button>
                <button class="chip-toggle chip-astra" :class="{ on: hasScope(d, 'astra') }" type="button" title="astrademos 橱窗可见" @click="toggleScope(d, 'astra')">窗</button>
                <select class="lang-mini" :value="d.lang || 'zh'" title="作品语言（橱窗策展参考）" @change="setLang(d, ($event.target as HTMLSelectElement).value as 'zh' | 'en')">
                  <option value="zh">中</option>
                  <option value="en">EN</option>
                </select>
              </div>
            </td>
            <td>{{ d.view_count }}</td>
            <td>{{ d.storage_size ? Math.round(d.storage_size / 1024) + ' KB' : '-' }}</td>
            <td>{{ d.inconsistency ? '不一致' : '正常' }}</td>
            <td>
              <RouterLink class="btn btn-sm btn-outline" :to="`/upload?slug=${d.slug}`">编辑</RouterLink>
              <button v-if="d.status !== 'approved'" class="btn btn-sm btn-primary" type="button" @click="setDemoStatus(d.slug, 'approve')">通过</button>
              <button v-if="d.status !== 'rejected'" class="btn btn-sm btn-dark" type="button" @click="setDemoStatus(d.slug, 'reject')">拒绝</button>
              <button class="btn btn-sm btn-danger" type="button" @click="deleteDemoRow(d)">删除</button>
            </td>
          </tr>
          <tr v-if="!demoPaged.length"><td colspan="8" style="text-align: center">没有匹配的 Demo</td></tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-if="demoPages > 1" :page="demoPage" :total="demoTotal" :page-size="demoPageSize" @change="setDemoPage" />
  </div>
</template>

<style scoped>
/* 策展单元格：主/窗 两枚开关章 + 语言下拉，窄身不抢表格空间 */
.curate-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.chip-toggle {
  border: 2px solid #000;
  background: #fff;
  color: #000;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  padding: 4px 7px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.chip-toggle.on {
  background: #000;
  color: #fff;
}
.chip-toggle.chip-astra.on {
  background: #4ecdc4;
  color: #000;
  border-color: #000;
}
.lang-mini {
  border: 2px solid #000;
  background: #fff;
  font: inherit;
  font-size: 12px;
  padding: 3px 2px;
  cursor: pointer;
}
</style>
