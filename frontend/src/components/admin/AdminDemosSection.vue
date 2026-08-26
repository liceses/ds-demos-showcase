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

const demoFiltered = computed(() => {
  let items = demos.value
  if (demoStatus.value !== 'all') items = items.filter((d) => d.status === demoStatus.value)
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
      </div>
    </div>

    <LoadingRow v-if="loading" text="加载 Demo…" />
    <div v-else class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>标题</th><th>作者</th><th>状态</th><th>浏览</th><th>存储</th><th>一致性</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in demoPaged" :key="d.slug" :class="{ inconsistent: d.inconsistency }">
            <td><RouterLink :to="`/demo/${d.slug}`">{{ d.title }}</RouterLink></td>
            <td>{{ d.author }}</td>
            <td><span class="status-pill" :class="`status-${d.status}`">{{ d.status }}</span></td>
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
          <tr v-if="!demoPaged.length"><td colspan="7" style="text-align: center">没有匹配的 Demo</td></tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-if="demoPages > 1" :page="demoPage" :total="demoTotal" :page-size="demoPageSize" @change="setDemoPage" />
  </div>
</template>
