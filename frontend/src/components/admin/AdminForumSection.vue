<script setup lang="ts">
defineOptions({ name: 'AdminForumSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { ForumReply, ForumReport, ForumTopic } from '../../api/types'
import ForumTopicEditModal from './ForumTopicEditModal.vue'
import { parseDate } from '../../utils/time'

const ui = useUiStore()

const forumSub = ref<'topics' | 'replies' | 'reports'>('topics')
const forumTopics = ref<ForumTopic[]>([])
const forumRepliesByTopic = ref<Record<number, ForumReply[]>>({})
const forumReports = ref<ForumReport[]>([])
const forumStatusFilter = ref<'all' | 'normal' | 'hidden' | 'reviewing'>('all')
const forumCategoryFilter = ref('')
const forumPinnedFilter = ref<'all' | 'pinned' | 'unpinned'>('all')
const editTopic = ref<ForumTopic | null>(null)

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
const forumReplyTopicId = ref<number | null>(null)
const forumRepliesShown = ref<ForumReply[]>([])
async function forumSelectReplies() {
  if (forumReplyTopicId.value == null) { forumRepliesShown.value = []; return }
  try { forumRepliesShown.value = await api.adminListForumReplies({ topic_id: forumReplyTopicId.value }) } catch { forumRepliesShown.value = [] }
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
              <td>{{ parseDate(t.created_at).toLocaleDateString('zh-CN') }}</td>
              <td>
                <button v-if="t.status === 'reviewing'" class="btn btn-sm btn-primary" type="button" @click="forumReviewTopic(t, 'approve')">通过</button>
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
          <thead><tr><th>作者</th><th>内容</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="r in forumRepliesShown" :key="r.id">
              <td>{{ r.author || '匿名' }}</td>
              <td style="max-width: 360px; overflow-wrap: anywhere">{{ r.content }}</td>
              <td><span class="ann-status" :class="'status-' + (r.status || 'normal')">{{ r.status || 'normal' }}</span></td>
              <td>{{ parseDate(r.created_at).toLocaleString('zh-CN') }}</td>
              <td>
                <button class="btn btn-sm btn-outline" type="button" @click="forumReviewReply(r, 'approve')">通过</button>
                <button class="btn btn-sm btn-dark" type="button" @click="forumReviewReply(r, 'reject')">隐藏</button>
                <button class="btn btn-sm btn-danger" type="button" @click="forumDeleteReply(r)">删除</button>
              </td>
            </tr>
            <tr v-if="!forumRepliesShown.length"><td colspan="5" style="text-align:center">选择主题查看回复</td></tr>
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
