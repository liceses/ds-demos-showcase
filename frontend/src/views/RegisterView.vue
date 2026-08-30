<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { t } from '../i18n'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  if (!username.value || !password.value) return
  if (password.value !== confirm.value) {
    error.value = t('auth.pwdMismatch', '两次输入的密码不一致')
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await auth.register(username.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">{{ t('auth.eyebrow', '账户') }}</span>
    <h1 class="huge">{{ t('auth.register', '注册') }}</h1>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="auth-card card card-mint" style="padding: 24px">
      <form class="form-stack" @submit.prevent="submit">
        <label class="field">
          {{ t('auth.username', '用户名') }}
          <input v-model="username" class="input" autocomplete="username" :placeholder="t('auth.usernamePlaceholder', '3-32 位字母数字下划线')" required />
          <span class="hint">{{ t('auth.usernameHint', '3–32 位，仅限字母、数字、下划线') }}</span>
        </label>
        <label class="field">
          {{ t('auth.password', '密码') }}
          <input v-model="password" class="input" type="password" autocomplete="new-password" :placeholder="t('auth.passwordPlaceholder', '至少 8 位')" required />
        </label>
        <label class="field">
          {{ t('auth.confirmPassword', '确认密码') }}
          <input v-model="confirm" class="input" type="password" autocomplete="new-password" required />
        </label>
        <div v-if="error" class="notice notice-error">{{ error }}</div>
        <button class="btn btn-secondary btn-block btn-lg" type="submit" :disabled="submitting">
          {{ submitting ? t('auth.registering', '注册中…') : t('auth.createAccount', '创建账号') }}
        </button>
        <p class="muted" style="text-align: center">
          {{ t('auth.hasAccount', '已有账号？') }}<RouterLink to="/login">{{ t('auth.toLogin', '去登录') }}</RouterLink>
        </p>
      </form>
    </div>
  </section>
</template>