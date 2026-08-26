<script setup lang="ts">
defineOptions({ name: 'AdminAnnouncementsSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { Announcement } from '../../api/types'
import MarkdownEditor from '../MarkdownEditor.vue'
import { parseDate } from '../../utils/time'

function toLocalInput(iso: string): string {
  const d = parseDate(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const ui = useUiStore()

const announcements = ref<Announcement[]>([])
const newAnn = ref({ title: '', content: '', pinned: false, status: 'published' as 'draft' | 'published' | 'offline', category: 'general', published_at: '', expires_at: '' })
const annError = ref('')
const annOk = ref('')

const annTypeLabel: Record<string, string> = { manual: '手动公告', auto: '新发布', update: '站点更新', demo_update: '作品更新' }

const annFilter = ref<'all' | 'manual' | 'auto' | 'demo_update' | 'update'>('all')
const editingAnn = ref<Announcement | null>(null)
const editAnnForm = ref({ title: '', content: '', pinned: false, status: 'published' as 'draft' | 'published' | 'offline', category: 'general', published_at: '', expires_at: '' })

const filteredAnnouncements = computed(() =>
  annFilter.value === 'all' ? announcements.value : announcements.value.filter((a) => a.type === annFilter.value),
)

const annStatusFilter = ref<'all' | 'draft' | 'published' | 'offline'>('all')
const annCategoryFilter = ref('')
const annPinnedFilter = ref<'all' | 'pinned' | 'unpinned'>('all')
async function loadAnnouncements() {
  try {
    announcements.value = await api.adminListAnnouncements({
      status: annStatusFilter.value === 'all' ? undefined : annStatusFilter.value,
      category: annCategoryFilter.value.trim() || undefined,
      pinned: annPinnedFilter.value === 'all' ? undefined : annPinnedFilter.value === 'pinned',
    })
  } catch {
    announcements.value = []
  }
}

function startEditAnn(a: Announcement) {
  editingAnn.value = a
  editAnnForm.value = { title: a.title, content: a.content, pinned: !!a.pinned, status: a.status || 'published', category: a.category || 'general', published_at: a.published_at ? toLocalInput(a.published_at) : '', expires_at: a.expires_at ? toLocalInput(a.expires_at) : '' }
}

function cancelEditAnn() {
  editingAnn.value = null
}

async function saveEditAnn() {
  if (!editingAnn.value) return
  if (!editAnnForm.value.title.trim()) {
    ui.toast('公告标题必填', 'error')
    return
  }
  try {
    await api.updateAnnouncement(editingAnn.value.id, {
      title: editAnnForm.value.title.trim(),
      content: editAnnForm.value.content.trim(),
      pinned: editAnnForm.value.pinned,
      status: editAnnForm.value.status,
      category: editAnnForm.value.category.trim() || 'general',
      published_at: editAnnForm.value.published_at ? new Date(editAnnForm.value.published_at).toISOString() : null,
      expires_at: editAnnForm.value.expires_at ? new Date(editAnnForm.value.expires_at).toISOString() : null,
    })
    ui.toast('公告已更新', 'success')
    editingAnn.value = null
    await loadAnnouncements()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function createAnnouncement() {
  annError.value = ''
  annOk.value = ''
  if (!newAnn.value.title.trim()) {
    annError.value = '公告标题必填'
    return
  }
  try {
    await api.createAnnouncement({
      title: newAnn.value.title.trim(),
      content: newAnn.value.content.trim(),
      pinned: newAnn.value.pinned,
      status: newAnn.value.status,
      category: newAnn.value.category.trim() || 'general',
      published_at: newAnn.value.published_at ? new Date(newAnn.value.published_at).toISOString() : null,
      expires_at: newAnn.value.expires_at ? new Date(newAnn.value.expires_at).toISOString() : null,
    })
    ui.toast('公告已发布', 'success')
    newAnn.value = { title: '', content: '', pinned: false, status: 'published', category: 'general', published_at: '', expires_at: '' }
    await loadAnnouncements()
  } catch (e) {
    annError.value = (e as Error).message
  }
}

async function deleteAnnouncement(id: number) {
  const ok = await ui.confirm({
    title: '删除公告',
    message: '确定删除这条公告？',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await api.deleteAnnouncement(id)
    ui.toast('公告已删除', 'success')
    await loadAnnouncements()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

onMounted(loadAnnouncements)
</script>

<template>
  <div>
    <div class="card card-coral" style="padding: 20px; margin-bottom: 20px; max-width: 640px">
      <h2 style="margin-bottom: 12px">{{ editingAnn ? '编辑公告' : '发布手动公告' }}</h2>
      <div class="form-stack">
        <template v-if="editingAnn">
          <label class="field">
            标题
            <input v-model="editAnnForm.title" class="input" placeholder="公告标题" />
          </label>
          <label class="field">
            内容
            <MarkdownEditor v-model="editAnnForm.content" :rows="3" placeholder="公告内容（可选）" />
          </label>
          <label class="field" style="display: flex; gap: 8px; align-items: center">
            <input v-model="editAnnForm.pinned" type="checkbox" style="width: 18px; height: 18px" /> 置顶
          </label>
          <div class="filter-row" style="margin: 0">
            <select v-model="editAnnForm.status" class="input" style="max-width: 120px">
              <option value="draft">草稿</option>
              <option value="published">发布</option>
              <option value="offline">下线</option>
            </select>
            <input v-model="editAnnForm.category" class="input" style="max-width: 140px" placeholder="分类（如 general/system/demo）" />
          </div>
          <div class="filter-row" style="margin: 0">
            <label class="field" style="margin: 0">发布时间 <input v-model="editAnnForm.published_at" class="input" type="datetime-local" /></label>
            <label class="field" style="margin: 0">过期时间 <input v-model="editAnnForm.expires_at" class="input" type="datetime-local" /></label>
          </div>
          <div class="filter-row" style="margin-bottom: 0">
            <button class="btn btn-primary" type="button" @click="saveEditAnn">保存修改</button>
            <button class="btn btn-sm btn-dark" type="button" @click="cancelEditAnn">取消</button>
          </div>
        </template>
        <template v-else>
          <label class="field">
            标题
            <input v-model="newAnn.title" class="input" placeholder="公告标题" />
          </label>
          <label class="field">
            内容
            <MarkdownEditor v-model="newAnn.content" :rows="3" placeholder="公告内容（可选）" />
          </label>
          <label class="field" style="display: flex; gap: 8px; align-items: center">
            <input v-model="newAnn.pinned" type="checkbox" style="width: 18px; height: 18px" /> 置顶
          </label>
          <div class="filter-row" style="margin: 0">
            <select v-model="newAnn.status" class="input" style="max-width: 120px">
              <option value="draft">草稿</option>
              <option value="published">发布</option>
              <option value="offline">下线</option>
            </select>
            <input v-model="newAnn.category" class="input" style="max-width: 140px" placeholder="分类（如 general/system/demo）" />
          </div>
          <div class="filter-row" style="margin: 0">
            <label class="field" style="margin: 0">发布时间 <input v-model="newAnn.published_at" class="input" type="datetime-local" /></label>
            <label class="field" style="margin: 0">过期时间 <input v-model="newAnn.expires_at" class="input" type="datetime-local" /></label>
          </div>
          <div class="filter-row" style="margin-bottom: 0">
            <button class="btn btn-primary" type="button" @click="createAnnouncement">发布公告</button>
            <span v-if="annError" class="notice notice-error" style="margin: 0">{{ annError }}</span>
            <span v-if="annOk" class="notice notice-success" style="margin: 0">{{ annOk }}</span>
          </div>
        </template>
      </div>
    </div>

    <div class="filter-row">
      <button
        v-for="f in ['all', 'manual', 'auto', 'demo_update', 'update']"
        :key="f"
        class="tag-chip"
        :class="{ active: annFilter === f }"
        type="button"
        @click="annFilter = f as typeof annFilter"
      >
        {{ f === 'all' ? '全部' : annTypeLabel[f] || f }}
      </button>
    </div>

    <div class="filter-row" style="margin-top: 8px">
      <select v-model="annStatusFilter" class="input" style="max-width: 120px" @change="loadAnnouncements">
        <option value="all">全部状态</option>
        <option value="draft">草稿</option>
        <option value="published">已发布</option>
        <option value="offline">已下线</option>
      </select>
      <input v-model="annCategoryFilter" class="input" style="max-width: 160px" placeholder="分类筛选" @change="loadAnnouncements" />
      <select v-model="annPinnedFilter" class="input" style="max-width: 120px" @change="loadAnnouncements">
        <option value="all">全部置顶</option>
        <option value="pinned">仅置顶</option>
        <option value="unpinned">非置顶</option>
      </select>
    </div>

    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>类型</th><th>置顶</th><th>状态</th><th>分类</th><th>标题</th><th>内容</th><th>时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in filteredAnnouncements" :key="a.id">
            <td>
              <span class="status-pill">{{ annTypeLabel[a.type] || a.type }}</span>
              <span v-if="a.type !== 'manual'" class="status-pill status-pending" style="margin-left: 4px">系统</span>
            </td>
            <td>{{ a.pinned ? '置顶' : '-' }}</td>
            <td><span class="ann-status" :class="'status-' + (a.status || 'published')">{{ a.status || 'published' }}</span></td>
            <td>{{ a.category || '-' }}</td>
            <td>{{ a.title }}</td>
            <td style="max-width: 320px; overflow-wrap: anywhere">{{ a.content }}</td>
            <td>{{ parseDate(a.created_at).toLocaleString('zh-CN') }}</td>
            <td>
              <RouterLink v-if="a.demo_slug" class="btn btn-sm btn-outline" :to="`/demo/${a.demo_slug}`">查看</RouterLink>
              <button v-if="a.type === 'manual'" class="btn btn-sm btn-outline" type="button" @click="startEditAnn(a)">编辑</button>
              <button class="btn btn-sm btn-danger" type="button" @click="deleteAnnouncement(a.id)">删除</button>
            </td>
          </tr>
          <tr v-if="!filteredAnnouncements.length">
            <td colspan="8" style="text-align: center">暂无公告</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
