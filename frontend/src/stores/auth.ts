import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api'
import type { User } from '../api/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)

  const isLoggedIn = () => !!user.value
  const isAdmin = () => user.value?.role === 'admin'

  async function fetchMe() {
    try {
      user.value = await api.me()
    } catch {
      user.value = null
    }
    return user.value
  }

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const res = await api.login(username, password)
      user.value = res.user
      return res.user
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, password: string) {
    loading.value = true
    try {
      const res = await api.register(username, password)
      user.value = res.user
      return res.user
    } finally {
      loading.value = false
    }
  }

  /**
   * 直接用接口返回值更新本地 user（不必再 fetchMe 一趟）。
   * 为什么必须有：PATCH /auth/me、上传/移除头像、切换隐私开关都返回新的 user，
   * 而 store 原先只有 fetchMe/login/register/logout —— 改完 UI 不会变，用户会以为没生效。
   */
  function setUser(u: User | null) {
    user.value = u
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      user.value = null
    }
  }

  return { user, loading, isLoggedIn, isAdmin, fetchMe, login, register, logout, setUser }
})
