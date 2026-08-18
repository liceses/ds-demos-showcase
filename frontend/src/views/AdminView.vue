<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { AdminDemo, AdminUser, Announcement, DemoDetail, Settings, Tag } from '../api/types'

const tab = ref<'review' | 'demos' | 'tags' | 'users' | 'settings' | 'announcements'>('review')

const pending = ref<DemoDetail[]>([])
const demos = ref<AdminDemo[]>([])
const tags = ref<Tag[]>([])
const users = ref<AdminUser[]>([])
const settings = ref<Settings>({ auto_approve: true })
const announcements = ref<Announcement[]>([])

const newAnn = ref({ title: '', content: '' })
const annError = ref('')
const annOk = ref('')

const annTypeLabel: Record<string, string> = { manual: '手动公告', auto: '新发布', update: '站点更新', demo_update: '作品更新' }

const newTag = ref({ key: '', value: '', description: '', parent_id: '' as string | number })
const tagError = ref('')
const tagOk = ref('')

const loading = ref(false)
const error = ref('')

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [p, d, t, u, s, a] = await Promise.all([
      api.adminReview(),
      api.adminDemos(),
      api.listTags(),
      api.adminUsers(),
      api.getSettings(),
      api.listAnnouncements(),
    ])
    pending.value = p
    demos.value = d
    tags.value = t
    users.value = u
    settings.value = s
    announcements.value = a
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
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
    await api.createAnnouncement({ title: newAnn.value.title.trim(), content: newAnn.value.content.trim() })
    annOk.value = '公告已发布'
    newAnn.value = { title: '', content: '' }
    announcements.value = await api.listAnnouncements()
  } catch (e) {
    annError.value = (e as Error).message
  }
}

async function deleteAnnouncement(id: number) {
  if (!confirm('确定删除这条公告？')) return
  try {
    await api.deleteAnnouncement(id)
    announcements.value = await api.listAnnouncements()
  } catch (e) {
    alert((e as Error).message)
  }
}

async function review(slug: string, action: 'approve' | 'reject') {
  try {
    await api.adminApprove(slug, action)
    await loadAll()
  } catch (e) {
    alert((e as Error).message)
  }
}

async function createTag() {
  tagError.value = ''
  tagOk.value = ''
  if (!newTag.value.key || !newTag.value.value) {
    tagError.value = 'key 和 value 必填'
    return
  }
  try {
    await api.createTag(
      newTag.value.key.trim(),
      newTag.value.value.trim(),
      newTag.value.description.trim() || undefined,
      newTag.value.parent_id === '' || newTag.value.parent_id === 'none' ? null : Number(newTag.value.parent_id),
    )
    tagOk.value = '标签已创建'
    newTag.value = { key: '', value: '', description: '', parent_id: '' }
    tags.value = await api.listTags()
  } catch (e) {
    tagError.value = (e as Error).message
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
    alert((e as Error).message)
  }
}

