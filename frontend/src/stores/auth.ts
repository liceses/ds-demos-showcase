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

  async function logout() {
    try {
      await api.logout()
    } finally {
      user.value = null
    }
  }

  return { user, loading, isLoggedIn, isAdmin, fetchMe, login, register, logout }
})
