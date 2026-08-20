<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { isMock } from './api'
import ConfirmHost from './components/ConfirmHost.vue'
import ToastHost from './components/ToastHost.vue'

const auth = useAuthStore()
const route = useRoute()
const username = computed(() => auth.user?.username ?? '')
</script>

<template>
  <div class="app-shell">
    <header class="topbar container">
      <RouterLink to="/" class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-name">AI 全民<br />制作人</span>
      </RouterLink>

      <nav class="topnav">
        <RouterLink class="nav-link" to="/">首页</RouterLink>
        <RouterLink class="nav-link" to="/demos">作品库</RouterLink>
        <RouterLink class="nav-link" to="/tags">标签</RouterLink>
        <RouterLink class="nav-link" to="/upload">上传 Demo</RouterLink>
        <RouterLink v-if="auth.isAdmin()" class="nav-link" to="/admin">管理后台</RouterLink>
      </nav>

      <div class="topnav">
        <template v-if="auth.isLoggedIn()">
          <RouterLink class="nav-link" :to="`/user/${username}`">{{ username }}</RouterLink>
          <button class="btn btn-sm btn-dark" type="button" @click="auth.logout()">退出</button>
        </template>
        <template v-else>
          <RouterLink class="nav-link" to="/login">登录</RouterLink>
          <RouterLink class="btn btn-sm btn-primary" to="/register">注册</RouterLink>
        </template>
      </div>
    </header>

    <div v-if="isMock" class="container">
      <div class="notice notice-warn" style="margin-top: 14px">
        <strong>Mock 模式</strong>：当前使用内置占位数据，未连接后端。设置 <code>VITE_USE_MOCK=false</code> 后切换到真实 API。
      </div>
    </div>

    <main class="container" style="flex: 1">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <div :key="route.fullPath" class="page-wrap">
            <component :is="Component" />
          </div>
        </Transition>
      </RouterView>
    </main>

    <footer class="footer container">
      <div class="mono">AI 全民制作人 · AI 网页 Demo 作品集</div>
      <div class="mono">时间线仅表示创建/更新记录，不等同于 AI 生成真实性证明</div>
    </footer>

    <ConfirmHost />
    <ToastHost />
  </div>
</template>
