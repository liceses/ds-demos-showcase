<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { DemoDetail, TagKeyInfo } from '../api/types'

const route = useRoute()
const auth = useAuthStore()
const editSlug = typeof route.query.slug === 'string' ? route.query.slug : ''

const title = ref('')
const description = ref('')
const coverFile = ref<File | null>(null)
const zipFile = ref<File | null>(null)
const commitMessage = ref('')
const keepOldVersion = ref(false)
const submitting = ref(false)
const error = ref('')
const success = ref<{ slug: string; status: string } | null>(null)
const loading = ref(false)

// 标签选择器
const tagKeys = ref<TagKeyInfo[]>([])
const selected = ref<Record<string, string[]>>({})
const inputs = ref<Record<string, string>>({})
const initialTagsKey = ref('')

// 编辑模式附加状态
const demoTitle = ref('')
const currentCover = ref('')
const coverPreview = ref('')
const denied = ref(false)
const initial = ref({ title: '', description: '' })

const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }

function selectedOf(key: string): string[] {
  return selected.value[key] || []
}

function toggleValue(key: string, value: string) {
  const list = selectedOf(key)
  const i = list.indexOf(value)
  if (i >= 0) list.splice(i, 1)
  else list.push(value)
}

function addValue(key: string) {
  const raw = (inputs.value[key] || '').trim()
  if (!raw) return
  if (selectedOf(key).includes(raw)) {
    inputs.value[key] = ''
    return
  }
  selectedOf(key).push(raw)
  inputs.value[key] = ''
}

function removeValue(key: string, value: string) {
  const list = selectedOf(key)
  const i = list.indexOf(value)
  if (i >= 0) list.splice(i, 1)
}

function collectTags(): string[] {
  const out: string[] = []
  for (const [key, values] of Object.entries(selected.value)) {
    for (const v of values) out.push(`${key}:${v}`)
  }
  return out
}

