<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import type { DemoDetail } from '../api/types'
import IframePreview from '../components/IframePreview.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { t } from '../i18n'
import { titleBase } from '../utils/funMode'

/**
 * 独立预览页 `/demo/:slug/play`（方案 D1）。
 *
 * 它要解决的是**键盘归属**：详情页里站点还要服务"浏览"（筛选/搜索/动作条），
 * 而这一页的目标只有一个 —— 玩。所以：
 *   · **一个键都不绑**（含 Esc）：把 Esc/F/G 全部让给作品本身（`IframePreview :hotkeys="false"`）
 *   · 无站点外壳（App.vue 的 `meta.bare` 隐藏顶栏/页脚/底栏），iframe 满视口
 *   · 全屏不再需要按钮：这一页本身就是"最全"的状态（覆盖层只是详情页的需求）
 *   · 唯一保留的站点 UI 是左上角浮条（返回/重载/在原始文件打开）——点击操作，不占键位
 *
 * 为什么不做成"裸子域新标签"：那会换域名（demo.deepdemos.top）、丢掉返回路径，
 * 且本地/线上行为不同。站内路由可分享、可刷新、移动端同样可用。
 */
const props = defineProps<{ slug: string }>()
const router = useRouter()

const demo = ref<DemoDetail | null>(null)
const loading = ref(true)
const error = ref('')
/** 重载：换 key 强制重建 iframe（与详情页的「重开」同一手法） */
const previewKey = ref(0)

function back() {
  // 从详情页点进来 → 返回上一页（保留滚动位置等历史状态）；
  // 分享链接直达 → 历史里没有可回退的站内页，就回该作品的详情页（不留死路）
  const state = window.history.state as { back?: string | null } | null
  if (state && state.back) router.back()
  else void router.push(`/demo/${props.slug}`)
}

onMounted(async () => {
  try {
    const d = await api.getDemo(props.slug)
    // 只有 web 类型有可预览的页面；link 类型跳回详情页（那里有"打开链接"的正式入口）
    if (d.demo_type !== 'web') {
      void router.replace(`/demo/${props.slug}`)
      return
    }
    demo.value = d
    document.title = `${d.title} · ${titleBase.value}`
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  document.title = titleBase.value
})
</script>

<template>
  <div class="play-page">
    <LoadingRow v-if="loading" :text="t('demo.loading', '加载 Demo…')" />
    <EmptyBox v-else-if="error" kind="error" :text="error" />
    <template v-else-if="demo">
      <div class="play-shell">
        <IframePreview
          ref="previewRef"
          :key="previewKey"
          :srcdoc="demo.previewHtml"
          :src="demo.previewHtml ? undefined : (demo.preview_url ?? `/preview/${demo.slug}/index.html`)"
          :title="demo.title"
          :hotkeys="false"
        />
      </div>

      <!-- 浮条：**点击**操作，不占任何键位。这样 Esc/F/G 全部属于作品。 -->
      <div class="play-bar">
        <button class="play-btn" type="button" @click="back">
          <span aria-hidden="true">←</span> {{ t('demo.playBack', '返回作品页') }}
        </button>
        <button class="play-btn" type="button" @click="previewKey += 1">
          {{ t('demo.barRestart', '重开') }}
        </button>
        <a
          class="play-btn play-btn-link"
          :href="demo.preview_url ?? `/preview/${demo.slug}/index.html`"
          target="_blank"
          rel="noopener"
        >
          {{ t('demo.playRaw', '原始文件') }} <span aria-hidden="true">↗</span>
        </a>
        <span class="play-hint mono">{{ t('demo.playKeysHint', '键盘全部交给作品（含 Esc）') }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 满视口：用 dvh 照顾移动端地址栏动态高度，vh 作回退 */
.play-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 0;
}
.play-shell {
  flex: 1;
  min-height: 0;
  display: flex;
}
.play-shell :deep(.preview-shell) {
  flex: 1;
  min-width: 0;
}
.play-shell :deep(.preview-frame) {
  height: 100%;
  min-height: 0;
  border: none; /* 满视口时不描边，避免"页面里嵌了一块"的观感 */
}
/* 浮条：常驻可见（不悬停显形 —— 预览被 iframe 覆盖，父级 :hover 收不到事件） */
.play-bar {
  position: fixed;
  left: 12px;
  top: 12px;
  z-index: var(--z-local);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: calc(100vw - 24px);
}
.play-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 5px 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  background: var(--paper, #fff);
  color: var(--ink, #000);
  border: var(--border-w, 4px) solid var(--ink, #000);
  box-shadow: 4px 4px 0 0 var(--ink, #000);
  cursor: pointer;
  text-decoration: none;
}
.play-btn:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
.play-hint {
  font-size: 11px;
  color: var(--paper, #fff);
  background: var(--ink, #000);
  padding: 4px 8px;
}
</style>
