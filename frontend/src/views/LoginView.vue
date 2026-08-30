<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { t } from '../i18n'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  if (!username.value || !password.value) return
  submitting.value = true
  error.value = ''
  try {
    await auth.login(username.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
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
    <h1 class="huge">{{ t('auth.login', '登录') }}</h1>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="auth-card card card-coral" style="padding: 24px">
      <form class="form-stack" @submit.prevent="submit">
        <label class="field">
          {{ t('auth.username', '用户名') }}
          <input v-model="username" class="input" autocomplete="username" required />
        </label>
        <label class="field">
          {{ t('auth.password', '密码') }}
          <input v-model="password" class="input" type="password" autocomplete="current-password" required />
        </label>
        <div v-if="error" class="notice notice-error">{{ error }}</div>
        <button class="btn btn-primary btn-block btn-lg" type="submit" :disabled="submitting">
          {{ submitting ? t('auth.logining', '登录中…') : t('auth.login', '登录') }}
        </button>
        <p class="muted" style="text-align: center">
          {{ t('auth.noAccount', '还没有账号？') }}<RouterLink to="/register">{{ t('auth.toRegister', '去注册') }}</RouterLink>
        </p>
      </form>
    </div>
  </section>
</template>