<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import AdminConsoleSection from '../components/admin/AdminConsoleSection.vue'
// 体检指标已并入概览台（AdminConsoleSection 静态引用 AdminStatsSection）——stats 直达 tab 复用同一模块，走静态避免 dynamic/static 双导入警告
import AdminStatsSection from '../components/admin/AdminStatsSection.vue'
import { useQueues, type QueueKey } from '../composables/adminQueues'
import { t } from '../i18n'
import type { AdminStats } from '../api/types'

const route = useRoute()
const router = useRouter()
const ALL_TABS: TabKey[] = ['console', 'entities', 'review', 'inbox', 'clusters', 'refine', 'inspection', 'attribution', 'merge', 'aliases', 'demos', 'featured', 'announcements', 'tags', 'tagreq', 'forum', 'users', 'stats', 'audit', 'settings', 'sponsors']
const initialTab = (ALL_TABS as string[]).includes(String(route.query.tab)) ? (String(route.query.tab) as TabKey) : 'console'
const tab = ref<TabKey>(initialTab)
// 同路径换 ?tab= 不再触发重挂（pageKey 已改为 path），所以必须自己监听
watch(() => route.query.tab, (v) => {
  const k = String(v ?? 'console')
  if ((ALL_TABS as string[]).includes(k) && k !== tab.value) tab.value = k as TabKey
})
const { queues, refresh: refreshQueues } = useQueues()

// 后台信息架构（重设计第 1 期）：按「对象 × 动作」分组，不再按加面板的时间顺序分组。
// 队列徽章计数统一取自 adminQueues 的单一描述符 —— 侧栏、概览台共用一份，杜绝口径漂移。
type TabKey =
  | 'console' | 'entities' | 'review' | 'inbox' | 'clusters' | 'refine' | 'inspection' | 'attribution'
  | 'merge' | 'aliases' | 'demos' | 'featured' | 'announcements' | 'tags' | 'tagreq'
  | 'forum' | 'users' | 'stats' | 'audit' | 'settings' | 'sponsors'

// 面板懒加载（04 §5.2）：除概览台外全部惰性组件表——后台按 tab 按需拉取，
// 概览台是默认落地页，随壳加载避免二次瀑布；相邻 tab 的 prefetch（requestIdleCallback）留给 P3。
const sections: Record<TabKey, Component> = {
  // M3-2 实体总表（06 §A3.1 知识中心新面板）：Model/Task/Tag 三类统一列表+实体详情（详情查询串 ?type=&id= 由面板内自取）
  entities: defineAsyncComponent(() => import('../components/admin/AdminEntitiesSection.vue')),
  console: AdminConsoleSection,
  review: defineAsyncComponent(() => import('../components/admin/AdminReviewSection.vue')),
  inbox: defineAsyncComponent(() => import('../components/admin/AdminInboxSection.vue')),
  clusters: defineAsyncComponent(() => import('../components/admin/AdminClustersSection.vue')),
  refine: defineAsyncComponent(() => import('../components/admin/AdminRefineSection.vue')),
  inspection: defineAsyncComponent(() => import('../components/admin/AdminInspectionSection.vue')),
  attribution: defineAsyncComponent(() => import('../components/admin/AdminAttributionSection.vue')),
  merge: defineAsyncComponent(() => import('../components/admin/AdminMergeSection.vue')),
  aliases: defineAsyncComponent(() => import('../components/admin/AdminAliasesSection.vue')),
  demos: defineAsyncComponent(() => import('../components/admin/AdminDemosSection.vue')),
  featured: defineAsyncComponent(() => import('../components/admin/AdminFeaturedSection.vue')),
  announcements: defineAsyncComponent(() => import('../components/admin/AdminAnnouncementsSection.vue')),
  tags: defineAsyncComponent(() => import('../components/admin/AdminTagsSection.vue')),
  tagreq: defineAsyncComponent(() => import('../components/admin/AdminTagsSection.vue')),
  forum: defineAsyncComponent(() => import('../components/admin/AdminForumSection.vue')),
  users: defineAsyncComponent(() => import('../components/admin/AdminUsersSection.vue')),
  stats: AdminStatsSection,
  audit: defineAsyncComponent(() => import('../components/admin/AdminAuditSection.vue')),
  settings: defineAsyncComponent(() => import('../components/admin/AdminSettingsSection.vue')),
  sponsors: defineAsyncComponent(() => import('./RecognitionAdminView.vue')),
}

