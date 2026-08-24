<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { DemoDetail, TagKeyInfo } from '../api/types'

const route = useRoute()
const auth = useAuthStore()
const editSlug = typeof route.query.slug === 'string' ? route.query.slug : ''

const title = ref('')
const description = ref('')
const demoType = ref<'web' | 'zip' | 'link'>('web')
const externalUrl = ref('')
const prompt = ref('')
const videoUrl = ref('')
const coverFile = ref<File | null>(null)
const zipFile = ref<File | null>(null)
const commitMessage = ref('')
const keepOldVersion = ref(false)
const submitting = ref(false)
const uploadProgress = ref(0)
const error = ref('')
const dupSlug = ref<string | null>(null)
const success = ref<{ slug: string; status: string } | null>(null)
const loading = ref(false)

// 标签选择器
const tagKeys = ref<TagKeyInfo[]>([])
const selected = ref<Record<string, { value: string; description: string }[]>>({})
const inputs = ref<Record<string, { value: string; description: string }>>({})
const initialTagsKey = ref('')
const tagsOpen = ref(false)

// 申请新固定值（进入管理员审核）
const suggest = ref({ key: '', value: '', description: '' })
const suggestMsg = ref('')
const suggestError = ref('')
const fixedKeys = computed(() => tagKeys.value.filter((k) => k.mode === 'fixed'))

async function submitSuggestion() {
  suggestMsg.value = ''
  suggestError.value = ''
  if (!suggest.value.key || !suggest.value.value.trim()) {
    suggestError.value = '请选择固定键并填写新值'
    return
  }
  try {
    await api.suggestTagValue({
      key: suggest.value.key,
      value: suggest.value.value.trim(),
      description: suggest.value.description.trim(),
    })
    suggestMsg.value = '已提交，等待管理员审核'
    suggest.value = { key: '', value: '', description: '' }
  } catch (e) {
    suggestError.value = (e as Error).message
  }
}

// 宽屏（≥1281px）两栏布局：标签面板常驻右侧；窄屏默认收起、点横条展开
const isWide = ref(false)
let wideMq: MediaQueryList | null = null
function onWideChange(e: MediaQueryListEvent) {
  isWide.value = e.matches
}
onMounted(() => {
  wideMq = window.matchMedia('(min-width: 1281px)')
  isWide.value = wideMq.matches
  wideMq.addEventListener('change', onWideChange)
})
onBeforeUnmount(() => wideMq?.removeEventListener('change', onWideChange))

// 编辑模式附加状态
const demoTitle = ref('')
const currentCover = ref('')
const coverPreview = ref('')
const denied = ref(false)
const initial = ref({ title: '', description: '', demoType: 'web', externalUrl: '', prompt: '', videoUrl: '' })

const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }

function selectedOf(key: string): { value: string; description: string }[] {
  return selected.value[key] || []
}

/** 确保键在 selected 中存在（否则 push 到临时数组，状态不生效） */
function ensureList(key: string): { value: string; description: string }[] {
  if (!selected.value[key]) selected.value[key] = []
  return selected.value[key]
}

function toggleValue(key: string, value: string, description = '') {
  const list = ensureList(key)
  const i = list.findIndex((x) => x.value === value)
  if (i >= 0) list.splice(i, 1)
  else list.push({ value, description })
}

// open/int 的「已有值」建议：默认露前 8 个，更多可展开
const SUGGEST_SHOW = 8
const suggestExpanded = ref<Record<string, boolean>>({})
function suggestionValues(k: { key: string; values: { value: string; description: string; demo_count: number }[] }) {
  return suggestExpanded.value[k.key] ? k.values : k.values.slice(0, SUGGEST_SHOW)
}
function toggleSuggest(key: string) {
  suggestExpanded.value = { ...suggestExpanded.value, [key]: !suggestExpanded.value[key] }
}

function addValue(key: string) {
  const k = tagKeys.value.find((x) => x.key === key)
  // 注意：type="number" 时 v-model 会转成 number，必须 String() 后再 trim
  const raw = String(inputs.value[key]?.value ?? '').trim()
  if (!raw) return

  let final = raw
  if (k?.mode === 'int') {
    if (!/^-?\d+$/.test(raw)) {
      tagErrors.value[key] = '请输入整数'
      return
    }
    final = String(Number(raw))
  }

  if (selectedOf(key).some((x) => x.value === final)) {
    inputs.value[key] = { value: '', description: '' }
    tagErrors.value[key] = ''
    return
  }
  ensureList(key).push({ value: final, description: String(inputs.value[key]?.description ?? '').trim() })
  inputs.value[key] = { value: '', description: '' }
  tagErrors.value[key] = ''
}

