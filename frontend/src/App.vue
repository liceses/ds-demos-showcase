<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { api } from './api'
import { isMock } from './api'
import { lang, setLang, t } from './i18n'
import { adminExempt, applyServerFunMode, funEffective, titleBase } from './utils/funMode'
import { applyThemePreviewFromUrl, getEffectiveTheme, initTheme, setTheme } from './utils/theme'
import { useQueues } from './composables/adminQueues'
import ConfirmHost from './components/ConfirmHost.vue'
import ToastHost from './components/ToastHost.vue'
import ForumHeader from './components/ForumHeader.vue'
import NotificationBell from './components/NotificationBell.vue'

const auth = useAuthStore()
const route = useRoute()
const username = computed(() => auth.user?.username ?? '')
const mobileOpen = ref(false)
const keepAlivePages = ['HomeView', 'DemosView', 'TagListView', 'LeaderboardView', 'ForumListView', 'ModelsView', 'TasksView', 'ExploreView']
// 保留页按 name 做 key（同页返回复用实例）；其他页按 fullPath（参数变化强制重挂载）
// key 只用 path，不用 fullPath：
// fullPath 当 key 会让「同一路径只改 query」（排序/筛选/分页/切面板）**整页重挂** ——
// 表现为滚动弹回顶部、已填内容丢失、请求重发。各视图改为自己 watch 关心的 query。
// 例外：meta.remountOnQuery 的页面（如 /upload?slug=xxx —— 它的身份就是那个 query）保留重挂。
const pageKey = computed(() => {
  if (route.meta.keepAlive) return route.name as string
  return route.meta.remountOnQuery ? route.fullPath : (route.path as string)
})
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
  { to: '/tags', key: 'explore', label: '探索' },
  { to: '/leaderboard', key: 'leaderboard', label: '排行榜' },
  { to: '/forum', key: 'forum', label: '论坛' },
  { to: '/about', key: 'about', label: '关于本站' },
]

// 用户菜单（03 §2.4）：admin 从顶栏移入下拉，「管理工作台」徽章 = 待办合计，
// 数字走 adminQueues 单一口径（useQueues().totalMust，与后台侧栏/概览台同源，不自算）
const { totalMust: adminQueueTotal, refresh: refreshQueues } = useQueues()
const userMenuOpen = ref(false)
const userMenuRoot = ref<HTMLElement | null>(null)
function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value
}
function onDocClick(e: MouseEvent) {
  if (userMenuOpen.value && userMenuRoot.value && !userMenuRoot.value.contains(e.target as Node)) {
    userMenuOpen.value = false
  }
}
watch(
  () => route.fullPath,
  () => {
    userMenuOpen.value = false
  },
)
onMounted(() => {
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})
// 管理员：进站即拉一次队列计数（badge 合计的数据源；去重逻辑在 composable 内；
// 用 watch 而非 onMounted——首屏时 fetchMe 可能尚未返回，身份就绪后再拉）
watch(
  () => auth.user,
  (u) => {
    if (u?.role === 'admin') void refreshQueues().catch(() => undefined)
  },
  { immediate: true },
)

// 语言切换：ref 响应式驱动全站（含 keepAlive 页）；<html lang> 同步
const switchLang = () => setLang(lang.value === 'en' ? 'zh' : 'en')
watchEffect(() => {
  document.documentElement.lang = lang.value === 'en' ? 'en' : 'zh-CN'
})

// 主题（04 §3.5/03 §11.3 仲裁版）：接管 FOUC + ?theme= 预览；按钮 paper↔ink 循环（语言按钮同规格）
const themeNow = ref<ReturnType<typeof getEffectiveTheme>>(getEffectiveTheme())
const themeTitle = computed(() =>
  themeNow.value === 'ink'
    ? t('app.theme.toPaper', '当前墨黑，点击换纸白')
    : t('app.theme.toInk', '当前纸白，点击换墨黑'),
)
function cycleTheme() {
  setTheme(themeNow.value, { cycle: true })
  themeNow.value = getEffectiveTheme()
}

