<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useUiStore } from '../stores/ui'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import PaginationBar from '../components/PaginationBar.vue'
import type { AdminDemo, AdminUser, Announcement, DemoDetail, ForumReply, ForumReport, ForumTopic, Settings, TagKeyInfo, TagSuggestion } from '../api/types'

const ui = useUiStore()

const tab = ref<'review' | 'demos' | 'tags' | 'forum' | 'users' | 'settings' | 'announcements'>('review')
const tagSub = ref<'keys' | 'review'>('keys')
const adminActiveKey = ref('')
const adminActiveTagKey = computed(() => tagKeys.value.find((k) => k.key === adminActiveKey.value) || null)
function selectAdminKey(k: TagKeyInfo) {
  adminActiveKey.value = k.key
  startEditKey(k)
}

const pending = ref<DemoDetail[]>([])
const demos = ref<AdminDemo[]>([])
const tagKeys = ref<TagKeyInfo[]>([])
const users = ref<AdminUser[]>([])
const settings = ref<Settings>({ auto_approve: true, auto_approve_public: false })
const announcements = ref<Announcement[]>([])
const storageInfo = ref<{ oss_enabled: boolean; mode: string; local_demos: number; local_files: number; local_size_bytes: number }>({
  oss_enabled: false,
  mode: 'local',
  local_demos: 0,
  local_files: 0,
  local_size_bytes: 0,
})
const storageModeLabel = computed(() => {
  if (storageInfo.value.mode === 'oss') return 'OSS 直连'
  if (storageInfo.value.mode === 'oss_backup') return '本地存储（OSS 备份）'
  return '本地存储'
})

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
  editAnnForm.value = { title: a.title, content: a.content, pinned: !!a.pinned, status: a.status || 'published', category: a.category || 'general', published_at: a.published_at ? a.published_at.slice(0, 16) : '', expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '' }
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
    announcements.value = await api.listAnnouncements()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

// 标签键管理
const newKey = ref({ key: '', mode: 'fixed' as 'fixed' | 'open' | 'int', label: '', description: '', sort: 0 })
const keyError = ref('')
const keyOk = ref('')
const newValue = ref({ key: '', value: '', description: '' })
const valueError = ref('')
const valueOk = ref('')

const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }

const loading = ref(false)
const error = ref('')

// ---------- 论坛管理 ----------
const forumSub = ref<'topics' | 'replies' | 'reports'>('topics')
const forumTopics = ref<ForumTopic[]>([])
const forumRepliesByTopic = ref<Record<number, ForumReply[]>>({})
const forumReports = ref<ForumReport[]>([])
const forumStatusFilter = ref<'all' | 'normal' | 'hidden' | 'reviewing'>('all')
const forumCategoryFilter = ref('')
const forumPinnedFilter = ref<'all' | 'pinned' | 'unpinned'>('all')

async function loadForum() {
  try {
    forumTopics.value = (await api.adminListForumTopics({})).items
  } catch {
    forumTopics.value = []
  }
}
async function loadForumReports() {
  try {
    forumReports.value = await api.listForumReports()
  } catch {
    forumReports.value = []
  }
}
const filteredForumTopics = computed(() => {
  let items = forumTopics.value
  if (forumStatusFilter.value !== 'all') items = items.filter((t) => t.status === forumStatusFilter.value)
  if (forumCategoryFilter.value) items = items.filter((t) => t.category.includes(forumCategoryFilter.value))
  if (forumPinnedFilter.value !== 'all') items = items.filter((t) => t.pinned === (forumPinnedFilter.value === 'pinned'))
  return items
})
async function forumReviewTopic(t: ForumTopic, action: 'approve' | 'reject') {
  try {
    await api.adminReviewForumTopic(t.id, action)
    ui.toast(action === 'approve' ? '已通过' : '已隐藏', 'success')
    await loadForum()
  } catch (e) { ui.toast((e as Error).message, 'error') }
}
async function forumPatchTopic(t: ForumTopic, patch: { pinned?: boolean; sticky?: boolean; status?: string }) {
  try {
    await api.adminUpdateForumTopic(t.id, patch)
    ui.toast('已更新', 'success')
    await loadForum()
  } catch (e) { ui.toast((e as Error).message, 'error') }
}
async function forumDeleteTopic(t: ForumTopic) {
  const ok = await ui.confirm({ title: '删除主题', message: `确定删除「${t.title}」？`, confirmText: '删除', danger: true })
  if (!ok) return
  try {
    await api.adminDeleteForumTopic(t.id)
    ui.toast('已删除', 'success')
    await loadForum()
  } catch (e) { ui.toast((e as Error).message, 'error') }
}
async function forumDeleteReply(r: ForumReply) {
  const ok = await ui.confirm({ title: '删除回复', message: '确定删除该回复？', confirmText: '删除', danger: true })
  if (!ok) return
  try {
    await api.adminDeleteForumReply(r.id)
    ui.toast('已删除', 'success')
    forumRepliesByTopic.value = {}
    await loadForum()
  } catch (e) { ui.toast((e as Error).message, 'error') }
}
const forumReplyTopicId = ref<number | null>(null)
const forumRepliesShown = ref<ForumReply[]>([])
async function forumSelectReplies() {
  if (forumReplyTopicId.value == null) { forumRepliesShown.value = []; return }
  try { forumRepliesShown.value = await api.listForumReplies(forumReplyTopicId.value) } catch { forumRepliesShown.value = [] }
}
async function forumReviewReply(r: ForumReply, action: 'approve' | 'reject') {
  try {
    await api.adminReviewForumReply(r.id, action)
    ui.toast(action === 'approve' ? '已通过' : '已隐藏', 'success')
    await forumSelectReplies()
  } catch (e) { ui.toast((e as Error).message, 'error') }
}

