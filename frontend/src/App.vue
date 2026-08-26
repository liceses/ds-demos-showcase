<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { isMock } from './api'
import ConfirmHost from './components/ConfirmHost.vue'
import ToastHost from './components/ToastHost.vue'
import ForumHeader from './components/ForumHeader.vue'

const auth = useAuthStore()
const route = useRoute()
const username = computed(() => auth.user?.username ?? '')
const mobileOpen = ref(false)
const keepAlivePages = ['HomeView', 'DemosView', 'TagListView', 'LeaderboardView', 'ForumListView']
// 保留页按 name 做 key（同页返回复用实例）；其他页按 fullPath（参数变化强制重挂载）
const pageKey = computed(() => (route.meta.keepAlive ? route.name : route.fullPath))

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)

const menuItems = [
  { to: '/', label: '首页' },
  { to: '/demos', label: '作品库' },
  { to: '/leaderboard', label: '排行榜' },
  { to: '/tags', label: '标签' },
  { to: '/upload', label: '上传 Demo' },
  { to: '/about', label: '关于本站' },
]
</script>

<template>
  <div class="app-shell" :class="{ 'forum-shell': route.meta.forum }">
    <template v-if="!route.meta.forum">
    <header class="topbar container">
      <RouterLink to="/" class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-name">AI 全民<br />制作人</span>
      </RouterLink>

      <nav class="topnav topnav-desktop">
        <RouterLink class="nav-link" to="/">首页</RouterLink>
        <RouterLink class="nav-link" to="/demos">作品库</RouterLink>
        <RouterLink class="nav-link" to="/leaderboard">排行榜</RouterLink>
        <RouterLink class="nav-link" to="/tags">标签</RouterLink>
        <RouterLink class="nav-link" to="/upload">上传 Demo</RouterLink>
        <RouterLink v-if="auth.isAdmin()" class="nav-link" to="/admin">管理后台</RouterLink>
      </nav>

      <div class="topnav topnav-desktop">
        <template v-if="auth.isLoggedIn()">
          <RouterLink class="nav-link" :to="`/user/${username}`">{{ username }}</RouterLink>
          <button class="btn btn-sm btn-dark" type="button" @click="auth.logout()">退出</button>
        </template>
        <template v-else>
          <RouterLink class="nav-link" to="/login">登录</RouterLink>
          <RouterLink class="btn btn-sm btn-primary" to="/register">注册</RouterLink>
        </template>
      </div>

      <button
        class="mobile-nav-toggle"
        type="button"
        :aria-expanded="mobileOpen"
        aria-label="打开菜单"
        @click="mobileOpen = !mobileOpen"
      >
        <span></span><span></span><span></span>
      </button>
    </header>

    <!-- 移动端抽屉 -->
    <Transition name="mobile-drawer">
      <div v-if="mobileOpen" class="mobile-drawer" @click.self="mobileOpen = false">
        <div class="mobile-drawer-inner">
          <div class="mobile-drawer-head">
            <span class="mode-rail-stamp">菜单</span>
            <button class="mobile-drawer-close" type="button" @click="mobileOpen = false">X</button>
          </div>
          <nav class="mobile-drawer-nav">
            <RouterLink
              v-for="m in menuItems"
              :key="m.to"
              class="mobile-drawer-link"
              :class="{ active: route.path === m.to }"
              :to="m.to"
            >
              {{ m.label }}
              <span class="mobile-drawer-arrow">→</span>
            </RouterLink>
            <RouterLink v-if="auth.isAdmin()" class="mobile-drawer-link" :to="'/admin'">
              管理后台 <span class="mobile-drawer-arrow">→</span>
            </RouterLink>
          </nav>
          <div class="mobile-drawer-foot">
            <template v-if="auth.isLoggedIn()">
              <RouterLink class="btn btn-outline btn-block" :to="`/user/${username}`">{{ username }}</RouterLink>
              <button class="btn btn-dark btn-block" type="button" @click="auth.logout()">退出</button>
            </template>
            <template v-else>
              <RouterLink class="btn btn-outline btn-block" to="/login">登录</RouterLink>
              <RouterLink class="btn btn-primary btn-block" to="/register">注册</RouterLink>
            </template>
          </div>
        </div>
      </div>
    </Transition>
    </template>

    <ForumHeader v-if="route.meta.forum" />

    <div v-if="isMock" class="container">
      <div class="notice notice-warn" style="margin-top: 14px">
        <strong>Mock 模式</strong>：当前使用内置占位数据，未连接后端。设置 <code>VITE_USE_MOCK=false</code> 后切换到真实 API。
      </div>
    </div>

    <main class="container" :class="{ 'forum-container': route.meta.forum }" style="flex: 1">
      <RouterView v-slot="{ Component }">
        <KeepAlive :include="keepAlivePages">
          <component :is="Component" :key="pageKey" />
        </KeepAlive>
      </RouterView>
    </main>

    <template v-if="!route.meta.forum">
      <footer class="footer container">
        <div class="mono">AI 全民制作人 · AI 网页 Demo 作品集</div>
        <div class="mono">时间线仅表示创建/更新记录，不等同于 AI 生成真实性证明</div>
      </footer>
    </template>

    <ConfirmHost />
    <ToastHost />
  </div>
</template>
