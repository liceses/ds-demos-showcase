<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { Comment } from '../api/types'

defineOptions({ name: 'CommentTree' })

const props = defineProps<{
  slug: string
  comments: Comment[]
  onPosted?: () => void
}>()

const auth = useAuthStore()
const replyTo = ref<number | null>(null)
const content = ref('')
const posting = ref(false)
const error = ref('')

async function submit(parentId: number | null) {
  if (!content.value.trim()) return
  posting.value = true
  error.value = ''
  try {
    await api.postComment(props.slug, content.value.trim(), parentId)
    content.value = ''
    replyTo.value = null
    props.onPosted?.()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    posting.value = false
  }
}
</script>

<template>
  <div>
    <div v-for="c in comments" :key="c.id" class="comment-box">
      <div class="comment-box-head">
        <span>{{ c.username }}</span>
        <span>{{ new Date(c.created_at).toLocaleString('zh-CN') }}</span>
      </div>
      <div class="comment-body">
        <p>{{ c.content }}</p>
        <button v-if="auth.isLoggedIn()" class="btn btn-sm btn-outline" type="button" @click="replyTo = replyTo === c.id ? null : c.id">
          {{ replyTo === c.id ? '取消回复' : '回复' }}
        </button>
        <div v-if="replyTo === c.id" class="comment-children" style="margin: 12px 0 0">
          <textarea v-model="content" class="input textarea" placeholder="写下回复…" rows="3"></textarea>
          <div class="filter-row" style="margin-top: 8px">
            <button class="btn btn-sm btn-primary" type="button" :disabled="posting || !content.trim()" @click="submit(c.id)">
              {{ posting ? '提交中…' : '提交回复' }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="c.children?.length" class="comment-children">
        <CommentTree :slug="slug" :comments="c.children" :on-posted="onPosted" />
      </div>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
  </div>
</template>