interface AdminTab {
  key: TabKey | 'sponsors'
  label: string
  to?: string
  /** 关联队列：侧栏徽章数字来源 */
  q?: QueueKey
}

// M3-1 侧栏重排（06 §A3.1/A4 映射表）：7 组→4 组（总览/知识中心/运营/站点），18 面板零改动搬家——
//   知识中心=实体生命周期域（候选收编 inbox/clusters/merge/aliases/tags/tagreq）；
//   运营=队列+内容+社区治理（review/refine/inspection/attribution/demos/forum/users）；
//   站点=audit/settings/sponsors/announcements（公告自「内容」迁入）；
//   归属工作台按 A4#7 队列面留运营（跃迁操作面 P4 进 Model 详情）；
//   实体总表（M3-2 新面板）落知识中心组首位，面板总数 18→19。
const TAB_GROUPS: { label: string; tabs: AdminTab[] }[] = [
  { label: '总览', tabs: [{ key: 'console', label: '概览台' }] },
  {
    label: '知识中心',
    tabs: [
      { key: 'entities', label: '实体总表' },
      { key: 'inbox', label: '知识候选', q: 'inbox' },
      { key: 'clusters', label: '题目候选', q: 'clusters' },
      { key: 'merge', label: '合并向导' },
      { key: 'aliases', label: '别名中心' },
      { key: 'tags', label: '标签词表', q: 'wordlist' },
      { key: 'tagreq', label: '固定值申请' },
    ],
  },
  {
    label: '运营',
    tabs: [
      { key: 'review', label: '审核队列', q: 'review' },
      { key: 'refine', label: '类型细分', q: 'refine' },
      { key: 'inspection', label: '巡检' },
      { key: 'attribution', label: '归属工作台', q: 'attribution' },
      { key: 'demos', label: 'Demo 管理' },
      { key: 'featured', label: '精选管理' },
      { key: 'forum', label: '论坛管理' },
      { key: 'users', label: '用户管理' },
    ],
  },
  {
    label: '站点',
    tabs: [
      // 「体检指标」已并入概览台（两处讲同一批数必然漂移）；?tab=stats 仍可直达，只是不再占一个入口
      { key: 'audit', label: '审计日志' },
      { key: 'settings', label: '站点设置' },
      { key: 'sponsors', label: '赞助/致谢' },
      { key: 'announcements', label: '公告管理' },
    ],
  },
]

// 侧栏可搜索 + 键盘可达（后台是高频重复劳动，只给鼠标等于让熟练用户每次从头找）
const navQuery = ref('')
const navRefs = ref<Record<string, HTMLElement | null>>({})
const visibleGroups = computed(() => {
  const q = navQuery.value.trim().toLowerCase()
  if (!q) return TAB_GROUPS
  return TAB_GROUPS
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => t.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) }))
    .filter((g) => g.tabs.length)
})
const flatTabs = computed(() => visibleGroups.value.flatMap((g) => g.tabs.filter((t) => !t.to) as { key: TabKey }[]))

function selectTab(k: TabKey, filter?: string) {
  tab.value = k
  // 面板写进 URL：可分享、刷新不丢位置、概览台"去处理"能被后退撤销
  // M2-t4 深链升级（03 §9.3）：?tab=x&filter=y 带条件直达（如 ?tab=inbox&filter=retag_demo），
  // 消灭「看见积压但要多点三下才开工」；侧栏普通切换不带 filter（query 整体替换自然清掉）
  void router.replace({ query: k === 'console' ? {} : filter ? { tab: k, filter } : { tab: k } })
}

function onNavKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
  const list = flatTabs.value.map((t) => t.key as string)
  if (!list.length) return
  const cur = list.indexOf(tab.value)
  if (e.key === 'Enter') return
  e.preventDefault()
  const nextIdx = Math.min(list.length - 1, Math.max(0, cur + (e.key === 'ArrowDown' ? 1 : -1)))
  const key = list[nextIdx]
  tab.value = key as TabKey
  navRefs.value[key]?.focus()
}

function badgeOf(t: AdminTab): number {
  return t.q ? queues.value[t.q].count : 0
}

const adminStats = ref<AdminStats | null>(null)
const loading = ref(false)
const error = ref('')

