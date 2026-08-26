<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import NotificationBell from './NotificationBell.vue'

const auth = useAuthStore()

const route = useRoute()
</script>

<template>
  <header class="forum-topbar">
    <div class="forum-topbar-inner">
      <RouterLink to="/forum" class="forum-brand">讨论区</RouterLink>
      <nav class="forum-nav">
        <RouterLink class="forum-nav-link" :class="{ active: route.path === '/forum' }" to="/forum">最新</RouterLink>
        <RouterLink class="forum-nav-link" :class="{ active: route.path === '/forum' && route.query.sort === 'popular' }" to="/forum?sort=popular">热门</RouterLink>
        <RouterLink class="forum-nav-link" :class="{ active: route.path === '/forum/new' }" to="/forum/new">发帖</RouterLink>
      </nav>
      <NotificationBell v-if="auth.isLoggedIn()" />
      <RouterLink class="forum-back" to="/">← 回作品站</RouterLink>
    </div>
  </header>
</template>
