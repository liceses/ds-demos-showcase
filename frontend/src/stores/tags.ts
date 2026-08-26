import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api'
import type { TagKeyInfo } from '../api/types'

/** 标签键全局缓存：UploadView / TagPicker / TagList / AdminTags 共享，避免重复请求 */
export const useTagsStore = defineStore('tags', () => {
  const keys = ref<TagKeyInfo[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  async function load(force = false) {
    if ((loaded.value && !force) || loading.value) return keys.value
    loading.value = true
    try {
      keys.value = await api.listTagKeys()
      loaded.value = true
    } catch {
      keys.value = []
    } finally {
      loading.value = false
    }
    return keys.value
  }

  async function refresh() {
    loaded.value = false
    return load(true)
  }

  return { keys, loaded, loading, load, refresh }
})