function prefillTags(tags: { key: string; value: string }[]) {
  const map: Record<string, string[]> = {}
  for (const t of tags) {
    if (t.key === 'author') continue
    if (!tagKeys.value.some((k) => k.key === t.key)) continue
    ;(map[t.key] = map[t.key] || []).push(t.value)
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
  if (editSlug) {
    loading.value = true
    try {
      const demo: DemoDetail = await api.getDemo(editSlug)
      demoTitle.value = demo.title
      currentCover.value = demo.cover_url
      title.value = demo.title
      description.value = demo.description
      prefillTags(demo.tags)
      initial.value = { title: demo.title, description: demo.description }
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
    JSON.stringify(selected.value) !== initialTagsKey.value ||
    !!coverFile.value ||
    !!zipFile.value ||
    !!commitMessage.value.trim()
  )
})

async function submit() {
  if (!title.value.trim()) {
    error.value = '请填写标题'
    return
  }
  if (!editSlug && !zipFile.value) {
    error.value = '请上传 zip 文件'
    return
  }
  const tags = collectTags()

  // 编辑模式：没有任何改动时阻止提交，避免生成空公告
  if (editSlug && !hasChanges.value) {
    error.value = '没有任何修改，未提交'
    return
  }

  submitting.value = true
  error.value = ''
  success.value = null
  try {
    if (editSlug) {
      await api.updateDemo(editSlug, {
        title: title.value.trim(),
        description: description.value.trim(),
        tags,
        cover: coverFile.value,
        file: zipFile.value,
        commit_message: commitMessage.value.trim() || undefined,
        keep_old_version: keepOldVersion.value,
      })
      success.value = { slug: editSlug, status: 'updated' }
    } else {
      success.value = await api.createDemo({
        title: title.value.trim(),
        description: description.value.trim(),
        tags,
        cover: coverFile.value,
        file: zipFile.value as File,
      })
    }
  } catch (e) {
    error.value = (e as Error).message
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
      {{ editSlug ? '修改作品信息或重新上传文件；改动会自动记录到时间线并生成更新公告。' : '上传一个包含 index.html 的 zip 压缩包，系统会自动解压并生成预览。' }}
    </p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载 Demo…</div>

    <div v-else-if="denied" class="empty-box" style="max-width: 560px">
      <p style="margin-bottom: 18px">{{ error }}</p>
      <RouterLink class="btn btn-outline" to="/">返回首页</RouterLink>
    </div>

    <div v-else class="card card-default" style="max-width: 760px; padding: 24px">
      <form class="form-stack" @submit.prevent="submit">
        <label class="field">
          标题
          <input v-model="title" class="input" placeholder="Demo 标题" required />
        </label>
        <label class="field">
          描述
          <textarea v-model="description" class="input textarea" rows="3" placeholder="简要描述这个 Demo"></textarea>
        </label>

        <div class="field">
          <span class="field-label">标签（按键选择/填写）</span>
          <div v-for="k in tagKeys" :key="k.key" class="tag-key-row">
            <div class="tag-key-head">
              <b>{{ k.label || k.key }} <code>{{ k.key }}</code></b>
              <span class="hint">{{ modeLabel[k.mode] }} · {{ k.description }}</span>
            </div>

            <div v-if="k.mode === 'fixed'" class="filter-row" style="margin: 0">
              <button
                v-for="v in k.values"
                :key="v.value"
                class="tag-chip"
                :class="{ active: selectedOf(k.key).includes(v.value) }"
                type="button"
                @click="toggleValue(k.key, v.value)"
              >
                {{ v.value }}
                <span class="count">{{ v.demo_count }}</span>
              </button>
            </div>

            <div v-else class="filter-row" style="margin: 0">
              <input
                v-model="inputs[k.key]"
                class="input"
                :type="k.mode === 'int' ? 'number' : 'text'"
                :placeholder="k.mode === 'int' ? '整数，如 3' : '自定义值，如 pvz'"
                style="max-width: 220px"
                @keyup.enter="addValue(k.key)"
              />
              <button class="btn btn-sm btn-secondary" type="button" @click="addValue(k.key)">添加</button>
              <span
                v-for="v in selectedOf(k.key)"
                :key="v"
                class="tag-chip active"
                role="button"
                title="点击移除"
                @click="removeValue(k.key, v)"
              >
                {{ v }} ×
              </span>
            </div>
          </div>
          <span class="hint">author 为系统保留标签，无需填写</span>
        </div>

        <label class="field">
          封面{{ editSlug ? '（可选，不选保留当前封面）' : '（可选）' }}
          <input class="input" type="file" accept="image/png,image/jpeg,image/webp" @change="onCoverChange" />
          <div v-if="currentCover || coverPreview" class="cover-preview">
            <img :src="coverPreview || currentCover" alt="封面预览" />
            <span v-if="coverPreview" class="cover-preview-badge">新封面</span>
          </div>
        </label>
        <label class="field">
          zip 文件{{ editSlug ? '（可选，不选则保留原文件）' : '' }}
          <input class="input" type="file" accept=".zip,application/zip" @change="onZipChange" />
          <span class="hint">根目录需包含 index.html；大小上限 50MB</span>
        </label>
        <label v-if="editSlug" class="field">
          更新说明 / commit 信息（可选）
          <input v-model="commitMessage" class="input" placeholder="例如：修复第二关音效不同步的问题" />
          <span class="hint">会生成「作品更新公告」并写入时间线</span>
        </label>
        <label v-if="editSlug && zipFile" class="field" style="display: flex; gap: 8px; align-items: center">
          <input v-model="keepOldVersion" type="checkbox" style="width: 18px; height: 18px" />
          保留当前版本为独立旧版页面（上传新 zip 时生效）
        </label>

        <div v-if="error" class="notice notice-error">{{ error }}</div>
        <div v-if="success" class="notice notice-success">
          <p style="margin-bottom: 10px">{{ editSlug ? '更新成功，已生成更新公告。' : '上传成功。' }}</p>
          <div class="filter-row" style="margin: 0">
            <RouterLink class="btn btn-sm btn-primary" :to="`/demo/${success.status === 'updated' ? editSlug : success.slug}`">
              查看 Demo
            </RouterLink>
            <RouterLink class="btn btn-sm btn-outline" to="/">返回主页</RouterLink>
          </div>
        </div>

        <button class="btn btn-primary btn-lg btn-block" type="submit" :disabled="submitting">
          {{ submitting ? '提交中…' : editSlug ? '保存修改' : '上传' }}
        </button>
      </form>
    </div>
  </section>
</template>