async function forumHandleReport(r: ForumReport, action: 'handle' | 'ignore') {
  try {
    await api.handleForumReport(r.id, action)
    ui.toast(action === 'handle' ? '已处理' : '已忽略', 'success')
    await loadForumReports()
  } catch (e) { ui.toast((e as Error).message, 'error') }
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [p, d, t, u, s, a, st] = await Promise.all([
      api.adminReview(),
      api.adminDemos(),
      api.listTagKeys(),
      api.adminUsers(),
      api.getSettings(),
      api.listAnnouncements(),
      api.storageStatus(),
    ])
    pending.value = p
    demos.value = d
    tagKeys.value = t
    users.value = u
    settings.value = s
    announcements.value = a
    storageInfo.value = st
    await Promise.all([loadForum(), loadForumReports()])
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function createTagKey() {
  keyError.value = ''
  keyOk.value = ''
  if (!newKey.value.key.trim() || !newKey.value.label.trim()) {
    keyError.value = 'key 和 label 必填'
    return
  }
  try {
    await api.createTagKey({
      key: newKey.value.key.trim(),
      mode: newKey.value.mode,
      label: newKey.value.label.trim(),
      description: newKey.value.description.trim(),
      sort: Number(newKey.value.sort) || 0,
    })
    keyOk.value = '标签键已创建'
    newKey.value = { key: '', mode: 'fixed', label: '', description: '', sort: 0 }
    tagKeys.value = await api.listTagKeys()
  } catch (e) {
    keyError.value = (e as Error).message
  }
}

async function deleteTagKey(key: string) {
  const ok = await ui.confirm({
    title: '删除标签键',
    message: `确定删除标签键「${key}」？其下未被引用的值会一并删除。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await api.deleteTagKey(key)
    ui.toast('标签键已删除', 'success')
    tagKeys.value = await api.listTagKeys()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function addFixedValue() {
  valueError.value = ''
  valueOk.value = ''
  if (!newValue.value.key || !newValue.value.value.trim()) {
    valueError.value = '请选择固定键并填写 value'
    return
  }
  try {
    await api.createTag(newValue.value.key, newValue.value.value.trim(), newValue.value.description.trim() || undefined)
    valueOk.value = '固定值已添加'
    newValue.value = { key: newValue.value.key, value: '', description: '' }
    tagKeys.value = await api.listTagKeys()
  } catch (e) {
    valueError.value = (e as Error).message
  }
}

async function deleteTagValue(key: string, value: string) {
  const ok = await ui.confirm({
    title: '删除标签值',
    message: `确定删除 ${key}:${value}？`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await api.deleteTagValue(key, value)
    ui.toast('标签值已删除', 'success')
    tagKeys.value = await api.listTagKeys()
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
    announcements.value = await api.listAnnouncements()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function review(slug: string, action: 'approve' | 'reject') {
  const idx = pending.value.findIndex((d) => d.slug === slug)
  const item = idx >= 0 ? pending.value[idx] : null
  if (item) pending.value.splice(idx, 1)
  if (action === 'approve' && item) {
    const inDemos = demos.value.find((d) => d.slug === slug)
    if (inDemos) inDemos.status = 'approved'
    else demos.value.unshift({ ...item, storage_size: 0, inconsistency: false } as AdminDemo)
  }
  try {
    await api.adminApprove(slug, action)
    ui.toast(action === 'approve' ? '已通过' : '已拒绝', 'success')
  } catch (e) {
    if (item) pending.value.splice(idx, 0, item)
    ui.toast((e as Error).message, 'error')
  }
}

async function toggleUser(u: AdminUser, field: 'role' | 'status') {
  try {
    if (field === 'role') {
      await api.updateUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })
    } else {
      await api.updateUser(u.id, { status: u.status === 'active' ? 'suspended' : 'active' })
    }
    users.value = await api.adminUsers()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function saveSettings() {
  try {
    settings.value = await api.updateSettings(settings.value)
    ui.toast('设置已保存', 'success')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

const ossSyncing = ref(false)
const ossSyncProgress = ref('')
async function runOssSync(force = false) {
  if (ossSyncing.value) return
  ossSyncing.value = true
  ossSyncProgress.value = ''
  try {
    const r = await api.ossSync(force)
    if (!r.started) {
      ui.toast('已有同步任务在进行中，请稍候', 'info')
    }
    // 轮询后台任务直到结束
    for (;;) {
      const job = await api.getOssSyncStatus()
      if (job.total) ossSyncProgress.value = `${job.done}/${job.total}`
      if (!job.running) {
        ui.toast(
          `OSS ${force ? '强制全量' : ''}同步完成：demo ${job.ok} 成功 / ${job.fail} 失败，封面 ${job.covers_ok} 成功 / ${job.covers_fail} 失败${job.last_error ? '，最后错误：' + job.last_error : ''}`,
          job.fail || job.covers_fail ? 'error' : 'success',
        )
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    ossSyncing.value = false
    ossSyncProgress.value = ''
  }
}

function fmtSize(n: number) {
  if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + ' GB'
  if (n >= 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}

// ---------- 概览统计 ----------
const dashStats = computed(() => {
  const statuses = demos.value.reduce(
    (acc, d) => {
      acc[d.status as 'approved'] = (acc[d.status as 'approved'] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  return {
    total: demos.value.length,
    approved: statuses.approved || 0,
    pending: pending.value.length,
    rejected: statuses.rejected || 0,
    users: users.value.length,
    recent: [...demos.value]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 5),
  }
})

// ---------- Demo 管理：搜索 / 状态筛选 / 分页 ----------
const demoQuery = ref('')
const demoStatus = ref<'all' | 'approved' | 'pending' | 'rejected'>('all')
const demoPage = ref(1)
const demoPageSize = 8

const demoFiltered = computed(() =>
  demos.value.filter((d) => {
    if (demoStatus.value !== 'all' && d.status !== demoStatus.value) return false
    const q = demoQuery.value.trim().toLowerCase()
    if (!q) return true
    return (
      d.title.toLowerCase().includes(q) ||
      d.author.toLowerCase().includes(q) ||
      d.slug.toLowerCase().includes(q) ||
      d.tags.some((t) => `${t.key}:${t.value}`.toLowerCase().includes(q))
    )
  }),
)
const demoTotal = computed(() => demoFiltered.value.length)
const demoPages = computed(() => Math.max(1, Math.ceil(demoTotal.value / demoPageSize)))
const demoPaged = computed(() => demoFiltered.value.slice((demoPage.value - 1) * demoPageSize, demoPage.value * demoPageSize))
function setDemoPage(p: number) {
  demoPage.value = Math.min(Math.max(1, p), demoPages.value)
}

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
  const ok = await ui.confirm({
    title: '删除 Demo',
    message: `确定删除「${d.title}」？本地文件与 OSS 对象都会被清理，不可恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  const idx = demos.value.findIndex((x) => x.slug === d.slug)
  const removed = idx >= 0 ? demos.value[idx] : null
  if (idx >= 0) demos.value.splice(idx, 1)
  const pIdx = pending.value.findIndex((x) => x.slug === d.slug)
  const pRemoved = pIdx >= 0 ? pending.value[pIdx] : null
  if (pIdx >= 0) pending.value.splice(pIdx, 1)
  try {
    await api.deleteDemo(d.slug)
    ui.toast('Demo 已删除', 'success')
  } catch (e) {
    if (removed) demos.value.splice(idx, 0, removed)
    if (pRemoved) pending.value.splice(pIdx, 0, pRemoved)
    ui.toast((e as Error).message, 'error')
  }
}

// ---------- 标签键编辑 ----------
const editingKey = ref<TagKeyInfo | null>(null)
const editKeyForm = ref({ mode: 'fixed' as 'fixed' | 'open' | 'int', label: '', description: '', sort: 0 })
const keyEditError = ref('')
function startEditKey(k: TagKeyInfo) {
  editingKey.value = k
  editKeyForm.value = { mode: k.mode, label: k.label, description: k.description, sort: k.sort ?? 0 }
  keyEditError.value = ''
}
async function saveEditKey() {
  if (!editingKey.value) return
  if (!editKeyForm.value.label.trim()) {
    keyEditError.value = 'label 必填'
    return
  }
  try {
    await api.updateTagKey(editingKey.value.key, {
      mode: editKeyForm.value.mode,
      label: editKeyForm.value.label.trim(),
      description: editKeyForm.value.description.trim(),
      sort: Number(editKeyForm.value.sort) || 0,
    })
    ui.toast('标签键已更新', 'success')
    editingKey.value = null
    tagKeys.value = await api.listTagKeys()
  } catch (e) {
    keyEditError.value = (e as Error).message
  }
}

// ---------- 标签审核 / AI 整理 ----------
const suggestions = ref<TagSuggestion[]>([])
const aiDemoSlug = ref('')
const aiText = ref('')
const aiResult = ref<{ key: string; value: string; reason: string }[]>([])
const aiChecked = ref<Record<string, boolean>>({})
const aiNote = ref('')
const aiLoading = ref(false)

async function loadSuggestions() {
  try {
    suggestions.value = await api.listTagSuggestions('pending')
  } catch {
    suggestions.value = []
  }
}

async function approveSuggestion(s: TagSuggestion) {
  try {
    await api.reviewTagSuggestion(s.id, 'approve', s.group || undefined)
    ui.toast('已批准', 'success')
    await loadSuggestions()
    tagKeys.value = await api.listTagKeys()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function rejectSuggestion(s: TagSuggestion) {
  try {
    await api.reviewTagSuggestion(s.id, 'reject')
    ui.toast('已拒绝', 'success')
    await loadSuggestions()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function runFetchModels() {
  try {
    const r = await api.fetchModels()
    ui.toast(`已写入 ${r.created} 条模型建议`, 'success')
    await loadSuggestions()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function runAiSuggest() {
  aiLoading.value = true
  aiResult.value = []
  aiChecked.value = {}
  aiNote.value = ''
  try {
    const demo = demos.value.find((d) => d.slug === aiDemoSlug.value)
    const text = aiText.value.trim() || demo?.description || undefined
    const r = await api.aiSuggest({ text })
    aiResult.value = r.suggestions
    aiNote.value = r.note
    for (const s of r.suggestions) aiChecked.value[s.key + ':' + s.value] = true
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    aiLoading.value = false
  }
}

async function saveAiTags() {
  const demo = demos.value.find((d) => d.slug === aiDemoSlug.value)
  if (!demo) {
    ui.toast('请先选择 Demo', 'error')
    return
  }
  const checked = aiResult.value.filter((s) => aiChecked.value[s.key + ':' + s.value])
  if (!checked.length) {
    ui.toast('未勾选任何推荐标签', 'error')
    return
  }
  const existing = demo.tags.map((t) => `${t.key}:${t.value}`)
  const merged = [...existing]
  for (const s of checked) {
    const kv = `${s.key}:${s.value}`
    if (!merged.includes(kv)) merged.push(kv)
  }
  try {
    await api.updateDemo(demo.slug, { tags: merged })
    ui.toast('标签已保存', 'success')
    await loadAll()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

onMounted(loadAll)
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">管理后台</span>
    <h1 class="huge">管理</h1>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'review' }" type="button" @click="tab = 'review'">
        审核队列
        <span v-if="pending.length" class="badge">{{ pending.length }}</span>
      </button>
      <button class="tab" :class="{ active: tab === 'demos' }" type="button" @click="tab = 'demos'">Demo 管理</button>
      <button class="tab" :class="{ active: tab === 'tags' }" type="button" @click="tab = 'tags'">标签管理</button>
      <button class="tab" :class="{ active: tab === 'forum' }" type="button" @click="tab = 'forum'; loadForum()">论坛管理</button>
      <button class="tab" :class="{ active: tab === 'users' }" type="button" @click="tab = 'users'">用户管理</button>
      <button class="tab" :class="{ active: tab === 'announcements' }" type="button" @click="tab = 'announcements'">公告管理</button>
      <button class="tab" :class="{ active: tab === 'settings' }" type="button" @click="tab = 'settings'">站点设置</button>
      <RouterLink class="tab" style="text-decoration: none" to="/admin/sponsors">赞助/致谢</RouterLink>
    </div>

    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载后台…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <template v-else>
      <!-- 概览统计 -->
      <div class="dash-stats">
        <div class="stat-card"><b>{{ dashStats.total }}</b>总作品</div>
        <div class="stat-card stat-ok"><b>{{ dashStats.approved }}</b>已上线</div>
        <div class="stat-card stat-warn"><b>{{ dashStats.pending }}</b>待审</div>
        <div class="stat-card stat-err"><b>{{ dashStats.rejected }}</b>已拒</div>
        <div class="stat-card"><b>{{ dashStats.users }}</b>用户</div>
        <div class="stat-card"><b>{{ storageModeLabel }}</b>存储</div>
      </div>

      <Transition name="tab-pane" mode="out-in">
        <div :key="tab" class="tab-pane">
          <!-- 审核队列 -->
          <template v-if="tab === 'review'">
            <div v-if="!pending.length" class="empty-box">没有待审核的 Demo</div>
            <div v-for="d in pending" :key="d.slug" class="card card-sunny" style="padding: 18px; margin-bottom: 18px">
              <div class="section-head" style="margin-bottom: 8px">
                <h2>{{ d.title }}</h2>
                <span class="status-pill status-pending">pending</span>
              </div>
              <p class="muted" style="margin-bottom: 12px">{{ d.description }}</p>
              <div class="filter-row" style="margin-bottom: 12px">
                <span v-for="t in d.tags" :key="t.key + ':' + t.value" class="tag-chip">{{ t.key }}:{{ t.value }}</span>
              </div>
              <div class="filter-row" style="margin-bottom: 0">
                <button class="btn btn-sm btn-primary" type="button" @click="review(d.slug, 'approve')">通过</button>
                <button class="btn btn-sm btn-dark" type="button" @click="review(d.slug, 'reject')">拒绝</button>
                <RouterLink class="btn btn-sm btn-outline" :to="`/demo/${d.slug}`">预览</RouterLink>
              </div>
            </div>
          </template>

          <!-- Demo 管理 -->
          <template v-else-if="tab === 'demos'">
            <div class="filter-row" style="margin-bottom: 14px">
              <div class="search-box" style="flex: 1">
                <input
                  v-model="demoQuery"
                  class="input"
                  type="search"
                  placeholder="搜索标题 / 作者 / slug / 标签…"
                  @input="demoPage = 1"
                />
                <span class="search-icon">Q</span>
              </div>
              <div class="tabs" style="margin: 0">
                <button class="tab" :class="{ active: demoStatus === 'all' }" type="button" @click="demoStatus = 'all'; demoPage = 1">全部</button>
                <button class="tab" :class="{ active: demoStatus === 'approved' }" type="button" @click="demoStatus = 'approved'; demoPage = 1">已上线</button>
                <button class="tab" :class="{ active: demoStatus === 'pending' }" type="button" @click="demoStatus = 'pending'; demoPage = 1">待审</button>
                <button class="tab" :class="{ active: demoStatus === 'rejected' }" type="button" @click="demoStatus = 'rejected'; demoPage = 1">已拒</button>
              </div>
            </div>

            <div class="table-wrap">
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
                      <button
                        v-if="d.status !== 'approved'"
                        class="btn btn-sm btn-primary"
                        type="button"
                        @click="setDemoStatus(d.slug, 'approve')"
                      >通过</button>
                      <button
                        v-if="d.status !== 'rejected'"
                        class="btn btn-sm btn-dark"
                        type="button"
                        @click="setDemoStatus(d.slug, 'reject')"
                      >拒绝</button>
                      <button class="btn btn-sm btn-danger" type="button" @click="deleteDemoRow(d)">删除</button>
                    </td>
                  </tr>
                  <tr v-if="!demoPaged.length">
                    <td colspan="7" style="text-align: center">没有匹配的 Demo</td>
                  </tr>
                </tbody>
              </table>
            </div>

                        <PaginationBar v-if="demoPages > 1" :page="demoPage" :total="demoTotal" :page-size="demoPageSize" @change="setDemoPage" />
          </template>

          <!-- 标签管理 -->
          <template v-else-if="tab === 'tags' && tagSub === 'keys'">
            <div class="filter-row" style="margin-bottom: 14px">
              <button class="tab" :class="{ active: String(tagSub) === 'keys' }" type="button" @click="tagSub = 'keys'">键管理</button>
              <button class="tab" :class="{ active: String(tagSub) === 'review' }" type="button" @click="tagSub = 'review'; loadSuggestions()">审核 / AI</button>
            </div>
            <!-- 新建键 -->
            <div class="card card-mint" style="padding: 16px 20px; margin-bottom: 16px; max-width: 720px">
              <h2 style="margin-bottom: 10px">新建标签键</h2>
              <div class="form-stack">
                <div class="filter-row" style="margin-bottom: 0">
                  <input v-model="newKey.key" class="input" style="max-width: 140px" placeholder="key" />
                  <select v-model="newKey.mode" class="input" style="max-width: 120px">
                    <option value="fixed">固定值</option>
                    <option value="open">自由值</option>
                    <option value="int">数字值</option>
                  </select>
                  <input v-model="newKey.label" class="input" style="max-width: 140px" placeholder="显示名" />
                  <input v-model.number="newKey.sort" class="input" style="max-width: 80px" type="number" placeholder="排序" />
                  <button class="btn btn-secondary" type="button" @click="createTagKey">创建</button>
                </div>
                <input v-model="newKey.description" class="input" placeholder="键介绍（可选）" />
                <span v-if="keyError" class="notice notice-error" style="margin: 0">{{ keyError }}</span>
                <span v-if="keyOk" class="notice notice-success" style="margin: 0">{{ keyOk }}</span>
              </div>
            </div>

            <!-- 两栏：键列表 + 键详情 -->
            <div class="tag-pane tag-pane-tall">
              <div class="tag-pane-keys">
                <template v-for="m in (['fixed', 'open', 'int'] as const)" :key="m">
                  <div v-if="tagKeys.some((k) => k.mode === m)" class="tag-pane-group-label">{{ modeLabel[m] }}</div>
                  <button
                    v-for="k in tagKeys.filter((k) => k.mode === m)"
                    :key="k.key"
                    class="tag-pane-key"
                    :class="{ active: adminActiveKey === k.key }"
                    type="button"
                    @click="selectAdminKey(k)"
                  >
                    <span class="tag-pane-key-label">{{ k.label || k.key }} <code>{{ k.key }}</code></span>
                    <span class="tag-pane-key-count">{{ k.demo_count }}</span>
                  </button>
                </template>
              </div>
              <div class="tag-pane-values">
                <template v-if="adminActiveTagKey">
                  <div class="tag-key-head">
                    <b>{{ adminActiveTagKey.label || adminActiveTagKey.key }} <code>{{ adminActiveTagKey.key }}</code></b>
                    <span class="mode-badge" :class="'mode-badge-' + adminActiveTagKey.mode">{{ modeLabel[adminActiveTagKey.mode] }}</span>
                  </div>
                  <p class="muted" style="margin: 0 0 10px">{{ adminActiveTagKey.description || '暂无介绍' }}</p>

                  <div class="form-stack" style="margin-bottom: 12px">
                    <div class="filter-row" style="margin: 0">
                      <select v-model="editKeyForm.mode" class="input" style="max-width: 120px">
                        <option value="fixed">固定值</option>
                        <option value="open">自由值</option>
                        <option value="int">数字值</option>
                      </select>
                      <input v-model="editKeyForm.label" class="input" style="max-width: 140px" placeholder="显示名" />
                      <input v-model.number="editKeyForm.sort" class="input" style="max-width: 80px" type="number" placeholder="排序" />
                      <button class="btn btn-sm btn-primary" type="button" @click="saveEditKey">保存</button>
                    </div>
                    <input v-model="editKeyForm.description" class="input" placeholder="键介绍（可选）" />
                    <span v-if="keyEditError" class="notice notice-error" style="margin: 0">{{ keyEditError }}</span>
                  </div>

                  <div v-if="adminActiveTagKey.mode === 'fixed'" class="form-stack" style="margin-bottom: 12px">
                    <div class="filter-row" style="margin: 0">
                      <input v-model="newValue.value" class="input" style="max-width: 140px" placeholder="value" />
                      <input v-model="newValue.description" class="input" style="max-width: 180px" placeholder="介绍（可选）" />
                      <button class="btn btn-sm btn-secondary" type="button" @click="newValue.key = adminActiveTagKey.key; addFixedValue()">添加固定值</button>
                    </div>
                    <span v-if="valueError" class="notice notice-error" style="margin: 0">{{ valueError }}</span>
                    <span v-if="valueOk" class="notice notice-success" style="margin: 0">{{ valueOk }}</span>
                  </div>

                  <div class="filter-row" style="margin: 0; gap: 6px">
                    <template v-for="v in adminActiveTagKey.values" :key="v.value">
                      <RouterLink class="tag-chip" :class="'mode-' + adminActiveTagKey.mode" :to="`/tag/${adminActiveTagKey.key}/${v.value}`">{{ v.value }}<span class="count">{{ v.demo_count }}</span></RouterLink>
                      <button class="btn btn-sm btn-danger" type="button" style="padding: 2px 6px" title="删除该值" @click="deleteTagValue(adminActiveTagKey.key, v.value)">×</button>
                    </template>
                    <span v-if="!adminActiveTagKey.values.length" class="muted">无</span>
                  </div>

                  <div class="filter-row" style="margin-top: 14px">
                    <button class="btn btn-sm btn-dark" type="button" @click="deleteTagKey(adminActiveTagKey.key)">删除键</button>
                  </div>
                </template>
                <div v-else class="muted">请选择左侧标签键</div>
              </div>
            </div>
          </template>

          <!-- 标签审核 / AI 整理（并入标签管理） -->
          <template v-else-if="tab === 'tags' && tagSub === 'review'">
            <div class="filter-row" style="margin-bottom: 14px">
              <button class="tab" :class="{ active: String(tagSub) === 'keys' }" type="button" @click="tagSub = 'keys'">键管理</button>
              <button class="tab" :class="{ active: String(tagSub) === 'review' }" type="button" @click="tagSub = 'review'; loadSuggestions()">审核 / AI</button>
            </div>
            <div class="card card-coral" style="padding: 20px; margin-bottom: 20px; max-width: 720px">
              <h2 style="margin-bottom: 12px">AI 整理标签</h2>
              <div class="form-stack">
                <div class="filter-row" style="margin: 0">
                  <select v-model="aiDemoSlug" class="input" style="max-width: 260px">
                    <option value="">选择 Demo…</option>
                    <option v-for="d in demos" :key="d.slug" :value="d.slug">{{ d.title }}（{{ d.slug }}）</option>
                  </select>
                  <input v-model="aiText" class="input" style="flex: 1" placeholder="或直接粘贴描述文本（可选）" />
                  <button class="btn btn-secondary" type="button" :disabled="aiLoading" @click="runAiSuggest">{{ aiLoading ? '分析中…' : 'AI 推荐' }}</button>
                  <button class="btn btn-outline" type="button" @click="runFetchModels">写入主流模型建议</button>
                </div>
                <div v-if="aiResult.length" class="form-stack">
                  <div class="filter-row" style="margin: 0">
                    <span class="filter-label">推荐</span>
                    <label v-for="s in aiResult" :key="s.key + ':' + s.value" class="tag-chip" :class="{ active: aiChecked[s.key + ':' + s.value] }" style="cursor: pointer">
                      <input v-model="aiChecked[s.key + ':' + s.value]" type="checkbox" style="display: none" />
                      {{ s.key }}:{{ s.value }}<span class="count">{{ s.reason }}</span>
                    </label>
                  </div>
                  <p v-if="aiNote" class="hint">{{ aiNote }}</p>
                  <div class="filter-row" style="margin: 0">
                    <button class="btn btn-primary" type="button" @click="saveAiTags">保存到 Demo</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="section-head">
              <h2 class="section-title">待审固定值建议</h2>
            </div>
            <div v-if="!suggestions.length" class="empty-box">暂无待审建议</div>
            <div v-else class="table-wrap">
              <table class="data">
                <thead><tr><th>键</th><th>值</th><th>说明</th><th>分组</th><th>时间</th><th>操作</th></tr></thead>
                <tbody>
                  <tr v-for="s in suggestions" :key="s.id">
                    <td>{{ s.key }}</td>
                    <td><b>{{ s.value }}</b></td>
                    <td style="max-width: 240px; overflow-wrap: anywhere">{{ s.description }}</td>
                    <td>{{ s.group || '-' }}</td>
                    <td>{{ new Date(s.created_at).toLocaleString('zh-CN') }}</td>
                    <td>
                      <button class="btn btn-sm btn-primary" type="button" @click="approveSuggestion(s)">批准</button>
                      <button class="btn btn-sm btn-dark" type="button" @click="rejectSuggestion(s)">拒绝</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>


          <!-- 论坛管理 -->
          <template v-else-if="tab === 'forum'">
            <div class="filter-row" style="margin-bottom: 14px">
              <button class="tab" :class="{ active: forumSub === 'topics' }" type="button" @click="forumSub = 'topics'">主题</button>
              <button class="tab" :class="{ active: forumSub === 'replies' }" type="button" @click="forumSub = 'replies'">回复</button>
              <button class="tab" :class="{ active: forumSub === 'reports' }" type="button" @click="forumSub = 'reports'; loadForumReports()">举报</button>
            </div>

            <template v-if="forumSub === 'topics'">
              <div class="filter-row" style="margin-bottom: 12px">
                <select v-model="forumStatusFilter" class="input" style="max-width: 120px">
                  <option value="all">全部状态</option>
                  <option value="normal">正常</option>
                  <option value="reviewing">审核中</option>
                  <option value="hidden">隐藏</option>
                </select>
                <input v-model="forumCategoryFilter" class="input" style="max-width: 140px" placeholder="分类筛选" @change="loadForum" />
                <select v-model="forumPinnedFilter" class="input" style="max-width: 120px" @change="loadForum">
                  <option value="all">全部置顶</option>
                  <option value="pinned">仅置顶</option>
                  <option value="unpinned">非置顶</option>
                </select>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>标题</th><th>作者</th><th>分类</th><th>状态</th><th>置顶</th><th>加精</th><th>回复</th><th>时间</th><th>操作</th></tr></thead>
                  <tbody>
                    <tr v-for="t in filteredForumTopics" :key="t.id">
                      <td>{{ t.title }}</td>
                      <td>{{ t.author || '匿名' }}</td>
                      <td>{{ t.category }}</td>
                      <td><span class="ann-status" :class="'status-' + (t.status === 'reviewing' ? 'draft' : t.status)">{{ t.status }}</span></td>
                      <td>{{ t.pinned ? '置顶' : '-' }}</td>
                      <td>{{ t.sticky ? '加精' : '-' }}</td>
                      <td>{{ t.reply_count }}</td>
                      <td>{{ new Date(t.created_at).toLocaleDateString('zh-CN') }}</td>
                      <td>
                        <button v-if="t.status === 'reviewing'" class="btn btn-sm btn-primary" type="button" @click="forumReviewTopic(t, 'approve')">通过</button>
                        <button v-if="t.status === 'reviewing'" class="btn btn-sm btn-dark" type="button" @click="forumReviewTopic(t, 'reject')">隐藏</button>
                        <button v-if="t.status !== 'reviewing'" class="btn btn-sm btn-outline" type="button" @click="forumPatchTopic(t, { pinned: !t.pinned })">{{ t.pinned ? '取消置顶' : '置顶' }}</button>
                        <button v-if="t.status !== 'reviewing'" class="btn btn-sm btn-outline" type="button" @click="forumPatchTopic(t, { sticky: !t.sticky })">{{ t.sticky ? '取消加精' : '加精' }}</button>
                        <button v-if="t.status !== 'reviewing'" class="btn btn-sm btn-dark" type="button" @click="forumPatchTopic(t, { status: t.status === 'hidden' ? 'normal' : 'hidden' })">{{ t.status === 'hidden' ? '恢复' : '隐藏' }}</button>
                        <button class="btn btn-sm btn-danger" type="button" @click="forumDeleteTopic(t)">删除</button>
                      </td>
                    </tr>
                    <tr v-if="!filteredForumTopics.length"><td colspan="9" style="text-align:center">暂无主题</td></tr>
                  </tbody>
                </table>
              </div>
            </template>

            <template v-else-if="forumSub === 'replies'">
              <div class="filter-row" style="margin-bottom: 12px">
                <select v-model="forumReplyTopicId" class="input" style="max-width: 320px" @change="forumSelectReplies">
                  <option :value="null">选择主题…</option>
                  <option v-for="t in forumTopics" :key="t.id" :value="t.id">{{ t.title }}</option>
                </select>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>作者</th><th>内容</th><th>时间</th><th>操作</th></tr></thead>
                  <tbody>
                    <tr v-for="r in forumRepliesShown" :key="r.id">
                      <td>{{ r.author || '匿名' }}</td>
                      <td style="max-width: 360px; overflow-wrap: anywhere">{{ r.content }}</td>
                      <td>{{ new Date(r.created_at).toLocaleString('zh-CN') }}</td>
                      <td>
                        <button class="btn btn-sm btn-outline" type="button" @click="forumReviewReply(r, 'approve')">通过</button>
                        <button class="btn btn-sm btn-dark" type="button" @click="forumReviewReply(r, 'reject')">隐藏</button>
                        <button class="btn btn-sm btn-danger" type="button" @click="forumDeleteReply(r)">删除</button>
                      </td>
                    </tr>
                    <tr v-if="!forumRepliesShown.length"><td colspan="4" style="text-align:center">选择主题查看回复</td></tr>
                  </tbody>
                </table>
              </div>
            </template>

            <template v-else>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>对象</th><th>理由</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
                  <tbody>
                    <tr v-for="r in forumReports" :key="r.id">
                      <td>{{ r.target_type }} #{{ r.target_id }}</td>
                      <td style="max-width: 320px; overflow-wrap: anywhere">{{ r.reason }}</td>
                      <td><span class="ann-status" :class="'status-' + (r.status === 'pending' ? 'draft' : r.status)">{{ r.status }}</span></td>
                      <td>{{ new Date(r.created_at).toLocaleString('zh-CN') }}</td>
                      <td>
                        <button v-if="r.status === 'pending'" class="btn btn-sm btn-primary" type="button" @click="forumHandleReport(r, 'handle')">处理</button>
                        <button v-if="r.status === 'pending'" class="btn btn-sm btn-dark" type="button" @click="forumHandleReport(r, 'ignore')">忽略</button>
                        <span v-else class="muted">已处理</span>
                      </td>
                    </tr>
                    <tr v-if="!forumReports.length"><td colspan="5" style="text-align:center">暂无举报</td></tr>
                  </tbody>
                </table>
              </div>
            </template>
          </template>

          <!-- 用户管理 -->
          <template v-else-if="tab === 'users'">
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr><th>用户名</th><th>角色</th><th>状态</th><th>Demo 数</th><th>操作</th></tr>
                </thead>
                <tbody>
                  <tr v-for="u in users" :key="u.id">
                    <td>{{ u.username }}</td>
                    <td>{{ u.role }}</td>
                    <td><span class="status-pill" :class="`status-${u.status}`">{{ u.status }}</span></td>
                    <td>{{ u.demo_count }}</td>
                    <td>
                      <button class="btn btn-sm btn-outline" type="button" @click="toggleUser(u, 'role')">切换角色</button>
                      <button class="btn btn-sm btn-dark" type="button" @click="toggleUser(u, 'status')">{{ u.status === 'active' ? '停用' : '启用' }}</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- 公告管理 -->
          <template v-else-if="tab === 'announcements'">
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
            </div>            <div class="filter-row" style="margin-top: 8px">
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
                    <td>{{ new Date(a.created_at).toLocaleString('zh-CN') }}</td>
                    <td>
                      <RouterLink v-if="a.demo_slug" class="btn btn-sm btn-outline" :to="`/demo/${a.demo_slug}`">查看</RouterLink>
                      <button v-if="a.type === 'manual'" class="btn btn-sm btn-outline" type="button" @click="startEditAnn(a)">编辑</button>
                      <button class="btn btn-sm btn-danger" type="button" @click="deleteAnnouncement(a.id)">删除</button>
                    </td>
                  </tr>
                  <tr v-if="!filteredAnnouncements.length">
                    <td colspan="5" style="text-align: center">该类型暂无公告</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- 站点设置 -->
          <template v-else-if="tab === 'settings'">
            <div class="card card-mint" style="max-width: 520px; padding: 24px; margin-bottom: 20px">
              <h2 style="margin-bottom: 12px">存储</h2>
              <div class="filter-row" style="margin-bottom: 10px">
                <span class="mini-stat"><b>{{ storageModeLabel }}</b> 模式</span>
                <span class="mini-stat"><b>{{ storageInfo.local_demos }}</b> demo</span>
                <span class="mini-stat"><b>{{ storageInfo.local_files }}</b> 文件</span>
                <span class="mini-stat"><b>{{ fmtSize(storageInfo.local_size_bytes) }}</b> 本地占用</span>
              </div>
              <p class="hint" style="margin-bottom: 12px">本地是完整存储（全量文件在服务器），OSS 只是镜像。切换模式：修改服务器 .env 的 <code>OSS_ENABLED</code>（false=本地 / true=OSS）+ <code>docker compose up -d backend</code> 重建生效。</p>
              <div class="filter-row" style="margin-bottom: 0">
                <button class="btn btn-secondary" type="button" :disabled="ossSyncing" @click="runOssSync()">
                  {{ ossSyncing ? `同步中… ${ossSyncProgress}` : '同步本地文件到 OSS' }}
                </button>
                <button class="btn btn-dark" type="button" :disabled="ossSyncing" @click="runOssSync(true)">
                  {{ ossSyncing ? `同步中… ${ossSyncProgress}` : '强制全量同步' }}
                </button>
              </div>
            </div>

            <div class="card card-default" style="max-width: 520px; padding: 24px">
              <label class="field">
                <input v-model="settings.auto_approve" type="checkbox" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle" />
                新上传 Demo 自动通过审核（登录用户）
              </label>
              <label class="field">
                <input v-model="settings.auto_approve_public" type="checkbox" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle" />
                未注册（public）上传自动通过审核
              </label>
              <p class="hint" style="margin-bottom: 14px">开启「未注册放行」后，任何人（含 AI agent）不注册即可上传并即时上线，建议配合限流与 UPLOAD_CODE 信任通道使用。</p>
              <button class="btn btn-primary" type="button" @click="saveSettings">保存设置</button>
            </div>
          </template>
        </div>
      </Transition>
    </template>
  </section>
</template>
