<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { api } from './api'
import { isMock } from './api'
import { lang, setLang, t } from './i18n'
import { adminExempt, applyServerFunMode, funEffective, titleBase } from './utils/funMode'
import ConfirmHost from './components/ConfirmHost.vue'
import ToastHost from './components/ToastHost.vue'
import ForumHeader from './components/ForumHeader.vue'
import NotificationBell from './components/NotificationBell.vue'

const auth = useAuthStore()
const route = useRoute()
const username = computed(() => auth.user?.username ?? '')
const mobileOpen = ref(false)
const keepAlivePages = ['HomeView', 'DemosView', 'TagListView', 'LeaderboardView', 'ForumListView']
// 保留页按 name 做 key（同页返回复用实例）；其他页按 fullPath（参数变化强制重挂载）
const pageKey = computed(() => (route.meta.keepAlive ? route.name : route.fullPath))
// 整活模式：品牌文案随全站开关切换（/admin 豁免，恒显真实值）
const funOn = funEffective

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
    adminExempt.value = route.path.startsWith('/admin')
  },
  { immediate: true }, // 直接以 /admin 打开时也要立即生效
)

// 全站整活开关：拉 site-info 校正（60s 缓存，轻量）；失败保持 localStorage 预 seed
onMounted(() => {
  api
    .getSiteInfo()
    .then((info) => applyServerFunMode(!!info.display?.fun_mode))
    .catch(() => undefined)
})

const menuItems = [
  { to: '/', key: 'home', label: '首页' },
  { to: '/demos', key: 'demos', label: '作品库' },
  { to: '/leaderboard', key: 'leaderboard', label: '排行榜' },
  { to: '/tags', key: 'tags', label: '标签' },
  { to: '/upload', key: 'upload', label: '上传 Demo' },
  { to: '/about', key: 'about', label: '关于本站' },
]

// 语言切换：ref 响应式驱动全站（含 keepAlive 页）；<html lang> 同步
const switchLang = () => setLang(lang.value === 'en' ? 'zh' : 'en')
watchEffect(() => {
  document.documentElement.lang = lang.value === 'en' ? 'en' : 'zh-CN'
})
</script>

<template>
  <div class="app-shell" :class="{ 'forum-shell': route.meta.forum }">
    <template v-if="!route.meta.forum">
    <header class="topbar container">
      <RouterLink to="/" class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <!-- <br> 写模板字面量（{{ }} 插值会转义 HTML） -->
        <span v-if="funOn && lang === 'en'" class="brand-name">astra canary<br />collection</span>
        <span v-else-if="funOn" class="brand-name">astra 灰测<br />作品收集</span>
        <span v-else-if="lang === 'en'" class="brand-name">AI Demo<br />Makers</span>
        <span v-else class="brand-name">AI 全民<br />制作人</span>
      </RouterLink>

      <nav class="topnav topnav-desktop">
        <RouterLink class="nav-link" to="/">{{ t('app.nav.home', '首页') }}</RouterLink>
        <RouterLink class="nav-link" to="/demos">{{ t('app.nav.demos', '作品库') }}</RouterLink>
        <RouterLink class="nav-link" to="/leaderboard">{{ t('app.nav.leaderboard', '排行榜') }}</RouterLink>
        <RouterLink class="nav-link" to="/tags">{{ t('app.nav.tags', '标签') }}</RouterLink>
        <RouterLink class="nav-link" to="/upload">{{ t('app.nav.upload', '上传 Demo') }}</RouterLink>
        <RouterLink v-if="auth.isAdmin()" class="nav-link" to="/admin">{{ t('app.nav.admin', '管理后台') }}</RouterLink>
      </nav>

      <div class="topnav topnav-desktop">
        <button class="btn btn-sm btn-outline" type="button" :title="lang === 'en' ? '切换到中文' : 'Switch to English'" @click="switchLang">
          {{ lang === 'en' ? '中文' : 'EN' }}
        </button>
        <template v-if="auth.isLoggedIn()">
          <NotificationBell />
          <RouterLink class="nav-link" :to="`/user/${username}`">{{ username }}</RouterLink>
          <button class="btn btn-sm btn-dark" type="button" @click="auth.logout()">{{ t('app.nav.logout', '退出') }}</button>
        </template>
        <template v-else>
          <RouterLink class="nav-link" to="/login">{{ t('app.nav.login', '登录') }}</RouterLink>
          <RouterLink class="btn btn-sm btn-primary" to="/register">{{ t('app.nav.register', '注册') }}</RouterLink>
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
            <span class="mode-rail-stamp">{{ t('app.menu', '菜单') }}</span>
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
              {{ t('app.nav.' + m.key, m.label) }}
              <span class="mobile-drawer-arrow">→</span>
            </RouterLink>
            <RouterLink v-if="auth.isAdmin()" class="mobile-drawer-link" :to="'/admin'">
              {{ t('app.nav.admin', '管理后台') }} <span class="mobile-drawer-arrow">→</span>
            </RouterLink>
          </nav>
          <div class="mobile-drawer-foot">
            <button class="btn btn-outline btn-block" type="button" @click="switchLang">
              {{ lang === 'en' ? '中文' : 'EN' }}
            </button>
            <template v-if="auth.isLoggedIn()">
              <RouterLink class="btn btn-outline btn-block" :to="`/user/${username}`">{{ username }}</RouterLink>
              <button class="btn btn-dark btn-block" type="button" @click="auth.logout()">{{ t('app.nav.logout', '退出') }}</button>
            </template>
            <template v-else>
              <RouterLink class="btn btn-outline btn-block" to="/login">{{ t('app.nav.login', '登录') }}</RouterLink>
              <RouterLink class="btn btn-primary btn-block" to="/register">{{ t('app.nav.register', '注册') }}</RouterLink>
            </template>
          </div>
        </div>
      </div>
    </Transition>
    </template>

    <ForumHeader v-if="route.meta.forum" />

    <div v-if="isMock" class="container">
      <div class="notice notice-warn" style="margin-top: 14px">
        <span v-if="lang === 'en'">{{ t('app.mockNotice', '') }}</span>
        <span v-else><strong>Mock 模式</strong>：当前使用内置占位数据，未连接后端。设置 <code>VITE_USE_MOCK=false</code> 后切换到真实 API。</span>
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
        <div class="mono">{{ titleBase }} · {{ t('app.footerTail', 'AI 网页 Demo 作品集') }}</div>
        <div class="mono">{{ t('app.footerDisclaimer', '时间线仅表示创建/更新记录，不等同于 AI 生成真实性证明') }}</div>
      </footer>
    </template>

    <ConfirmHost />
    <ToastHost />
  </div>
</template>
