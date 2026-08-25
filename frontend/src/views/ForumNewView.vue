<script setup lang="ts">
defineOptions({ name: 'ForumNewView' })
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useUiStore } from '../stores/ui'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'

const router = useRouter()
const ui = useUiStore()

const title = ref('')
const category = ref('交流')
const tagsText = ref('')
const content = ref('')
const preview = ref(false)
const submitting = ref(false)
const error = ref('')

const categories = ['交流', '分享', '求助', 'demo', '公告']

async function submit() {
  error.value = ''
  if (!title.value.trim()) {
    error.value = '请填写标题'
    return
  }
  if (!content.value.trim()) {
    error.value = '请填写正文'
    return
  }
  submitting.value = true
  try {
    const t = await api.createForumTopic({
      title: title.value.trim(),
      content: content.value.trim(),
      category: category.value,
      tags: tagsText.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    })
    ui.toast('发帖成功', 'success')
    router.push(`/forum/topic/${t.id}`)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="forum-hero">
    <div class="forum-hero-inner">
      <h1 class="forum-title">发帖</h1>
      <p class="forum-sub">用 Markdown 写正文，可关联 Demo 或贴内部链接。</p>
    </div>
  </section>

  <section class="forum-section">
    <div class="card forum-new-card">
      <div class="form-stack">
        <label class="field">
          标题
          <input v-model="title" class="input" placeholder="主题标题" />
        </label>
        <label class="field">
          分类
          <div class="filter-row" style="margin: 0">
            <button v-for="c in categories" :key="c" class="tag-chip" :class="{ active: category === c }" type="button" @click="category = c">{{ c }}</button>
          </div>
        </label>
        <label class="field">
          标签（逗号分隔，可选）
          <input v-model="tagsText" class="input" placeholder="如 model:dsv4-flash, type:game" />
        </label>
        <label class="field">
          正文
          <div class="filter-row" style="margin-bottom: 8px">
            <button class="btn btn-sm btn-outline" type="button" @click="preview = !preview">{{ preview ? '编辑' : '预览' }}</button>
          </div>
          <textarea v-if="!preview" v-model="content" class="input textarea" rows="8" placeholder="支持 Markdown，贴 /demo/xxx 会自动变成作品卡…"></textarea>
          <MarkdownRenderer v-else :content="content" />
        </label>
        <div v-if="error" class="notice notice-error">{{ error }}</div>
        <button class="btn btn-primary btn-lg" type="button" :disabled="submitting" @click="submit">{{ submitting ? '发布中…' : '发布' }}</button>
      </div>
    </div>
  </section>
</template>
