<script setup lang="ts">
defineOptions({ name: 'ForumNewView' })
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useUiStore } from '../stores/ui'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import TagPicker from '../components/TagPicker.vue'

const router = useRouter()
const route = useRoute()
const ui = useUiStore()

const prefillDemo = ref(typeof route.query.demo === 'string' ? route.query.demo : '')
const title = ref('')
const category = ref('交流')
const tagsPicked = ref<{ key: string; value: string; description?: string }[]>([])
const content = ref('')
const preview = ref(false)
const submitting = ref(false)
const error = ref('')
const submitted = ref(false)

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
      tags: tagsPicked.value.map((p) => `${p.key}:${p.value}`),
      demo_slug: prefillDemo.value || undefined,
    })
    if (t.status && t.status !== 'normal') {
      submitted.value = true
      ui.toast('已提交，等待审核', 'success')
    } else {
      ui.toast('发帖成功', 'success')
      router.push(`/forum/topic/${t.id}`)
    }
  } catch (e) {
    const err = e as Error & { cause?: unknown }
    error.value = err.cause === 429 ? '操作过于频繁，请稍后再试' : err.message
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
        <div v-if="prefillDemo" class="notice notice-info">关联作品：<code>{{ prefillDemo }}</code></div>
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
        <div class="field">
          <span class="field-label">标签（可选）</span>
          <TagPicker v-model="tagsPicked" />
        </div>
        <label class="field">
          正文
          <div class="filter-row" style="margin-bottom: 8px">
            <button class="btn btn-sm btn-outline" type="button" @click="preview = !preview">{{ preview ? '编辑' : '预览' }}</button>
          </div>
          <textarea v-if="!preview" v-model="content" class="input textarea" rows="8" placeholder="支持 Markdown，贴 /demo/xxx 会自动变成作品卡…"></textarea>
          <MarkdownRenderer v-else :content="content" />
        </label>
        <div v-if="error" class="notice notice-error">{{ error }}</div>
        <div v-if="submitted" class="notice notice-success">
          <p style="margin: 0 0 10px">已提交，等待审核。</p>
          <RouterLink class="btn btn-sm btn-outline" to="/forum">返回讨论区</RouterLink>
        </div>
        <button v-if="!submitted" class="btn btn-primary btn-lg" type="button" :disabled="submitting" @click="submit">{{ submitting ? '发布中…' : '发布' }}</button>
      </div>
    </div>
  </section>
</template>
