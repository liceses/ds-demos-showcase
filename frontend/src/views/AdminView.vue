<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import AdminForumSection from '../components/admin/AdminForumSection.vue'
import AdminAnnouncementsSection from '../components/admin/AdminAnnouncementsSection.vue'
import AdminUsersSection from '../components/admin/AdminUsersSection.vue'
import AdminSettingsSection from '../components/admin/AdminSettingsSection.vue'
import AdminReviewSection from '../components/admin/AdminReviewSection.vue'
import AdminDemosSection from '../components/admin/AdminDemosSection.vue'
import AdminTagsSection from '../components/admin/AdminTagsSection.vue'
import type { AdminStats } from '../api/types'

const tab = ref<'review' | 'demos' | 'tags' | 'forum' | 'users' | 'settings' | 'announcements'>('review')
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

onMounted(loadAll)
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">管理后台</span>
    <h1 class="huge">管理</h1>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'review' }" type="button" @click="tab = 'review'">
        审核队列
        <span v-if="dashStats.pending" class="badge">{{ dashStats.pending }}</span>
      </button>
      <button class="tab" :class="{ active: tab === 'demos' }" type="button" @click="tab = 'demos'">Demo 管理</button>
      <button class="tab" :class="{ active: tab === 'tags' }" type="button" @click="tab = 'tags'">标签管理</button>
      <button class="tab" :class="{ active: tab === 'forum' }" type="button" @click="tab = 'forum'">论坛管理</button>
      <button class="tab" :class="{ active: tab === 'users' }" type="button" @click="tab = 'users'">用户管理</button>
      <button class="tab" :class="{ active: tab === 'announcements' }" type="button" @click="tab = 'announcements'">公告管理</button>
      <button class="tab" :class="{ active: tab === 'settings' }" type="button" @click="tab = 'settings'">站点设置</button>
      <RouterLink class="tab" style="text-decoration: none" to="/admin/sponsors">赞助/致谢</RouterLink>
    </div>

    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载后台…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <template v-else>
      <!-- 概览统计 -->
      <div class="dash-stats">
        <div class="stat-card"><b>{{ dashStats.total }}</b>总作品</div>
        <div class="stat-card stat-ok"><b>{{ dashStats.approved }}</b>已上线</div>
        <div class="stat-card stat-warn"><b>{{ dashStats.pending }}</b>待审</div>
        <div class="stat-card stat-err"><b>{{ dashStats.rejected }}</b>已拒</div>
        <div class="stat-card"><b>{{ dashStats.users }}</b>用户</div>
        <div class="stat-card"><b>{{ storageModeLabel }}</b>存储</div>
      </div>

      <Transition name="tab-pane" mode="out-in">
        <div :key="tab" class="tab-pane">
          <template v-if="tab === 'review'">
            <AdminReviewSection />
          </template>

          <template v-else-if="tab === 'demos'">
            <AdminDemosSection />
          </template>

          <template v-else-if="tab === 'tags'">
            <AdminTagsSection />
          </template>

          <template v-else-if="tab === 'forum'">
            <AdminForumSection />
          </template>

          <template v-else-if="tab === 'users'">
            <AdminUsersSection />
          </template>

          <template v-else-if="tab === 'announcements'">
            <AdminAnnouncementsSection />
          </template>

          <template v-else-if="tab === 'settings'">
            <AdminSettingsSection />
          </template>

        </div>
      </Transition>
    </template>
  </section>
</template>
