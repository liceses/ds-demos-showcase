<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api'
import { t } from '../i18n'

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
    pwdError.value = t('settings.errComplete', '请填写完整')
    return
  }
  if (newPassword.value.length < 8) {
    pwdError.value = t('settings.errShort', '新密码至少 8 位')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwdError.value = t('settings.errMismatch', '两次输入的新密码不一致')
    return
  }
  pwdSubmitting.value = true
  try {
    await api.changePassword(oldPassword.value, newPassword.value)
    pwdMsg.value = t('settings.ok', '密码修改成功，下次登录请使用新密码')
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e) {
    pwdError.value = (e as Error).message
  } finally {
    pwdSubmitting.value = false
  }
}
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">{{ t('settings.eyebrow', '账户设置') }}</span>
    <h1 class="huge">{{ t('settings.title', '设置') }}</h1>
    <p class="sub">{{ t('settings.sub', '修改你的登录密码。密码修改后，下次登录请使用新密码。') }}</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="auth-card card card-coral" style="padding: 24px">
      <h2 style="margin-bottom: 12px">{{ t('settings.changePwd', '修改密码') }}</h2>
      <form class="form-stack" @submit.prevent="submitPassword">
        <label class="field">
          {{ t('settings.oldPwd', '原密码') }}
          <input v-model="oldPassword" class="input" type="password" autocomplete="current-password" required />
        </label>
        <label class="field">
          {{ t('settings.newPwd', '新密码（至少 8 位）') }}
          <input v-model="newPassword" class="input" type="password" autocomplete="new-password" required />
        </label>
        <label class="field">
          {{ t('settings.confirmPwd', '确认新密码') }}
          <input v-model="confirmPassword" class="input" type="password" autocomplete="new-password" required />
        </label>
        <div v-if="pwdError" class="notice notice-error">{{ pwdError }}</div>
        <div v-if="pwdMsg" class="notice notice-success">{{ pwdMsg }}</div>
        <button class="btn btn-primary btn-block" type="submit" :disabled="pwdSubmitting">
          {{ pwdSubmitting ? t('settings.submitting', '提交中…') : t('settings.changePwd', '修改密码') }}
        </button>
      </form>
    </div>
  </section>
</template>