// P2-1 转场例外名（03 §12.6）：forum 双皮壳（自带 forum-takeover 登场）/ upload remountOnQuery
// （query 即身份，向导步进不重播转场）→ page-cut 空名 = 零类定义硬切。
const pageTransitionName = computed(() => (route.meta.forum || route.meta.remountOnQuery ? 'page-cut' : 'page'))
onMounted(() => {
  initTheme()
  applyThemePreviewFromUrl()
  themeNow.value = getEffectiveTheme()
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
        <RouterLink class="nav-link" to="/tags">{{ t('app.nav.explore', '探索') }}</RouterLink>
        <RouterLink class="nav-link" to="/leaderboard">{{ t('app.nav.leaderboard', '排行榜') }}</RouterLink>
        <RouterLink class="nav-link" to="/forum">{{ t('app.nav.forum', '论坛') }}</RouterLink>
        <RouterLink class="nav-link" to="/about">{{ t('app.nav.about', '关于本站') }}</RouterLink>
      </nav>

      <div class="topnav topnav-desktop">
        <button class="btn btn-sm btn-outline" type="button" :title="themeTitle" @click="cycleTheme">
          {{ themeNow === 'ink' ? '纸' : '墨' }}
        </button>
        <button class="btn btn-sm btn-outline" type="button" :title="lang === 'en' ? '切换到中文' : 'Switch to English'" @click="switchLang">
          {{ lang === 'en' ? '中文' : 'EN' }}
        </button>
        <!-- GitHub 仓库（05 §5.1 件 2）：工具件收进 header 右缘，token 单色不引品牌色，外链新窗 -->
        <a
          class="gh-link"
          href="https://github.com/liceses/ds-demos-showcase"
          target="_blank"
          rel="noopener"
          :title="t('app.github', 'GitHub 仓库')"
          :aria-label="t('app.github', 'GitHub 仓库')"
        >
          <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>
        <template v-if="auth.isLoggedIn()">
          <NotificationBell />
          <!-- 用户菜单（03 §2.4）：admin 从顶栏移入下拉；徽章合计走 adminQueues 单一口径 -->
          <div ref="userMenuRoot" class="user-menu">
            <button class="user-menu-trigger" type="button" :aria-expanded="userMenuOpen" @click="toggleUserMenu">
              {{ username }}
              <span v-if="auth.isAdmin() && adminQueueTotal > 0" class="user-menu-dot" aria-hidden="true"></span>
              <span class="user-menu-caret" aria-hidden="true">▾</span>
            </button>
            <Transition name="user-menu-pop">
              <div v-if="userMenuOpen" class="user-menu-panel">
                <RouterLink class="user-menu-item" :to="`/user/${username}`">{{ t('app.menu.profile', '个人主页') }}</RouterLink>
                <RouterLink v-if="auth.isAdmin()" class="user-menu-item" to="/admin">
                  {{ t('app.nav.workbench', '管理工作台') }}
                  <span v-if="adminQueueTotal > 0" class="user-menu-badge">{{ adminQueueTotal }}</span>
                </RouterLink>
                <button class="user-menu-item user-menu-quit" type="button" @click="auth.logout()">{{ t('app.nav.logout', '退出') }}</button>
              </div>
            </Transition>
          </div>
        </template>
        <template v-else>
          <RouterLink class="nav-link" to="/login">{{ t('app.nav.login', '登录') }}</RouterLink>
          <RouterLink class="nav-link" to="/register">{{ t('app.nav.register', '注册') }}</RouterLink>
        </template>
        <!-- 上传 Demo 升为主 CTA（03 §2.4：单一主动作，不与信息项竞争；URL /upload 不变） -->
        <RouterLink class="btn btn-sm btn-primary topnav-cta" to="/upload">{{ t('app.nav.upload', '上传 Demo') }}</RouterLink>
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
          </nav>
          <div class="mobile-drawer-foot">
            <!-- 上传 CTA：抽屉内也保持主按钮地位（03 §2.4 同步移动端） -->
            <RouterLink class="btn btn-primary btn-block" to="/upload">{{ t('app.nav.upload', '上传 Demo') }} →</RouterLink>
            <RouterLink v-if="auth.isAdmin()" class="btn btn-outline btn-block" to="/admin">
              {{ t('app.nav.workbench', '管理工作台') }}
              <span v-if="adminQueueTotal > 0" class="user-menu-badge">{{ adminQueueTotal }}</span>
            </RouterLink>
            <button class="btn btn-outline btn-block" type="button" :title="themeTitle" @click="cycleTheme">
              {{ themeNow === 'ink' ? t('app.theme.toPaper', '换纸白') : t('app.theme.toInk', '换墨黑') }}
            </button>
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
        <!-- P2-1 页面转场（04 §2.3.1 可抄范式）：Transition 必须包在 KeepAlive 外层，
             mode="out-in" = 旧页 0ms 硬切消失（.page-leave-active transition:none）+ 新页 stamp-lite 250ms 登场；
             KeepAlive 命中复用不重播 enter、重新插入时播（符合「转场=页面级登场」语义）；
             scrollBehavior 协同：savedPosition/top:0 在新页插入时生效（leave 0ms 无延迟），入场动画叠加不抢滚动。 -->
        <Transition :name="pageTransitionName" mode="out-in">
            <KeepAlive :include="keepAlivePages">
              <component :is="Component" :key="pageKey" />
            </KeepAlive>
        </Transition>
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

<style scoped>
/* 用户菜单（M1-1，03 §2.4）：样式组件级（style.css 冻结令生效中，令牌经 var() 引用全局既有值并带回落） */
.user-menu {
  position: relative;
}
.user-menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 4px 2px;
  cursor: pointer;
  font: inherit;
  font-weight: 900;
  color: var(--ink, #000);
}
.user-menu-caret {
  font-size: 10px;
}
/* 管理员有待办时的红点提示（点击展开看合计） */
.user-menu-dot {
  width: 8px;
  height: 8px;
  background: var(--red, #ff6b6b);
  border: 2px solid var(--ink, #000);
}
.user-menu-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 60;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  background: var(--paper, #fff);
  border: var(--border-w, 4px) solid var(--ink, #000);
  box-shadow: 6px 6px 0 0 rgba(0, 0, 0, 1);
}
.user-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  color: var(--ink, #000);
  text-decoration: none;
  font-weight: 700;
  font-size: 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.user-menu-item:hover {
  background: var(--paper-deep, #f2eee6);
}
.user-menu-quit {
  border-top: 2px solid var(--ink, #000);
}
.user-menu-badge {
  min-width: 22px;
  padding: 1px 6px;
  text-align: center;
  background: var(--red, #ff6b6b);
  color: var(--on-accent, #000);
  border: 2px solid var(--ink, #000);
  font-size: 12px;
  font-weight: 900;
}
.topnav-cta {
  margin-left: 2px;
}
/* 弹层登场（编排类豁免口径，R7 白名单内） */
.user-menu-pop-enter-active {
  transition: opacity 150ms ease, transform 150ms ease;
}
.user-menu-pop-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.user-menu-pop-leave-active {
  transition: none;
}
.user-menu-pop-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .user-menu-pop-enter-active {
    transition: none;
  }
}

/* ---- M1-H1 header 静默化（05 §2.1/§5）：覆盖全局 nav-link 的荧光黄框 → 静默文字链 ----
   muted→ink 色阶；当前页 = ink + 3px 实线下划；边框只留给功能件（CTA/主题/铃铛）。 */
.topbar .nav-link {
  border-color: transparent;
  background: none;
  color: var(--ink-soft, #555);
}
.topbar .nav-link:hover {
  color: var(--ink, #000);
  border-color: transparent;
  background: none;
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 6px;
}
/* exact-active：避免「/」链接在全站都被 inclusive 匹配点亮（首页只在本页亮） */
.topbar .nav-link.router-link-exact-active {
  color: var(--ink, #000);
  border-color: transparent;
  background: none;
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 6px;
}
/* GitHub 图标链（05 §5.1 件 2）：token 单色，hover = ink 实底反色（btn-dark 词汇） */
.gh-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 30px;
  color: var(--ink, #000);
  border: 2px solid transparent;
  transition: transform var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1));
}
.gh-link:hover {
  background: var(--ink, #000);
  color: var(--paper, #fff);
}
.gh-link:active {
  transform: translate(1px, 1px);
}
@media (prefers-reduced-motion: reduce) {
  .gh-link {
    transition: none;
  }
}
</style>
