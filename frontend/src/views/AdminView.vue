<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useUiStore } from '../stores/ui'
import AdminForumSection from '../components/admin/AdminForumSection.vue'
import AdminAnnouncementsSection from '../components/admin/AdminAnnouncementsSection.vue'
import AdminUsersSection from '../components/admin/AdminUsersSection.vue'
import AdminSettingsSection from '../components/admin/AdminSettingsSection.vue'
import AdminReviewSection from '../components/admin/AdminReviewSection.vue'
import AdminDemosSection from '../components/admin/AdminDemosSection.vue'
import type { AdminDemo, AdminStats, TagKeyInfo, TagSuggestion } from '../api/types'

const ui = useUiStore()

const tab = ref<'review' | 'demos' | 'tags' | 'forum' | 'users' | 'settings' | 'announcements'>('review')
const adminStats = ref<AdminStats | null>(null)
const demos = ref<AdminDemo[]>([])
const tagSub = ref<'keys' | 'review'>('keys')
const adminActiveKey = ref('')
const adminActiveTagKey = computed(() => tagKeys.value.find((k) => k.key === adminActiveKey.value) || null)
function selectAdminKey(k: TagKeyInfo) {
  adminActiveKey.value = k.key
  startEditKey(k)
}

const tagKeys = ref<TagKeyInfo[]>([])

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

// 概览统计需要的最小数据（管理表格在子组件自行加载）
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

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const stats = await api.getAdminStats()
    adminStats.value = stats
    storageInfo.value = stats.storage
    demos.value = await api.adminDemos()
    tagKeys.value = await api.listTagKeys()
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

// ---------- 概览统计 ----------
const dashStats = computed(() => ({
  total: adminStats.value?.demos.total ?? 0,
  approved: adminStats.value?.demos.approved ?? 0,
  pending: adminStats.value?.demos.pending ?? 0,
  rejected: adminStats.value?.demos.rejected ?? 0,
  users: adminStats.value?.users ?? 0,
}))

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
        <span v-if="dashStats.pending" class="badge">{{ dashStats.pending }}</span>
      </button>
      <button class="tab" :class="{ active: tab === 'demos' }" type="button" @click="tab = 'demos'">Demo 管理</button>
      <button class="tab" :class="{ active: tab === 'tags' }" type="button" @click="tab = 'tags'">标签管理</button>
      <button class="tab" :class="{ active: tab === 'forum' }" type="button" @click="tab = 'forum'">论坛管理</button>
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
          <AdminReviewSection />

          <AdminDemosSection />

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


          <template v-else-if="tab === 'forum'">
            <AdminForumSection />
          </template>

          <template v-else-if="tab === 'users'">
            <AdminUsersSection />
          </template>

          <template v-else-if="tab === 'announcements'">
            <AdminAnnouncementsSection />
          </template>

          <template v-else-if="tab === 'settings'">
            <AdminSettingsSection />
          </template>

        </div>
      </Transition>
    </template>
  </section>
</template>