async function saveSettings() {
  try {
    settings.value = await api.updateSettings(settings.value)
    alert('设置已保存')
  } catch (e) {
    alert((e as Error).message)
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
      <button class="tab" :class="{ active: tab === 'review' }" type="button" @click="tab = 'review'">审核队列</button>
      <button class="tab" :class="{ active: tab === 'demos' }" type="button" @click="tab = 'demos'">Demo 管理</button>
      <button class="tab" :class="{ active: tab === 'tags' }" type="button" @click="tab = 'tags'">标签管理</button>
      <button class="tab" :class="{ active: tab === 'users' }" type="button" @click="tab = 'users'">用户管理</button>
      <button class="tab" :class="{ active: tab === 'announcements' }" type="button" @click="tab = 'announcements'">公告管理</button>
      <button class="tab" :class="{ active: tab === 'settings' }" type="button" @click="tab = 'settings'">站点设置</button>
    </div>

    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载后台…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <template v-else>
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
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr><th>标题</th><th>作者</th><th>状态</th><th>浏览</th><th>存储</th><th>一致性</th><th>操作</th></tr>
                </thead>
                <tbody>
                  <tr v-for="d in demos" :key="d.slug" :class="{ inconsistent: d.inconsistency }">
                    <td><RouterLink :to="`/demo/${d.slug}`">{{ d.title }}</RouterLink></td>
                    <td>{{ d.author }}</td>
                    <td><span class="status-pill" :class="`status-${d.status}`">{{ d.status }}</span></td>
                    <td>{{ d.view_count }}</td>
                    <td>{{ d.storage_size ? Math.round(d.storage_size / 1024) + ' KB' : '-' }}</td>
                    <td>{{ d.inconsistency ? '不一致' : '正常' }}</td>
                    <td><RouterLink class="btn btn-sm btn-outline" :to="`/upload?slug=${d.slug}`">编辑</RouterLink></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- 标签管理 -->
          <template v-else-if="tab === 'tags'">
            <div class="card card-mint" style="padding: 20px; margin-bottom: 20px">
              <h2 style="margin-bottom: 12px">新建标签</h2>
              <div class="form-stack">
                <div class="filter-row" style="margin-bottom: 0">
                  <input v-model="newTag.key" class="input" style="max-width: 200px" placeholder="key" />
                  <input v-model="newTag.value" class="input" style="max-width: 200px" placeholder="value" />
                  <select v-model="newTag.parent_id" class="input" style="max-width: 220px">
                    <option value="none">无父级</option>
                    <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.key }}:{{ t.value }}</option>
                  </select>
                </div>
                <input v-model="newTag.description" class="input" placeholder="标签介绍（可选）" />
                <div class="filter-row" style="margin-bottom: 0">
                  <button class="btn btn-secondary" type="button" @click="createTag">创建标签</button>
                  <span v-if="tagError" class="notice notice-error" style="margin: 0">{{ tagError }}</span>
                  <span v-if="tagOk" class="notice notice-success" style="margin: 0">{{ tagOk }}</span>
                </div>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr><th>标签</th><th>介绍</th><th>父级</th><th>Demo 数</th><th>子标签数</th></tr>
                </thead>
                <tbody>
                  <tr v-for="t in tags" :key="t.id">
                    <td><RouterLink :to="`/tag/${t.key}/${t.value}`">{{ t.key }}:{{ t.value }}</RouterLink></td>
                    <td>{{ t.description }}</td>
                    <td>{{ t.parent_id ?? '-' }}</td>
                    <td>{{ t.demo_count }}</td>
                    <td>{{ t.child_count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
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
              <h2 style="margin-bottom: 12px">发布手动公告</h2>
              <div class="form-stack">
                <label class="field">
                  标题
                  <input v-model="newAnn.title" class="input" placeholder="公告标题" />
                </label>
                <label class="field">
                  内容
                  <textarea v-model="newAnn.content" class="input textarea" rows="3" placeholder="公告内容（可选）"></textarea>
                </label>
                <div class="filter-row" style="margin-bottom: 0">
                  <button class="btn btn-primary" type="button" @click="createAnnouncement">发布公告</button>
                  <span v-if="annError" class="notice notice-error" style="margin: 0">{{ annError }}</span>
                  <span v-if="annOk" class="notice notice-success" style="margin: 0">{{ annOk }}</span>
                </div>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr><th>类型</th><th>标题</th><th>内容</th><th>时间</th><th>操作</th></tr>
                </thead>
                <tbody>
                  <tr v-for="a in announcements" :key="a.id">
                    <td><span class="status-pill">{{ annTypeLabel[a.type] || a.type }}</span></td>
                    <td>{{ a.title }}</td>
                    <td style="max-width: 320px; overflow-wrap: anywhere">{{ a.content }}</td>
                    <td>{{ new Date(a.created_at).toLocaleDateString('zh-CN') }}</td>
                    <td>
                      <RouterLink v-if="a.demo_slug" class="btn btn-sm btn-outline" :to="`/demo/${a.demo_slug}`">查看</RouterLink>
                      <button class="btn btn-sm btn-danger" type="button" @click="deleteAnnouncement(a.id)">删除</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- 站点设置 -->
          <template v-else-if="tab === 'settings'">
            <div class="card card-default" style="max-width: 520px; padding: 24px">
              <label class="field">
                <input v-model="settings.auto_approve" type="checkbox" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle" />
                新上传 Demo 自动通过审核
              </label>
              <button class="btn btn-primary" type="button" @click="saveSettings">保存设置</button>
            </div>
          </template>
        </div>
      </Transition>
    </template>
  </section>
</template>
