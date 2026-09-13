<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { HistoryItemOut } from '../api/types'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import PageHero from '../components/PageHero.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import LoadMore from '../components/LoadMore.vue'
import { t } from '../i18n'
import { groupByDay, relativeTime } from '../utils/relTime'
import { errorMessage } from '../utils/error'
import { useLocalHistory, mergeHistory } from '../composables/useLocalHistory'
import type { HistoryRow } from '../composables/useLocalHistory'

/**
 * /me/history —— 浏览历史（**本页是隐私门面**）。
 *
 * 混合存储（用户裁决）：未登录只写本机 localStorage；登录后服务端也记一份。
 * 展示时按 slug 合并去重（同作品取更近的一次）→ 不会出现两条重复。
 * 页头把"记了什么"写清楚：只记你打开过哪件作品、什么时候，**不记 IP、不记来源**。
 *
 * 匿名也能访问本页（没有 requiresAuth）—— 否则"只看本机记录"这个能力就不存在了。
 */
defineOptions({ name: 'MeHistoryView' })
const auth = useAuthStore()
const ui = useUiStore()
const local = useLocalHistory()

const serverItems = ref<HistoryItemOut[]>([])
const serverTotal = ref(0)
const serverPage = ref(1)
const pageSize = 50
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
const confirmingSlug = ref<string | null>(null)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

const loggedIn = computed(() => auth.isLoggedIn())
const rows = computed<HistoryRow[]>(() => mergeHistory(serverItems.value, local.items.value))
const groups = computed(() => groupByDay(rows.value.map((r) => ({ ...r }))))
const hasMore = computed(() => serverItems.value.length < serverTotal.value)

async function load() {
  loading.value = true
  error.value = ''
  local.reload() // 别的标签页/别的页面刚记过的话，这里要看到
  try {
    if (loggedIn.value) {
      const res = await api.listHistory({ page: 1, pageSize })
      serverItems.value = res.items
      serverTotal.value = res.total
      serverPage.value = 1
    } else {
      serverItems.value = []
      serverTotal.value = 0
    }
  } catch (e) {
    // 服务端历史拿不到不该让整页失败：本机记录仍然可用（这也是混合存储的好处）
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const res = await api.listHistory({ page: serverPage.value + 1, pageSize })
    serverItems.value = [...serverItems.value, ...res.items]
    serverTotal.value = res.total
    serverPage.value += 1
  } catch (e) {
    ui.toast(errorMessage(e), 'error')
  } finally {
    loadingMore.value = false
  }
}

async function removeRow(slug: string) {
  if (confirmingSlug.value !== slug) {
    confirmingSlug.value = slug
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirmingSlug.value = null), 3000)
    return
  }
  confirmingSlug.value = null
  local.remove(slug)
  serverItems.value = serverItems.value.filter((x) => x.demo.slug !== slug)
  if (loggedIn.value) {
    try {
      await api.deleteHistoryItem(slug)
    } catch {
      /* 服务端删失败：本机已删，下次刷新会看到它回来 —— 不打断用户 */
    }
  }
}

async function clearAll() {
  const ok = await ui.confirm({
    title: t('hist.clear', '清空全部记录'),
    message: t('hist.clearConfirm', '本机与账号记录都会被清掉，且不可恢复。'),
    confirmText: t('hist.clear', '清空全部记录'),
    danger: true,
  })
  if (!ok) return
  local.clear()
  serverItems.value = []
  serverTotal.value = 0
  if (loggedIn.value) {
    try {
      await api.clearHistory()
    } catch (e) {
      ui.toast(errorMessage(e), 'error')
    }
  }
  ui.toast(t('hist.cleared', '浏览历史已清空'), 'success')
}

const historyOff = computed(() => loggedIn.value && auth.user?.history_enabled === false)
</script>

<template>
  <div class="route-page">
    <PageHero>
      <span class="eyebrow">{{ t('hist.title', '浏览历史') }}</span>
      <h1 class="page-title">{{ t('hist.title', '浏览历史') }}</h1>
      <p class="hint" style="margin-top: var(--sp-10)">
        {{ t('hist.note', '未登录时只记在这台设备；登录后同步到账号（可在设置里关闭）。') }}
      </p>
    </PageHero>

    <section class="section" style="padding-top: var(--sp-8)">
      <!-- 隐私说明（本页的门面）：写清"记了什么"与"怎么清" -->
      <div class="card card-mint hist-notice">
        <p class="hist-notice-text">
          {{ t('hist.privacy', '只记录你打开过哪件作品、什么时候——不记 IP、不记来源。') }}
        </p>
        <button v-if="rows.length" class="btn btn-sm btn-danger" type="button" @click="clearAll">
          {{ t('hist.clear', '清空全部记录') }}
        </button>
      </div>

      <p v-if="historyOff" class="notice notice-error" style="margin-top: var(--sp-12)">
        {{ t('hist.off', '历史记录已关闭') }} · {{ t('hist.offHint', '在设置里重新开启后才会记录新的记录') }}
      </p>
      <p v-else-if="!loggedIn" class="hint" style="margin-top: var(--sp-12)">
        <RouterLink :to="`/login?next=${encodeURIComponent('/me/history')}`">{{ t('hist.loginHint', '登录后历史可跨设备同步 →') }}</RouterLink>
      </p>

      <LoadingRow v-if="loading" :text="t('hist.loading', '加载浏览历史…')" />
      <EmptyBox v-else-if="!rows.length" :text="t('hist.empty', '还没有浏览记录')">
        <template #action>
          <RouterLink class="btn btn-sm btn-primary" to="/demos">{{ t('fav.goBrowse', '去逛逛作品库 →') }}</RouterLink>
        </template>
      </EmptyBox>

      <template v-else>
        <div v-for="g in groups" :key="g.label" class="hist-group">
          <h2 class="eyebrow hist-day">{{ g.label }}</h2>
          <ul class="me-list">
            <li v-for="r in g.rows" :key="r.slug" class="me-row me-row--item">
              <RouterLink class="me-thumb" :to="`/demo/${r.slug}`">
                <img v-if="r.cover_url" :src="r.cover_url" alt="" loading="lazy" decoding="async" />
                <span v-else aria-hidden="true">{{ r.title[0] }}</span>
              </RouterLink>
              <div class="me-row-main">
                <RouterLink class="me-row-title" :to="`/demo/${r.slug}`">{{ r.title }}</RouterLink>
                <p class="me-row-meta">
                  <!-- 模型名用 tag-chip（本地历史只存了标签字符串；不伪造 ModelBrief 对象） -->
                  <span v-for="m in r.model_labels.slice(0, 3)" :key="m" class="tag-chip">{{ m }}</span>
                  <span class="muted mono">{{ relativeTime(r.viewed_at) }}</span>
                </p>
              </div>
              <div class="me-row-actions">
                <button
                  class="btn btn-sm"
                  :class="confirmingSlug === r.slug ? 'btn-danger' : 'btn-outline'"
                  type="button"
                  :aria-label="t('hist.removeOne', '从历史中移除 {t}', { t: r.title })"
                  @click="removeRow(r.slug)"
                >
                  {{ confirmingSlug === r.slug ? t('hist.confirmRemove', '确认移除？') : '×' }}
                </button>
              </div>
            </li>
          </ul>
        </div>

        <LoadMore
          v-if="loggedIn && rows.length"
          :shown="serverItems.length"
          :total="serverTotal"
          :has-more="hasMore"
          :loading="loadingMore"
          :show-end="false"
          @more="loadMore"
        />
      </template>
    </section>
  </div>
</template>
