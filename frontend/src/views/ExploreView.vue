<script setup lang="ts">
// 探索页（v2 D3）：/tags 原地升级 —— 模型 / 题目 / 描述性标签三段。
// 顶栏因此从 7 项收敛到 5 项：模型与题目不再各占一个导航位，只从本页进入。
// 兜底位（未定型号/未标注/灰测）不参与热门排名，折叠成一行「其他 · 未定 N」。
defineOptions({ name: 'ExploreView' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { ExploreResult } from '../api/types'
import { modelDisplay } from '../utils/modelDisplay'
import { tagLabel } from '../utils/funMode'
import { iconInkFor, vendorIcon } from '../utils/vendorIcon'
import { t } from '../i18n'
import EntityStamp from '../components/EntityStamp.vue'
import TagTip from '../components/TagTip.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import PageHero from '../components/PageHero.vue'
import { partitionByContent } from '../utils/partitionByContent'

const data = ref<ExploreResult | null>(null)
const loading = ref(true)
const error = ref('')

const LABEL_KEYS = ['category', 'type', 'game'] as const
const labelTitles: Record<string, () => string> = {
  category: () => t('explore.catTitle', '分类'),
  type: () => t('explore.typeTitle', '类型'),
  game: () => t('explore.gameTitle', '玩法'),
}

/**
 * 某一键下"有作品"的值（facet 列表用）。
 *
 * 与改前 boxedValues 的区别：不再把值包成 TagGroupBox 需要的 {group} 形状 ——
 * 组框那层正是"一筐套一筐"的第二层，扁平列表不需要它。
 */
function valuesOf(key: string): { value: string; description: string; demo_count: number }[] {
  return (data.value?.tags[key] || [])
    .filter((v) => v.demos > 0)
    .map((v) => ({ value: v.value, description: '', demo_count: v.demos }))
}

const totalWorks = computed(() => data.value?.models.total ?? 0)

// ── 空实体降权（本轮核心） ──
// 实测：5 个模型里 4 个是「0 个作品」，却与有内容的模型同等视觉权重；移动端它们占满首屏，
// 「题目」段被挤到 top=795（视口 844 边缘）、「描述性标签」直接出首屏。
// 现在：有内容的在前，空的折叠成一行 —— **该段全空则不折叠**（见 partitionByContent 的边界说明）。
const modelsOpen = ref(false)
const tasksOpen = ref(false)
const modelsPart = computed(() => partitionByContent(data.value?.models.items ?? [], (m) => m.demo_count ?? 0))
const tasksPart = computed(() => partitionByContent(data.value?.tasks ?? [], (tk) => tk.demo_count ?? 0))
/** 描述性标签：没有作品的值直接过滤（没有信息量，不值得占位） */
const labelKeysWithContent = computed(() =>
  LABEL_KEYS.filter((k) => (data.value?.tags[k] || []).some((v) => v.demos > 0)),
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.getExplore()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="route-page">  <PageHero>
    <span class="eyebrow">{{ t('explore.eyebrow', '目录') }}</span>
    <h1 class="page-title">{{ t('explore.title', '探索') }}</h1>
    <p class="sub">{{ t('explore.sub', '按模型看它做过什么，按题目看同一句话不同模型的回答，按标签看题材分布。') }}</p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="mini-stat"><b>{{ data?.models.total ?? 0 }}</b> {{ t('explore.modelsN', '个模型') }}</span>
      <span class="mini-stat"><b>{{ data?.tasks_total ?? 0 }}</b> {{ t('explore.tasksN', '道题目') }}</span>
      <span class="mini-stat"><b>{{ totalWorks }}</b> {{ t('explore.worksN', '个作品') }}</span>
    </div>
    <!-- 口径说明：回答"这些数字是什么"（尤其 fallback_demos 这个用户一定会疑惑的数） -->
    <p v-if="data?.models.fallback_demos" class="hint mono" style="margin-top: 8px">
      {{ t('explore.fallbackNote', '其中 {n} 件作品未定型号', { n: data.models.fallback_demos }) }}
    </p>
  </PageHero>

  <section class="section" style="padding-top: 8px">
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('explore.loading', '加载探索数据…')" />

    <template v-else-if="data">
      <!-- 1. 模型 -->
      <div class="section-head">
        <h2 class="section-title">{{ t('explore.modelsTitle', '模型') }}</h2>
        <RouterLink class="btn btn-sm btn-outline" to="/models">{{ t('explore.allModels', '全部模型 →') }}</RouterLink>
      </div>
      <div v-if="!data.models.items.length" class="empty-box">{{ t('explore.emptyModels', '还没有模型条目') }}</div>
      <div v-else class="explore-grid">
        <RouterLink
          v-for="m in modelsPart.withContent"
          :key="m.slug"
          class="explore-cell card card-entity"
          :class="{ 'is-embedded': !!vendorIcon(m.vendor) }"
          :style="vendorIcon(m.vendor) ? { '--vendor': vendorIcon(m.vendor)!.hex } : undefined"
          :to="`/models/${m.slug}`"
        >
          <!-- D 变体：半嵌入图标块（上凸 10px）+ 底色=厂商色 + 左缘 3px 细带；无图标则回退字母章且无色 -->
          <template v-if="vendorIcon(m.vendor)">
            <!-- D 变体：顶带 + 左带（对齐设计稿；带子用负偏移压住卡片边框，使边框本身被染成厂商色） -->
            <span class="explore-band explore-band--top" aria-hidden="true"></span>
            <span class="explore-band explore-band--left" aria-hidden="true"></span>
            <span
              class="explore-tile"
              aria-hidden="true"
              :style="{ background: vendorIcon(m.vendor)!.hex, color: iconInkFor(vendorIcon(m.vendor)!.hex) }"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path v-for="(d, i) in vendorIcon(m.vendor)!.paths" :key="i" :d="d" />
              </svg>
            </span>
          </template>
          <span v-else class="explore-tile explore-tile--letter" aria-hidden="true">{{ (m.vendor || m.name || '?').slice(0, 1).toUpperCase() }}</span>
          <div class="explore-cell-main">
            <div class="explore-cell-name">{{ modelDisplay(m) }}</div>
            <div class="explore-cell-meta">
              <span class="explore-vendor mono">{{ m.vendor || t('explore.noVendor', '未标厂商') }} · {{ t('explore.worksShort', '{n} 件', { n: m.demo_count }) }}</span>
            </div>
            <div class="explore-cell-meta">
              <!-- 排序口径是收缩社区分，这里就必须显示同一个数：
                   显示原始 RATE 5.0 却排在 4.8 后面，等于页面自己和自己矛盾 -->
              <span
                v-if="m.score != null"
                class="stat stat-mint"
                :title="`${t('explore.scoreTip', '社区分（按票数向全站先验收缩）')} · ${t('explore.rawAvg', '未加权')} ${(m.rating_avg ?? 0).toFixed(2)}`"
              >SCORE {{ m.score.toFixed(2) }}</span>
              <span v-if="m.votes" class="mini-stat mono">{{ m.votes }}{{ t('explore.votesUnit', '票') }}</span>
            </div>
          </div>
        </RouterLink>
      </div>
      <!-- 折叠控件：用 hidden 而非 v-if —— 与静态预览页的控制器保持**同一种 DOM 增量**（都靠隐藏），
           这样展开前后的几何比对才有意义。data-fold-* 是静态预览页的控制钩子（生产里是惰性属性）。 -->
      <button
        v-if="modelsPart.collapsed"
        class="explore-fold-btn"
        type="button"
        data-fold-toggle
        aria-controls="explore-fold-models"
        :aria-expanded="modelsOpen"
        @click="modelsOpen = !modelsOpen"
      >
        <span
          data-fold-label
          :data-collapsed="t('explore.foldModels', '暂无作品的模型 {n} 个 ▾', { n: modelsPart.empty.length })"
          :data-expanded="t('explore.foldModelsOpen', '收起暂无作品的模型 ▴')"
        >{{ modelsOpen ? t('explore.foldModelsOpen', '收起暂无作品的模型 ▴') : t('explore.foldModels', '暂无作品的模型 {n} 个 ▾', { n: modelsPart.empty.length }) }}</span>
      </button>
      <div
        v-if="modelsPart.empty.length"
        id="explore-fold-models"
        class="explore-grid"
        :hidden="!modelsOpen"
        style="margin-top: 10px"
      >
        <RouterLink v-for="m in modelsPart.empty" :key="m.slug" class="explore-cell card card-entity is-empty" :to="`/models/${m.slug}`">
          <EntityStamp :name="m.name" :vendor="m.vendor" size="md" />
          <div class="explore-cell-main">
            <div class="explore-cell-name">{{ modelDisplay(m) }}</div>
            <div class="explore-cell-meta">
              <span class="muted">{{ t('explore.worksCount', '{n} 个作品', { n: m.demo_count }) }}</span>
            </div>
          </div>
        </RouterLink>
      </div>
      <RouterLink v-if="data.models.fallback_demos" to="/models" class="explore-fold mono">
        {{ t('explore.foldUnresolved', '其他 · 未定型号 / 未标注：{n} 个作品', { n: data.models.fallback_demos }) }} →
      </RouterLink>

      <!-- 2. 题目 -->
      <div class="section-head" style="margin-top: 28px">
        <h2 class="section-title">{{ t('explore.tasksTitle', '题目') }}</h2>
        <RouterLink class="btn btn-sm btn-outline" to="/tasks">{{ t('explore.allTasks', '全部题目 →') }}</RouterLink>
      </div>
      <div v-if="!data.tasks.length" class="empty-box">{{ t('explore.emptyTasks', '还没有题目') }}</div>
      <div v-else class="task-lines">
        <RouterLink v-for="tk in tasksPart.withContent" :key="tk.slug" class="task-line" :to="`/tasks/${tk.slug}`">
          <span class="task-line-title">{{ tk.title }}</span>
          <!-- 一行题面摘要：没有它，"仿真题：坦克·科幻·幻坦"这种标题读者无从判断要不要点进去 -->
          <span v-if="tk.description || tk.prompt_excerpt" class="task-line-desc muted">
            {{ (tk.description || tk.prompt_excerpt || '').slice(0, 70) }}
          </span>
          <span class="task-line-count">{{ t('explore.taskWorks', '{n} 个作品', { n: tk.demo_count }) }}</span>
          <span class="task-line-cta">{{ t('explore.taskCta', '同题对比 →') }}</span>
        </RouterLink>
      </div>
      <button
        v-if="tasksPart.collapsed"
        class="explore-fold-btn"
        type="button"
        data-fold-toggle
        aria-controls="explore-fold-tasks"
        :aria-expanded="tasksOpen"
        @click="tasksOpen = !tasksOpen"
      >
        <span
          data-fold-label
          :data-collapsed="t('explore.foldTasks', '暂无作品的题目 {n} 道 ▾', { n: tasksPart.empty.length })"
          :data-expanded="t('explore.foldTasksOpen', '收起暂无作品的题目 ▴')"
        >{{ tasksOpen ? t('explore.foldTasksOpen', '收起暂无作品的题目 ▴') : t('explore.foldTasks', '暂无作品的题目 {n} 道 ▾', { n: tasksPart.empty.length }) }}</span>
      </button>
      <div v-if="tasksPart.empty.length" id="explore-fold-tasks" class="task-lines" :hidden="!tasksOpen" style="margin-top: 10px">
        <RouterLink v-for="tk in tasksPart.empty" :key="tk.slug" class="task-line is-empty" :to="`/tasks/${tk.slug}`">
          <span class="task-line-title">{{ tk.title }}</span>
          <span class="task-line-count">{{ t('explore.taskWorks', '{n} 个作品', { n: tk.demo_count }) }}</span>
        </RouterLink>
      </div>

      <!-- 3. 描述性标签（D5：面板级标签一律用青色组盒，行内才留 chips） -->
      <div class="section-head" style="margin-top: 28px">
        <h2 class="section-title">{{ t('explore.labelsTitle', '描述性标签') }}</h2>
        <RouterLink class="btn btn-sm btn-outline" to="/tags/keys">{{ t('explore.allKeys', '全部标签键 →') }}</RouterLink>
      </div>
      <!-- 空值不占位：某键下全是 0 作品的标签就不渲染该盒；三键都空 → 一行空态 + 出口 -->
      <EmptyBox v-if="!labelKeysWithContent.length" :text="t('explore.noLabels', '还没有描述性标签')">
        <template #action>
          <RouterLink class="btn btn-sm btn-outline" to="/tags/keys">{{ t('explore.allKeys', '全部标签键 →') }}</RouterLink>
        </template>
      </EmptyBox>
      <!-- 扁平 facet 列表：一行一键（dl/dt/dd）。
           改前是"每键一个外框 + TagGroupBox 自带组框 + chip 自身边框" = **三层黑框**装一个 chip，
           而外层块宽 672px —— 空与重同时发生。现在整段一层框，chip 是唯一有边框的元素。 -->
      <dl v-else class="explore-facets">
        <div v-for="k in LABEL_KEYS" :key="k" class="explore-facet-row">
          <dt class="explore-facet-key mono">{{ labelTitles[k]() }}</dt>
          <dd class="explore-facet-values">
            <template v-if="valuesOf(k).length">
              <RouterLink
                v-for="v in valuesOf(k)"
                :key="v.value"
                class="tag-chip mode-fixed"
                :to="`/tag/${k}/${v.value}`"
              >
                {{ tagLabel(v.value) }}<span class="count">{{ v.demo_count }}</span>
                <TagTip :tag-key="k" :value="v.value" :description="v.description" />
              </RouterLink>
            </template>
            <span v-else class="muted">{{ t('explore.noValue', '暂无') }}</span>
          </dd>
        </div>
      </dl>
      <EmptyBox v-if="!data.models.items.length && !data.tasks.length" :text="t('explore.emptyAll', '还没有可探索的内容')" />
    </template>

    <!-- M1-C 词表降级：标签词表从导航沉入探索页尾部（/tags/keys URL 保留不动，外链不死） -->
    <div class="explore-tail">
      <RouterLink class="explore-tail-link" to="/tags/keys">{{ t('explore.glossary', '标签词表') }} →</RouterLink>
    </div>
  </section>
  </div>
</template>

<style scoped>
/* 统计计数：黄底 → 白底 + 2px 黑边 + 数字 900 字重。
   **只在探索页**生效（用 :deep 限定在本页根下）—— .mini-stat 是全站共享类，
   直接改 explore.css 会波及用户页/首页等处的同类计数（那是另一件事，不该顺手改）。 */
.route-page :deep(.mini-stat) {
  background: var(--paper);
  color: var(--ink);
  border: 2px solid var(--ink);
  box-shadow: none;
}
.route-page :deep(.mini-stat) b {
  font-weight: 900;
  /* 数字方块默认也是黄底（.mini-stat b 自带）—— 统计不该用行动色，这里一并复位 */
  background: transparent;
  border: none;
  color: var(--ink);
}
.route-page :deep(.task-line-count) {
  background: var(--paper);
  border: 2px solid var(--ink);
  box-shadow: none;
}
/* ≤720：本页自己的可点元素触达 ≥44px（主题切换/顶栏 brand 是共享组件，属全站问题，另记） */
@media (max-width: 720px) {
  .route-page :deep(.section-head .btn) {
    min-height: 44px;
  }
}
/* M1-C 词表入口：styles/ 冻结令——全 scoped；mono 小字+虚线上缘，探索页收尾的低调出口 */
.explore-tail {
  margin-top: 30px;
  padding: 12px 0 2px;
  border-top: 2px dashed rgba(0, 0, 0, 0.18);
  display: flex;
  justify-content: center;
}
.explore-tail-link {
  font-family: var(--font-mono, var(--font-body, monospace));
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink-soft, #555);
  text-decoration: none;
  padding: 6px 4px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
@media (hover: hover) {
  .explore-tail-link:hover {
    color: var(--ink, #000);
    background: var(--yellow, #ffd93d);
  }
}
</style>
