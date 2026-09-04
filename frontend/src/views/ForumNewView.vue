<script setup lang="ts">
defineOptions({ name: 'ForumNewView' })
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useUiStore } from '../stores/ui'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import TagPicker from '../components/TagPicker.vue'
import { errorMessage } from '../utils/error'
import { t, forumCatLabel } from '../i18n'

const router = useRouter()
const route = useRoute()
const ui = useUiStore()

const prefillDemo = ref(typeof route.query.demo === 'string' ? route.query.demo : '')
// M1-A 空态出口「去论坛求助」：作品库分面词经 ?title= 预填标题（03 §4.5-3，把求助的起手式铺平）
const prefillTitle = ref(typeof route.query.title === 'string' ? route.query.title : '')
const title = ref(prefillTitle.value)
const category = ref(prefillTitle.value ? '求助' : '交流')
if (prefillDemo.value) category.value = 'demo'
const tagsPicked = ref<{ key: string; value: string; description?: string }[]>([])
const content = ref('')
const submitting = ref(false)
const error = ref('')
const submitted = ref(false)

const categories = ['交流', '分享', '求助', 'demo', '公告']

async function submit() {
  error.value = ''
  if (!title.value.trim()) {
    error.value = t('forumNew.errTitle', '请填写标题')
    return
  }
  if (!content.value.trim()) {
    error.value = t('forumNew.errContent', '请填写正文')
    return
  }
  submitting.value = true
  try {
    const topic = await api.createForumTopic({
      title: title.value.trim(),
      content: content.value.trim(),
      category: category.value,
      tags: tagsPicked.value.map((p) => `${p.key}:${p.value}`),
      demo_slug: prefillDemo.value || undefined,
    })
    if (topic.status && topic.status !== 'normal') {
      submitted.value = true
      ui.toast(t('forum.reviewing', '已提交，等待审核'), 'success')
    } else {
      ui.toast(t('forumNew.ok', '发帖成功'), 'success')
      router.push(`/forum/topic/${topic.id}`)
    }
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="route-page">  <section class="forum-hero">
    <div class="forum-hero-inner">
      <h1 class="forum-title">{{ t('forum.newPost', '发帖') }}</h1>
      <p class="forum-sub">{{ t('forumNew.sub', '用 Markdown 写正文，可关联 Demo 或贴内部链接。') }}</p>
    </div>
  </section>

  <section class="forum-section">
    <div class="card forum-new-card">
      <div class="form-stack">
        <div v-if="prefillDemo" class="notice notice-info">{{ t('forumNew.linkedDemo', '关联作品：') }}<code>{{ prefillDemo }}</code></div>
        <label class="field">
          {{ t('forumNew.title', '标题') }}
          <input v-model="title" class="input" :placeholder="t('forumNew.titlePlaceholder', '主题标题')" />
        </label>
        <label class="field">
          {{ t('forum.categories', '分类') }}
          <div class="filter-row" style="margin: 0">
            <button v-for="c in categories" :key="c" class="tag-chip" :class="{ active: category === c }" type="button" @click="category = c">{{ forumCatLabel(c) }}</button>
          </div>
        </label>
        <div class="field">
          <span class="field-label">{{ t('forumNew.tagsOptional', '标签（可选）') }}</span>
          <TagPicker v-model="tagsPicked" />
        </div>
        <label class="field">
          {{ t('forumNew.content', '正文') }}
          <MarkdownEditor v-model="content" :rows="8" :placeholder="t('forumNew.contentPlaceholder', '支持 Markdown，贴 /demo/xxx 会自动变成作品卡…')" />
        </label>
        <div v-if="error" class="notice notice-error">{{ error }}</div>
        <div v-if="submitted" class="notice notice-success">
          <p style="margin: 0 0 10px">{{ t('forum.reviewing', '已提交，等待审核。') }}</p>
          <RouterLink class="btn btn-sm btn-outline" to="/forum">{{ t('forumNew.backToForum', '返回讨论区') }}</RouterLink>
        </div>
        <button v-if="!submitted" class="btn btn-primary btn-lg" type="button" :disabled="submitting" @click="submit">{{ submitting ? t('forumNew.publishing', '发布中…') : t('forumNew.publish', '发布') }}</button>
      </div>
    </div>
  </section>
  </div>
</template>
