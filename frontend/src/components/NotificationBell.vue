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
    <span class="notif-bell-icon">通知</span>
    <span v-if="store.unreadCount > 0" class="notif-dot">{{ store.unreadCount > 99 ? '99+' : store.unreadCount }}</span>
  </RouterLink>
</template>
