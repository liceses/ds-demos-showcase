<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useNotificationsStore } from '../stores/notifications'

const store = useNotificationsStore()

onMounted(() => {
  store.startPolling()
})
onBeforeUnmount(() => {
  store.stopPolling()
})
</script>

<template>
  <RouterLink class="notif-bell" to="/notifications" aria-label="通知">
    <svg class="notif-bell-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 2a7 7 0 0 0-7 7v3.3l-1.9 3.4A1 1 0 0 0 4 17h16a1 1 0 0 0 .9-1.3L19 12.3V9a7 7 0 0 0-7-7z"
        fill="currentColor"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      <path d="M9 20a3 3 0 0 0 6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <span v-if="store.unreadCount > 0" class="notif-dot">{{ store.unreadCount > 99 ? '99+' : store.unreadCount }}</span>
  </RouterLink>
</template>
