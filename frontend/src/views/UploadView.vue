<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { DemoDetail } from '../api/types'

const route = useRoute()
const auth = useAuthStore()
const editSlug = typeof route.query.slug === 'string' ? route.query.slug : ''

const title = ref('')
const description = ref('')
const tagsText = ref('')
const coverFile = ref<File | null>(null)
const zipFile = ref<File | null>(null)
const commitMessage = ref('')
const keepOldVersion = ref(false)
const submitting = ref(false)
const error = ref('')
const success = ref<{ slug: string; status: string } | null>(null)
const loading = ref(false)

// 编辑模式附加状态
const demoTitle = ref('')
const currentCover = ref('')
const coverPreview = ref('')
const denied = ref(false)
const initial = ref({ title: '', description: '', tagsText: '' })

onMounted(async () => {
  if (editSlug) {
    loading.value = true
    try {
      const demo: DemoDetail = await api.getDemo(editSlug)
      demoTitle.value = demo.title
      currentCover.value = demo.cover_url
      title.value = demo.title
      description.value = demo.description
      tagsText.value = demo.tags.filter((t) => t.key !== 'author').map((t) => `${t.key}:${t.value}`).join('\n')
      initial.value = { title: demo.title, description: demo.description, tagsText: tagsText.value.trim() }
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

async function submit() {
  if (!title.value.trim()) {
    error.value = '请填写标题'
    return
  }
  if (!editSlug && !zipFile.value) {
    error.value = '请上传 zip 文件'
    return
  }
  const tags = tagsText.value.split('\n').map((s) => s.trim()).filter(Boolean)

  // 编辑模式：没有任何改动时阻止提交，避免生成空 commit + 空公告
  if (editSlug) {
    const changed =
      title.value.trim() !== initial.value.title ||
      description.value.trim() !== initial.value.description ||
      tags.join('\n') !== initial.value.tagsText ||
      !!coverFile.value ||
      !!zipFile.value ||
      !!commitMessage.value.trim()
    if (!changed) {
      error.value = '没有任何修改，未提交'
      return
    }
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
      {{ editSlug ? '修改作品信息或重新上传文件；改动会写入 git commit 并自动生成更新公告。' : '上传一个包含 index.html 的 zip 压缩包，系统会自动解压、初始化 Git 仓库并生成封面。' }}
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
        <label class="field">
          标签（每行一个 k:v）
          <textarea v-model="tagsText" class="input textarea input-mint" rows="5" placeholder="model:dsv4-flash&#10;type:effect&#10;skills:J-space"></textarea>
          <span class="hint">最多 20 个；author 为系统保留标签，无需填写</span>
        </label>
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
          <span class="hint">会生成「作品更新公告」</span>
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