function removeValue(key: string, value: string) {
  const list = selected.value[key]
  if (!list) return
  const i = list.findIndex((x) => x.value === value)
  if (i >= 0) list.splice(i, 1)
}

const tagErrors = ref<Record<string, string>>({})

const selectedCount = computed(() => Object.values(selected.value).reduce((n, arr) => n + arr.length, 0))
const selectedList = computed(() =>
  Object.entries(selected.value).flatMap(([key, values]) =>
    values.map((x) => ({ key, value: x.value, description: x.description })),
  ),
)

function collectTags() {
  const out: (string | { key: string; value: string; description?: string })[] = []
  for (const [key, values] of Object.entries(selected.value)) {
    const k = tagKeys.value.find((x) => x.key === key)
    for (const v of values) {
      if (k?.mode === 'fixed') {
        out.push(`${key}:${v.value}`)
      } else {
        out.push({ key, value: v.value, description: v.description || undefined })
      }
    }
  }
  return out
}

function prefillTags(tags: { key: string; value: string }[]) {
  const map: Record<string, { value: string; description: string }[]> = {}
  for (const t of tags) {
    if (t.key === 'author') continue
    if (!tagKeys.value.some((k) => k.key === t.key)) continue
    ;(map[t.key] = map[t.key] || []).push({ value: t.value, description: '' })
  }
  selected.value = map
  initialTagsKey.value = JSON.stringify(map)
}

onMounted(async () => {
  try {
    tagKeys.value = await api.listTagKeys()
  } catch {
    tagKeys.value = []
  }
  for (const k of tagKeys.value) {
    if (k.mode !== 'fixed') inputs.value[k.key] = { value: '', description: '' }
  }
  if (editSlug) {
    loading.value = true
    try {
      const demo: DemoDetail = await api.getDemo(editSlug)
      demoTitle.value = demo.title
      currentCover.value = demo.cover_url
      title.value = demo.title
      description.value = demo.description
      demoType.value = demo.demo_type || 'web'
      externalUrl.value = demo.external_url || ''
      prompt.value = demo.prompt || ''
      videoUrl.value = demo.video_url || ''
      prefillTags(demo.tags)
      initial.value = {
        title: demo.title,
        description: demo.description,
        demoType: demo.demo_type || 'web',
        externalUrl: demo.external_url || '',
        prompt: demo.prompt || '',
        videoUrl: demo.video_url || '',
      }
      const canEdit = auth.user?.role === 'admin' || auth.user?.username === demo.author
      if (!canEdit) {
        denied.value = true
        error.value = '你没有权限编辑这个 Demo'
      }
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }
})

function onCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] || null
  coverFile.value = file
  coverPreview.value = ''
  if (file) {
    const reader = new FileReader()
    reader.onload = () => {
      coverPreview.value = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  }
}

function onZipChange(e: Event) {
  zipFile.value = (e.target as HTMLInputElement).files?.[0] || null
}

const hasChanges = computed(() => {
  if (!editSlug) return true
  return (
    title.value.trim() !== initial.value.title ||
    description.value.trim() !== initial.value.description ||
    demoType.value !== initial.value.demoType ||
    externalUrl.value.trim() !== initial.value.externalUrl ||
    prompt.value.trim() !== initial.value.prompt ||
    videoUrl.value.trim() !== initial.value.videoUrl ||
    JSON.stringify(selected.value) !== initialTagsKey.value ||
    !!coverFile.value ||
    !!zipFile.value ||
    !!commitMessage.value.trim()
  )
})

