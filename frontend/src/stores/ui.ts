import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastItem[]>([])
  const confirmState = ref<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)
  let toastId = 0

  function toast(message: string, type: ToastItem['type'] = 'info') {
    const id = ++toastId
    toasts.value.push({ id, message, type })
    setTimeout(() => removeToast(id), 3200)
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      confirmState.value = { options, resolve }
    })
  }

  function resolveConfirm(v: boolean) {
    confirmState.value?.resolve(v)
    confirmState.value = null
  }

  return { toasts, confirmState, toast, removeToast, confirm, resolveConfirm }
})
