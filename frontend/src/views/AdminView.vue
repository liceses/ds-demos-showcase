<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useUiStore } from '../stores/ui'
import type { AdminDemo, AdminUser, Announcement, DemoDetail, Settings, TagKeyInfo } from '../api/types'

const ui = useUiStore()

const tab = ref<'review' | 'demos' | 'tags' | 'users' | 'settings' | 'announcements'>('review')

const pending = ref<DemoDetail[]>([])
const demos = ref<AdminDemo[]>([])
const tagKeys = ref<TagKeyInfo[]>([])
const users = ref<AdminUser[]>([])
const settings = ref<Settings>({ auto_approve: true, auto_approve_public: false })
const announcements = ref<Announcement[]>([])

const newAnn = ref({ title: '', content: '' })
const annError = ref('')
const annOk = ref('')

const annTypeLabel: Record<string, string> = { manual: '手动公告', auto: '新发布', update: '站点更新', demo_update: '作品更新' }

const annFilter = ref<'all' | 'manual' | 'auto' | 'demo_update' | 'update'>('all')
const editingAnn = ref<Announcement | null>(null)
const editAnnForm = ref({ title: '', content: '' })

const filteredAnnouncements = computed(() =>
  annFilter.value === 'all' ? announcements.value : announcements.value.filter((a) => a.type === annFilter.value),
)

function startEditAnn(a: Announcement) {
  editingAnn.value = a
  editAnnForm.value = { title: a.title, content: a.content }
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

const fixedKeys = computed(() => tagKeys.value.filter((k) => k.mode === 'fixed'))
const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }

const loading = ref(false)
const error = ref('')

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [p, d, t, u, s, a] = await Promise.all([
      api.adminReview(),
      api.adminDemos(),
      api.listTagKeys(),
      api.adminUsers(),
      api.getSettings(),
      api.listAnnouncements(),
    ])
    pending.value = p
    demos.value = d
    tagKeys.value = t
    users.value = u
    settings.value = s
    announcements.value = a
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
    await api.createAnnouncement({ title: newAnn.value.title.trim(), content: newAnn.value.content.trim() })
    ui.toast('公告已发布', 'success')
    newAnn.value = { title: '', content: '' }
    announcements.value = await api.listAnnouncements()
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
  try {
    await api.adminApprove(slug, action)
    await loadAll()
  } catch (e) {
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
async function runOssSync() {
  ossSyncing.value = true
  try {
    const r = await api.ossSync()
    ui.toast(`OSS 同步完成：demo ${r.demos_ok} 成功 / ${r.demos_fail} 失败，封面 ${r.covers_ok} 成功 / ${r.covers_fail} 失败`, r.demos_fail || r.covers_fail ? 'error' : 'success')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    ossSyncing.value = false
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
            <div class="filter-row" style="align-items: stretch">
              <div class="card card-mint" style="padding: 20px; margin-bottom: 20px; width: 100%">
                <h2 style="margin-bottom: 12px">新建标签键</h2>
                <div class="form-stack">
                  <div class="filter-row" style="margin-bottom: 0">
                    <input v-model="newKey.key" class="input" style="max-width: 160px" placeholder="key（如 difficulty）" />
                    <select v-model="newKey.mode" class="input" style="max-width: 140px">
                      <option value="fixed">固定值</option>
                      <option value="open">自由值</option>
                      <option value="int">数字值</option>
                    </select>
                    <input v-model="newKey.label" class="input" style="max-width: 160px" placeholder="显示名" />
                    <input v-model="newKey.sort" class="input" style="max-width: 90px" type="number" placeholder="排序" />
                  </div>
                  <input v-model="newKey.description" class="input" placeholder="键介绍（可选）" />
                  <div class="filter-row" style="margin-bottom: 0">
                    <button class="btn btn-secondary" type="button" @click="createTagKey">创建标签键</button>
                    <span v-if="keyError" class="notice notice-error" style="margin: 0">{{ keyError }}</span>
                    <span v-if="keyOk" class="notice notice-success" style="margin: 0">{{ keyOk }}</span>
                  </div>
                </div>
              </div>

              <div class="card card-coral" style="padding: 20px; margin-bottom: 20px; width: 100%">
                <h2 style="margin-bottom: 12px">添加固定值</h2>
                <div class="form-stack">
                  <div class="filter-row" style="margin-bottom: 0">
                    <select v-model="newValue.key" class="input" style="max-width: 180px">
                      <option value="">选择固定键…</option>
                      <option v-for="k in fixedKeys" :key="k.key" :value="k.key">{{ k.key }}（{{ k.label }}）</option>
                    </select>
                    <input v-model="newValue.value" class="input" style="max-width: 160px" placeholder="value（如 hard）" />
                    <input v-model="newValue.description" class="input" style="max-width: 200px" placeholder="介绍（可选）" />
                  </div>
                  <div class="filter-row" style="margin-bottom: 0">
                    <button class="btn btn-primary" type="button" :disabled="!newValue.key" @click="addFixedValue">添加固定值</button>
                    <span v-if="valueError" class="notice notice-error" style="margin: 0">{{ valueError }}</span>
                    <span v-if="valueOk" class="notice notice-success" style="margin: 0">{{ valueOk }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr><th>键</th><th>类型</th><th>显示名</th><th>介绍</th><th>Demo 数</th><th>值</th><th>操作</th></tr>
                </thead>
                <tbody>
                  <tr v-for="k in tagKeys" :key="k.key">
                    <td><b>{{ k.key }}</b></td>
                    <td><span class="mode-badge" :class="'mode-badge-' + k.mode">{{ modeLabel[k.mode] }}</span></td>
                    <td>{{ k.label }}</td>
                    <td style="max-width: 220px; overflow-wrap: anywhere">{{ k.description }}</td>
                    <td>{{ k.demo_count }}</td>
                    <td style="max-width: 300px">
                      <div class="filter-row" style="margin: 0; gap: 6px">
                        <template v-for="v in k.values" :key="v.value">
                          <RouterLink class="tag-chip" :class="'mode-' + k.mode" :to="`/tag/${k.key}/${v.value}`">
                            {{ v.value }}<span class="count">{{ v.demo_count }}</span>
                          </RouterLink>
                          <button class="btn btn-sm btn-danger" type="button" style="padding: 2px 6px" title="删除该值" @click="deleteTagValue(k.key, v.value)">×</button>
                        </template>
                        <span v-if="!k.values.length" class="muted">无</span>
                      </div>
                    </td>
                    <td>
                      <button class="btn btn-sm btn-dark" type="button" @click="deleteTagKey(k.key)">删除键</button>
                    </td>
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
              <h2 style="margin-bottom: 12px">{{ editingAnn ? '编辑公告' : '发布手动公告' }}</h2>
              <div class="form-stack">
                <template v-if="editingAnn">
                  <label class="field">
                    标题
                    <input v-model="editAnnForm.title" class="input" placeholder="公告标题" />
                  </label>
                  <label class="field">
                    内容
                    <textarea v-model="editAnnForm.content" class="input textarea" rows="3" placeholder="公告内容（可选）"></textarea>
                  </label>
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
                    <textarea v-model="newAnn.content" class="input textarea" rows="3" placeholder="公告内容（可选）"></textarea>
                  </label>
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

            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr><th>类型</th><th>标题</th><th>内容</th><th>时间</th><th>操作</th></tr>
                </thead>
                <tbody>
                  <tr v-for="a in filteredAnnouncements" :key="a.id">
                    <td>
                      <span class="status-pill">{{ annTypeLabel[a.type] || a.type }}</span>
                      <span v-if="a.type !== 'manual'" class="status-pill status-pending" style="margin-left: 4px">系统</span>
                    </td>
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
              <div class="filter-row" style="margin-bottom: 0">
                <button class="btn btn-primary" type="button" @click="saveSettings">保存设置</button>
                <button class="btn btn-secondary" type="button" :disabled="ossSyncing" @click="runOssSync">
                  {{ ossSyncing ? '同步中…' : '同步本地文件到 OSS' }}
                </button>
              </div>
              <p class="hint" style="margin: 10px 0 0">OSS 不可用期间上传的 demo 只存在服务器本地，点此/重启后端即可自动补传。</p>
            </div>
          </template>
        </div>
      </Transition>
    </template>
  </section>
</template>