async function submit() {
  // 防抖：提交中忽略重复触发（连点 / 回车连按）
  if (submitting.value) return
  if (!title.value.trim()) {
    error.value = '请填写标题'
    return
  }
  if (demoType.value === 'link') {
    if (!/^https?:\/\//.test(externalUrl.value.trim())) {
      error.value = '链接类型需要填写 http(s) 地址'
      return
    }
  } else if (!editSlug && !zipFile.value) {
    error.value = '请上传文件（zip 或单个 .html/.svg）'
    return
  }
  const tags = collectTags()

  // 编辑模式：没有任何改动时阻止提交，避免生成空公告
  if (editSlug && !hasChanges.value) {
    error.value = '没有任何修改，未提交'
    return
  }

  submitting.value = true
  uploadProgress.value = 0
  error.value = ''
  dupSlug.value = null
  success.value = null
  const onProgress = (p: number) => {
    uploadProgress.value = p
  }
  try {
    if (editSlug) {
      await api.updateDemo(
        editSlug,
        {
          title: title.value.trim(),
          description: description.value.trim(),
          tags,
          demo_type: demoType.value,
          external_url: demoType.value === 'link' ? externalUrl.value.trim() : externalUrl.value.trim() || undefined,
          prompt: prompt.value.trim(),
          video_url: videoUrl.value.trim() || undefined,
          cover: coverFile.value,
          file: zipFile.value,
          commit_message: commitMessage.value.trim() || undefined,
          keep_old_version: keepOldVersion.value,
        },
        onProgress,
      )
      success.value = { slug: editSlug, status: 'updated' }
    } else {
      success.value = await api.createDemo(
        {
          title: title.value.trim(),
          description: description.value.trim(),
          tags,
          demo_type: demoType.value,
          external_url: demoType.value === 'link' ? externalUrl.value.trim() : externalUrl.value.trim() || undefined,
          prompt: prompt.value.trim(),
          video_url: videoUrl.value.trim() || undefined,
          cover: coverFile.value,
          file: zipFile.value,
        },
        onProgress,
      )
    }
  } catch (e) {
    error.value = (e as Error).message
    // 409 内容重复：后端 detail 含 /demo/<slug>，解析出已有 demo 供跳转
    const m = /\/demo\/([^/\s]+)/.exec((e as Error).message)
    dupSlug.value = m ? m[1] : null
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">{{ editSlug ? '编辑 Demo' : '上传 Demo' }}</span>
    <h1 class="huge">{{ editSlug ? demoTitle || '编辑' : '上传' }}</h1>
    <p class="sub">
      {{ editSlug ? '修改作品信息或重新上传文件；改动会自动记录到时间线并生成更新公告。' : '支持网页应用 / 文件包（zip）/ 外部链接三种类型，可附提示词与介绍视频；未登录也能以公开用户身份发布。' }}
    </p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载 Demo…</div>

    <div v-else-if="denied" class="empty-box" style="max-width: 560px">
      <p style="margin-bottom: 18px">{{ error }}</p>
      <RouterLink class="btn btn-outline" to="/">返回首页</RouterLink>
    </div>

    <div v-else class="upload-grid" :class="{ 'panel-open': tagsOpen }">
      <div class="card card-default upload-form-card" style="padding: 24px">
        <form class="form-stack" @submit.prevent="submit">
        <label class="field">
          标题
          <input v-model="title" class="input" placeholder="Demo 标题" required />
        </label>
        <label class="field">
          描述
          <textarea v-model="description" class="input textarea" rows="3" placeholder="简要描述这个 Demo"></textarea>
        </label>

        <label class="field">
          Demo 类型
          <select v-model="demoType" class="input" style="max-width: 280px">
            <option value="web">网页应用（zip 或单个 .html/.svg）</option>
            <option value="zip">文件包（zip，无需 index.html）</option>
            <option value="link">外部链接（不传文件）</option>
          </select>
        </label>
        <label v-if="demoType === 'link'" class="field">
          外部链接地址（必填）
          <input v-model="externalUrl" class="input" placeholder="https://…" />
          <span class="hint">直接跳转打开，服务器不存储内容</span>
        </label>
        <label class="field">
          第一轮提示词（可选，展示为提示词卡片）
          <textarea v-model="prompt" class="input textarea" rows="4" placeholder="生成这个 Demo 时使用的第一轮提示词…"></textarea>
        </label>
        <label class="field">
          介绍视频链接（可选，服务器不存视频）
          <input v-model="videoUrl" class="input" placeholder="https://…（B站/YouTube 等）" />
        </label>

        <div class="tag-drawer-wrap">
          <button class="tag-drawer-bar" type="button" @click="tagsOpen = !tagsOpen">
            <span class="tag-drawer-stamp">可选</span>
            <span class="tag-drawer-title">标签（选填）</span>
            <span v-if="selectedList.length" class="tag-drawer-chips">
              <span
                v-for="s in selectedList"
                :key="s.key + ':' + s.value"
                class="tag-chip active"
                :title="s.description || ''"
              >
                {{ s.key }}:{{ s.value }}
              </span>
            </span>
            <span class="tag-drawer-count"><b>{{ selectedCount }}</b> 已选</span>
            <span v-if="!isWide" class="tag-drawer-toggle">{{ tagsOpen ? '收起 ←' : '展开 →' }}</span>
          </button>
        </div>

        <label class="field">
          封面{{ editSlug ? '（可选，不选保留当前封面）' : '（可选）' }}
          <input class="input" type="file" accept="image/png,image/jpeg,image/webp" @change="onCoverChange" />
          <div v-if="currentCover || coverPreview" class="cover-preview">
            <img :src="coverPreview || currentCover" alt="封面预览" />
            <span v-if="coverPreview" class="cover-preview-badge">新封面</span>
          </div>
        </label>
        <label v-if="demoType !== 'link'" class="field">
          文件{{ editSlug ? '（可选，不选则保留原文件）' : '' }}
          <input class="input" type="file" accept=".zip,application/zip,.html,.htm,.svg,text/html,image/svg+xml" @change="onZipChange" />
          <span class="hint">
            {{ demoType === 'web'
              ? '支持 zip（根目录需含 index.html）或单个 .html/.svg；单 HTML 必须自包含（内联 CSS/JS，双击可直接打开）'
              : 'zip 文件包（不要求 index.html）' }}
          </span>
        </label>
        <label v-if="editSlug" class="field">
          更新说明 / commit 信息（可选）
          <input v-model="commitMessage" class="input" placeholder="例如：修复第二关音效不同步的问题" />
          <span class="hint">会生成「作品更新公告」并写入时间线</span>
        </label>
        <label v-if="editSlug && zipFile && demoType !== 'link'" class="field" style="display: flex; gap: 8px; align-items: center">
          <input v-model="keepOldVersion" type="checkbox" style="width: 18px; height: 18px" />
          保留当前版本为独立旧版页面（上传新 zip 时生效）
        </label>

        <div v-if="error" class="notice notice-error">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
            <span>{{ error }}</span>
            <RouterLink v-if="dupSlug" class="btn btn-sm btn-outline" :to="`/demo/${dupSlug}`">查看已有 Demo →</RouterLink>
          </div>
        </div>
        <div v-if="success" class="notice notice-success">
          <p style="margin-bottom: 10px">{{ editSlug ? '更新成功，已生成更新公告。' : '上传成功。' }}</p>
          <div class="filter-row" style="margin: 0">
            <RouterLink class="btn btn-sm btn-primary" :to="`/demo/${success.status === 'updated' ? editSlug : success.slug}`">
              查看 Demo
            </RouterLink>
            <RouterLink class="btn btn-sm btn-outline" to="/">返回主页</RouterLink>
          </div>
        </div>

        <div v-if="submitting" class="upload-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div>
          </div>
          <span class="hint">
            {{ uploadProgress >= 100 ? '已上传，服务器处理中（解压 / 传 OSS）…' : `上传中 ${uploadProgress}%` }}
          </span>
        </div>

        <button class="btn btn-primary btn-lg btn-block" type="submit" :disabled="submitting">
          {{ submitting ? (uploadProgress >= 100 ? '处理中…' : `上传中 ${uploadProgress}%`) : editSlug ? '保存修改' : '上传' }}
        </button>
      </form>
      </div>

      <div class="tag-drawer-panel" :class="{ 'panel-hidden': !(tagsOpen || isWide) }">
        <div class="tag-drawer-head">
          <span class="hint">固定值点选 · 自定义值输入添加 · 数字值填整数 · author 系统保留</span>
        </div>

        <div v-for="k in tagKeys" :key="k.key" class="tag-key-row" :class="'mode-' + k.mode">
          <div class="tag-key-head">
            <b>{{ k.label || k.key }} <code>{{ k.key }}</code></b>
            <span class="mode-badge" :class="'mode-badge-' + k.mode">{{ modeLabel[k.mode] }}</span>
          </div>

          <div v-if="k.key === 'model'" class="tag-key-hint">
            灰测 Demo 专属标签：<code>ds-unknown</code>
          </div>

          <div v-if="k.mode === 'fixed'">
            <TransitionGroup name="chip" tag="div" class="filter-row" style="margin: 0">
              <button
                v-for="v in k.values"
                :key="v.value"
                class="tag-chip mode-fixed"
                :class="{ active: selectedOf(k.key).some((x) => x.value === v.value) }"
                type="button"
                @click="toggleValue(k.key, v.value)"
              >
                {{ v.value }}
                <span class="count">{{ v.demo_count }}</span>
              </button>
            </TransitionGroup>
          </div>

          <div v-else class="form-stack">
            <div class="filter-row" style="margin: 0">
              <input
                v-model="inputs[k.key].value"
                class="input"
                :type="k.mode === 'int' ? 'number' : 'text'"
                :placeholder="k.mode === 'int' ? '整数，如 3' : '自定义值，如 pvz'"
                style="max-width: 200px"
                @keyup.enter="addValue(k.key)"
                @input="tagErrors[k.key] = ''"
              />
              <input
                v-model="inputs[k.key].description"
                class="input"
                type="text"
                placeholder="介绍（可选，首次创建时写入）"
                style="max-width: 220px"
                @keyup.enter="addValue(k.key)"
              />
              <button class="btn btn-sm btn-secondary" type="button" @click="addValue(k.key)">添加</button>
            </div>
            <!-- 已有值建议：点选已存在的 value，避免重复造词 -->
            <div v-if="k.values.length" class="filter-row tag-suggest-row">
              <span class="filter-label tag-suggest-label">已有值</span>
              <button
                v-for="v in suggestionValues(k)"
                :key="v.value"
                class="tag-chip"
                :class="['mode-' + k.mode, { active: selectedOf(k.key).some((x) => x.value === v.value) }]"
                type="button"
                :title="v.description || v.value"
                @click="toggleValue(k.key, v.value, v.description || '')"
              >
                {{ v.value }}
                <span class="count">{{ v.demo_count }}</span>
              </button>
              <button
                v-if="k.values.length > SUGGEST_SHOW"
                class="tag-chip tag-strip-toggle"
                type="button"
                @click="toggleSuggest(k.key)"
              >
                {{ suggestExpanded[k.key] ? '收起' : `更多 +${k.values.length - SUGGEST_SHOW}` }}
              </button>
            </div>
            <div v-if="tagErrors[k.key]" class="notice notice-error" style="margin: 4px 0 0; padding: 6px 10px; font-size: 12px">
              {{ tagErrors[k.key] }}
            </div>
            <TransitionGroup name="chip" tag="div" class="filter-row" style="margin: 0; gap: 6px">
              <span
                v-for="v in selectedOf(k.key)"
                :key="v.value"
                class="tag-chip active"
                role="button"
                :title="v.description || '点击移除'"
                @click="removeValue(k.key, v.value)"
              >
                {{ v.value }}{{ v.description ? `（${v.description}）` : '' }}
                <span class="chip-x">X</span>
              </span>
            </TransitionGroup>
          </div>
        </div>

        <!-- 申请新固定值（进入管理员审核） -->
        <div class="tag-key-row" style="margin-top: 12px">
          <div class="tag-key-head">
            <b>申请新固定值</b>
            <span class="hint">提交后管理员审核，通过才成为正式候选</span>
          </div>
          <div class="form-stack">
            <div class="filter-row" style="margin: 0">
              <select v-model="suggest.key" class="input" style="max-width: 160px">
                <option value="">选择固定键…</option>
                <option v-for="k in fixedKeys" :key="k.key" :value="k.key">{{ k.key }}（{{ k.label }}）</option>
              </select>
              <input v-model="suggest.value" class="input" style="max-width: 180px" placeholder="新值，如 dsv4-ultra" />
              <input v-model="suggest.description" class="input" style="max-width: 200px" placeholder="介绍（可选）" />
              <button class="btn btn-sm btn-secondary" type="button" @click="submitSuggestion">申请</button>
            </div>
            <span v-if="suggestError" class="notice notice-error" style="margin: 4px 0 0; padding: 6px 10px; font-size: 12px">{{ suggestError }}</span>
            <span v-if="suggestMsg" class="notice notice-success" style="margin: 4px 0 0; padding: 6px 10px; font-size: 12px">{{ suggestMsg }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
