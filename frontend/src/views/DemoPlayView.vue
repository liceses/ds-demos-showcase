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
        <!-- 说明文字只在宽屏显示（≤720 由 CSS 隐藏）：手机上顶条必须保持单行 44px。
             用 CSS 而不是 hover 媒体特性判定 —— 后者在模拟环境/外接键鼠的平板上并不可靠。 -->
        <span class="play-hint mono">{{ t('demo.playKeysHint', '键盘全部交给作品（含 Esc）') }}</span>
      </div>
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

    </template>
  </div>
</template>

<style scoped>
/* 布局（P-chrome 重设计）：顶条占文档流、iframe 拿满剩余视口 —— **零遮挡**。
   原先顶条是 position:fixed 压在画面上（实测 .play-bar 12,12→378,79 与 iframe 0,0→390,844 相交），
   还把 .preview-focus-hint（同在 12,12）压在下面（z: --z-local(10) > --z-overlay(2)）——
   用户报的"3 个按钮浮在 demo 画面上、还遮住提示条"就是这两条。 */
.play-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh; /* 移动端地址栏动态高度 */
  min-height: 0;
}
.play-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--sp-8);
  min-height: 44px;
  padding: 5px var(--sp-12);
  border-bottom: var(--border-w, 4px) solid var(--ink, #000);
  background: var(--paper, #fff);
}
.play-shell {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
.play-shell :deep(.preview-shell) {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.play-shell :deep(.preview-frame) {
  height: 100%;
  min-height: 0;
  border: none; /* 满视口时不描边：画面上不留属于站点的颜色 */
}
.play-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-6);
  min-height: 32px;
  padding: var(--sp-4) var(--sp-10);
  font: inherit;
  font-size: var(--fs-12);
  font-weight: 800;
  background: var(--paper, #fff);
  color: var(--ink, #000);
  border: 3px solid var(--ink, #000);
  box-shadow: 3px 3px 0 0 var(--ink, #000);
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}
.play-btn:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
.play-hint {
  display: none; /* 窄屏默认不显示，见下方 min-width 断点 */
  margin-left: auto;
  font-size: var(--fs-11);
  color: var(--ink-faint, #767676);
}
@media (min-width: 721px) {
  .play-hint {
    display: inline;
  }
}
/* 窄屏：顶条保持单行（3 个按钮 ≈ 300px），说明文字已由 v-if 收起 */
@media (max-width: 480px) {
  .play-bar {
    gap: var(--sp-6);
    padding: 5px var(--sp-8);
  }
  .play-btn {
    padding: var(--sp-4) var(--sp-8);
  }
}
</style>
