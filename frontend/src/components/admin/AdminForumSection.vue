<script setup lang="ts">
defineOptions({ name: 'AdminForumSection' })
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { ForumReply, ForumReport, ForumTopic } from '../../api/types'
import ForumTopicEditModal from './ForumTopicEditModal.vue'
import PaginationBar from '../PaginationBar.vue'
import { parseDate } from '../../utils/time'

const ui = useUiStore()

const forumSub = ref<'topics' | 'replies' | 'reports'>('topics')
const forumTopics = ref<ForumTopic[]>([])
const forumRepliesByTopic = ref<Record<number, ForumReply[]>>({})
const forumReports = ref<ForumReport[]>([])
const forumCategoryFilter = ref('')
const forumPinnedFilter = ref<'all' | 'pinned' | 'unpinned'>('all')
const editTopic = ref<ForumTopic | null>(null)

// 主题列表：后端本就支持 q/status/page/page_size，此前前端一律不用（只拿默认 20 条、无翻页）
const topicQuery = ref('')
const topicStatusFilter = ref('')
const topicPage = ref(1)
const topicTotal = ref(0)
const TOPIC_PAGE_SIZE = 20

async function loadForum() {
  try {
    const r = await api.adminListForumTopics({
      q: topicQuery.value.trim() || undefined,
      status: topicStatusFilter.value || undefined,
      page: topicPage.value,
      page_size: TOPIC_PAGE_SIZE,
    })
    forumTopics.value = r.items
    topicTotal.value = r.total
  } catch {
    forumTopics.value = []
    topicTotal.value = 0
  }
}
function topicSearch() {
  topicPage.value = 1
  void loadForum()
}
function topicPageGo(p: number) {
  topicPage.value = p
  void loadForum()
}
async function loadForumReports() {
  try {
    forumReports.value = await api.listForumReports()
  } catch {
    forumReports.value = []
  }
}
// 状态与关键词走服务端（跨全库）；分类与置顶只有本库字段，留在客户端 ——
// 但必须标明"仅本页"，否则会出现"明明有帖子却显示无结果"的假空态。
const filteredForumTopics = computed(() => {
  let items = forumTopics.value
  if (forumCategoryFilter.value) items = items.filter((t) => t.category.includes(forumCategoryFilter.value))
  if (forumPinnedFilter.value !== 'all') items = items.filter((t) => t.pinned === (forumPinnedFilter.value === 'pinned'))
  return items
})
async function forumReviewTopic(t: ForumTopic, action: 'approve' | 'reject') {
  try {
    await api.adminReviewForumTopic(t.id, action)
    ui.toast(action === 'approve' ? '已批准' : '已隐藏', 'success')
    await loadForum()
  } catch (e) { ui.toast((e as Error).message, 'error') }
}
async function forumPatchTopic(t: ForumTopic, patch: { pinned?: boolean; sticky?: boolean; locked?: boolean; solved?: boolean; status?: string }) {
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
// 回复管理：默认就是**全局回复流**（按时间倒序），不必先选主题 ——
// 原来"选择主题查看回复"在上百个主题面前等于让人先做一遍检索。
const forumReplyTopicId = ref<number | null>(null)
const forumReplyStatus = ref('')
const forumReplyQuery = ref('')
const forumRepliesShown = ref<ForumReply[]>([])
const forumRepliesLoading = ref(false)
async function forumSelectReplies() {
  forumRepliesLoading.value = true
  try {
    forumRepliesShown.value = await api.adminListForumReplies({
      topic_id: forumReplyTopicId.value ?? undefined,
      status: forumReplyStatus.value || undefined,
      q: forumReplyQuery.value.trim() || undefined,
      limit: 80,
    })
  } catch {
    forumRepliesShown.value = []
  } finally {
    forumRepliesLoading.value = false
  }
}
// 进「回复」子页就自动拉全局列表（不再要求先选主题）
watch(forumSub, (s) => {
  if (s === 'replies' && !forumRepliesShown.value.length) void forumSelectReplies()
})
async function forumReviewReply(r: ForumReply, action: 'approve' | 'reject') {
  try {
    await api.adminReviewForumReply(r.id, action)
    ui.toast(action === 'approve' ? '已批准' : '已隐藏', 'success')
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

onMounted(() => {
  loadForum()
  loadForumReports()
})
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 14px">
      <button class="tab" :class="{ active: forumSub === 'topics' }" type="button" @click="forumSub = 'topics'">主题</button>
      <button class="tab" :class="{ active: forumSub === 'replies' }" type="button" @click="forumSub = 'replies'">回复</button>
      <button class="tab" :class="{ active: forumSub === 'reports' }" type="button" @click="forumSub = 'reports'; loadForumReports()">举报</button>
    </div>

    <template v-if="forumSub === 'topics'">
      <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
        <input v-model="topicQuery" class="input" type="search" placeholder="搜标题或正文…" style="max-width: 220px" @keyup.enter="topicSearch" />
        <select v-model="topicStatusFilter" class="input" style="max-width: 120px" @change="topicSearch">
          <option value="">全部状态</option>
          <option value="normal">正常</option>
          <option value="reviewing">审核中</option>
          <option value="hidden">隐藏</option>
        </select>
        <button class="btn btn-sm btn-secondary" type="button" @click="topicSearch">筛选</button>
        <input v-model="forumCategoryFilter" class="input" style="max-width: 120px" placeholder="分类（本页）" />
        <select v-model="forumPinnedFilter" class="input" style="max-width: 120px">
          <option value="all">全部置顶（本页）</option>
          <option value="pinned">仅置顶</option>
          <option value="unpinned">非置顶</option>
        </select>
        <span class="muted mono">{{ filteredForumTopics.length }} / {{ topicTotal }} {{ topicTotal > TOPIC_PAGE_SIZE ? '（服务端分页）' : '' }}</span>
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
              <td>{{ parseDate(t.created_at).toLocaleDateString('zh-CN') }}</td>
              <td>
                <button v-if="t.status === 'reviewing'" class="btn btn-sm btn-primary" type="button" @click="forumReviewTopic(t, 'approve')">批准</button>
                <button v-if="t.status === 'reviewing'" class="btn btn-sm btn-dark" type="button" @click="forumReviewTopic(t, 'reject')">隐藏</button>
                <button v-if="t.status !== 'reviewing'" class="btn btn-sm btn-outline" type="button" @click="forumPatchTopic(t, { pinned: !t.pinned })">{{ t.pinned ? '取消置顶' : '置顶' }}</button>
                <button v-if="t.status !== 'reviewing'" class="btn btn-sm btn-outline" type="button" @click="forumPatchTopic(t, { sticky: !t.sticky })">{{ t.sticky ? '取消加精' : '加精' }}</button>
                <button v-if="t.status !== 'reviewing'" class="btn btn-sm btn-dark" type="button" @click="forumPatchTopic(t, { status: t.status === 'hidden' ? 'normal' : 'hidden' })">{{ t.status === 'hidden' ? '恢复' : '隐藏' }}</button>
                <button v-if="t.status !== 'reviewing'" class="btn btn-sm btn-outline" type="button" @click="forumPatchTopic(t, { locked: !t.locked })">{{ t.locked ? '解锁' : '锁定' }}</button>
                <button v-if="t.status !== 'reviewing'" class="btn btn-sm btn-outline" type="button" @click="forumPatchTopic(t, { solved: !t.solved })">{{ t.solved ? '取消解决' : '已解决' }}</button>
                <button class="btn btn-sm btn-outline" type="button" @click="editTopic = t">编辑</button>
                <button class="btn btn-sm btn-danger" type="button" @click="forumDeleteTopic(t)">删除</button>
              </td>
            </tr>
            <tr v-if="!filteredForumTopics.length">
              <td colspan="9" style="text-align:center">
                {{ topicTotal ? '本页被"分类/置顶"筛空了 —— 这两个只作用于当前页，试试翻页或清掉它们' : '没有匹配的主题（换个关键词或放宽状态）' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar v-if="topicTotal > TOPIC_PAGE_SIZE" :page="topicPage" :total="topicTotal" :page-size="TOPIC_PAGE_SIZE" @change="topicPageGo" />
    </template>

    <template v-else-if="forumSub === 'replies'">
      <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
        <input v-model="forumReplyQuery" class="input" type="search" placeholder="搜回复内容或主题标题…" style="max-width: 260px" @keyup.enter="forumSelectReplies" />
        <select v-model="forumReplyStatus" class="input" style="max-width: 140px" @change="forumSelectReplies">
          <option value="">全部状态</option>
          <option value="reviewing">待审</option>
          <option value="normal">正常</option>
          <option value="hidden">已隐藏</option>
        </select>
        <select v-model="forumReplyTopicId" class="input" style="max-width: 260px" @change="forumSelectReplies">
          <option :value="null">全部主题</option>
          <option v-for="t in forumTopics" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
        <button class="btn btn-sm btn-secondary" type="button" :disabled="forumRepliesLoading" @click="forumSelectReplies">筛选</button>
        <span class="muted mono">{{ forumRepliesShown.length }} 条（最近 80 条内）</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>作者</th><th>内容</th><th>所属主题</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="r in forumRepliesShown" :key="r.id">
              <td>{{ r.author || '匿名' }}</td>
              <td style="max-width: 300px; overflow-wrap: anywhere">{{ r.content }}</td>
              <td style="max-width: 200px">
                <RouterLink class="muted" :to="`/forum/topic/${r.topic_id}`" style="overflow-wrap: anywhere">{{ r.topic_title || `#${r.topic_id}` }}</RouterLink>
              </td>
              <td><span class="ann-status" :class="'status-' + (r.status || 'normal')">{{ r.status || 'normal' }}</span></td>
              <td>{{ parseDate(r.created_at).toLocaleString('zh-CN') }}</td>
              <td>
                <button class="btn btn-sm btn-outline" type="button" @click="forumReviewReply(r, 'approve')">批准</button>
                <button class="btn btn-sm btn-dark" type="button" @click="forumReviewReply(r, 'reject')">隐藏</button>
                <button class="btn btn-sm btn-danger" type="button" @click="forumDeleteReply(r)">删除</button>
              </td>
            </tr>
            <tr v-if="forumRepliesLoading && !forumRepliesShown.length"><td colspan="6" style="text-align:center">加载中…</td></tr>
            <tr v-else-if="!forumRepliesShown.length"><td colspan="6" style="text-align:center">没有匹配的回复（换个关键词或放宽状态）</td></tr>
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
              <td>{{ parseDate(r.created_at).toLocaleString('zh-CN') }}</td>
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

    <ForumTopicEditModal
      v-if="editTopic"
      :topic="editTopic"
      @close="editTopic = null"
      @saved="loadForum"
    />
  </div>
</template>
