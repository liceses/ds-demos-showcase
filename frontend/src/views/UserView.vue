<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary, User } from '../api/types'
import { useAuthStore } from '../stores/auth'
import DemoCard from '../components/DemoCard.vue'

const props = defineProps<{ username: string }>()
const auth = useAuthStore()

const user = ref<(User & { demo_count: number }) | null>(null)
const demos = ref<DemoSummary[]>([])
const loading = ref(true)
const error = ref('')

const isSelf = computed(() => !!auth.user && auth.user.username === props.username)

// 修改密码表单
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwdMsg = ref('')
const pwdError = ref('')
const pwdSubmitting = ref(false)

async function submitPassword() {
  pwdMsg.value = ''
  pwdError.value = ''
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    pwdError.value = '请填写完整'
    return
  }
  if (newPassword.value.length < 8) {
    pwdError.value = '新密码至少 8 位'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwdError.value = '两次输入的新密码不一致'
    return
  }
  pwdSubmitting.value = true
  try {
    await api.changePassword(oldPassword.value, newPassword.value)
    pwdMsg.value = '密码修改成功，下次登录请使用新密码'
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e) {
    pwdError.value = (e as Error).message
  } finally {
    pwdSubmitting.value = false
  }
}

onMounted(async () => {
  try {
    user.value = await api.getUser(props.username)
    const res = await api.listDemos({ status: 'approved', tags: [`author:${props.username}`], page_size: 50 })
    demos.value = res.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section v-if="loading" class="loading-row"><span class="spinner"></span> 加载用户…</section>
  <section v-else-if="error" class="empty-box">{{ error }}</section>

  <template v-else-if="user">
    <section class="page-hero">
      <span class="eyebrow">用户主页</span>
      <h1 class="huge">{{ user.username }}</h1>
      <p class="sub">{{ user.bio || '这个人很懒，还没有写简介。' }}</p>
      <div class="filter-row" style="margin-top: 16px">
        <span class="mini-stat"><b>{{ user.demo_count }}</b> Demo</span>
        <span class="mini-stat"><b>{{ user.role }}</b> 角色</span>
        <span class="mini-stat"><b>{{ new Date(user.created_at).toLocaleDateString('zh-CN') }}</b> 加入</span>
      </div>
    </section>

    <section v-if="isSelf" class="section" style="padding-top: 8px">
      <div class="auth-card card card-coral" style="padding: 24px; max-width: 480px">
        <h2 style="margin-bottom: 12px">修改密码</h2>
        <form class="form-stack" @submit.prevent="submitPassword">
          <label class="field">
            原密码
            <input v-model="oldPassword" class="input" type="password" autocomplete="current-password" required />
          </label>
          <label class="field">
            新密码（至少 8 位）
            <input v-model="newPassword" class="input" type="password" autocomplete="new-password" required />
          </label>
          <label class="field">
            确认新密码
            <input v-model="confirmPassword" class="input" type="password" autocomplete="new-password" required />
          </label>
          <div v-if="pwdError" class="notice notice-error">{{ pwdError }}</div>
          <div v-if="pwdMsg" class="notice notice-success">{{ pwdMsg }}</div>
          <button class="btn btn-primary btn-block" type="submit" :disabled="pwdSubmitting">
            {{ pwdSubmitting ? '提交中…' : '修改密码' }}
          </button>
        </form>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">TA 的 Demo</h2>
      </div>
      <div v-if="!demos.length" class="empty-box">还没有发布 Demo</div>
      <div v-else class="waterfall">
        <div v-for="d in demos" :key="d.slug" class="waterfall-item">
          <DemoCard :demo="d" />
        </div>
      </div>
    </section>
  </template>
</template>