// 概览统计需要的最小数据（管理表格在子组件自行加载）
const storageInfo = ref<{ oss_enabled: boolean; mode: string; local_demos: number; local_files: number; local_size_bytes: number }>({
  oss_enabled: false,
  mode: 'local',
  local_demos: 0,
  local_files: 0,
  local_size_bytes: 0,
})
const storageModeLabel = computed(() => {
  if (storageInfo.value.mode === 'oss') return 'OSS 直连'
  if (storageInfo.value.mode === 'oss_backup') return '本地存储（OSS 备份）'
  return '本地存储'
})

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const stats = await api.getAdminStats()
    adminStats.value = stats
    storageInfo.value = stats.storage
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

// ---------- 概览统计 ----------
const dashStats = computed(() => ({
  total: adminStats.value?.demos.total ?? 0,
  approved: adminStats.value?.demos.approved ?? 0,
  pending: adminStats.value?.demos.pending ?? 0,
  rejected: adminStats.value?.demos.rejected ?? 0,
  users: adminStats.value?.users ?? 0,
}))

onMounted(() => {
  void loadAll()
  void refreshQueues()
})
</script>

<template>

  <div>  <section class="page-hero">
    <span class="eyebrow">管理后台</span>
    <h1 class="huge">管理</h1>
  </section>

  <section class="section" style="padding-top: 8px">
    <!-- 第 1 期壳层：左侧两级导航（带队列徽章 + 可搜索 + ↑↓ 键切换），窄屏退化为下拉 -->
    <div class="admin-shell">
      <aside class="ad-nav" @keydown="onNavKeydown">
        <input v-model="navQuery" class="input ad-nav-search" type="search" :placeholder="t('admin.navSearch', '搜面板…')" aria-label="搜索面板" />
        <select class="ad-nav-select" :value="tab" @change="selectTab(($event.target as HTMLSelectElement).value as TabKey)">
          <optgroup v-for="g in visibleGroups" :key="g.label" :label="g.label">
            <option v-for="x in g.tabs.filter((y) => !y.to)" :key="x.key" :value="x.key">{{ x.label }}</option>
          </optgroup>
        </select>
        <nav class="ad-nav-list">
          <div v-for="g in visibleGroups" :key="g.label" class="ad-nav-group">
            <span class="ad-nav-label">{{ g.label }}</span>
            <button
              v-for="x in g.tabs"
              :key="x.key"
              :ref="(el) => (navRefs[String(x.key)] = el as HTMLElement)"
              class="ad-nav-item"
              :class="{ active: tab === x.key }"
              :aria-current="tab === x.key ? 'page' : undefined"
              type="button"
              @click="x.to ? null : selectTab(x.key as TabKey)"
            >
              <RouterLink v-if="x.to" class="ad-nav-link" :to="x.to" @click.stop>{{ x.label }}</RouterLink>
              <template v-else>
                <span class="ad-nav-text">{{ x.label }}</span>
                <span v-if="badgeOf(x) > 0" class="ad-nav-badge">{{ badgeOf(x) }}</span>
              </template>
            </button>
          </div>
        </nav>
      </aside>

      <div class="ad-main">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载后台…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <template v-else>
      <!-- 概览统计：console 自己有更大的待办数，这里重复显示只会制造噪音 -->
      <div v-if="tab !== 'console'" class="dash-stats">
        <div class="stat-card"><b>{{ dashStats.total }}</b>总作品</div>
        <div class="stat-card stat-ok"><b>{{ dashStats.approved }}</b>已上线</div>
        <div class="stat-card stat-warn"><b>{{ dashStats.pending }}</b>待审</div>
        <div class="stat-card stat-err"><b>{{ dashStats.rejected }}</b>已拒</div>
        <div class="stat-card"><b>{{ dashStats.users }}</b>用户</div>
        <div class="stat-card"><b>{{ storageModeLabel }}</b>存储</div>
      </div>

      <Transition name="tab-pane" mode="out-in">
        <div :key="tab" class="tab-pane">
          <!-- 概览台随壳加载（默认落地页），@go 是它独有的事件 -->
          <AdminConsoleSection v-if="tab === 'console'" @go="(k: string, f?: string) => selectTab(k as TabKey, f)" />
          <!-- 词表双入口共用 AdminTagsSection（惰性），only 区分键表 / 申请 -->
          <component :is="sections.tags" v-else-if="tab === 'tags'" only="keys" />
          <component :is="sections.tagreq" v-else-if="tab === 'tagreq'" only="review" />
          <component :is="sections.sponsors" v-else-if="tab === 'sponsors'" embedded />
          <component v-else :is="sections[tab]" />
        </div>
      </Transition>
    </template>
      </div><!-- /ad-main -->
    </div><!-- /admin-shell -->
  </section>
  </div>
</template>