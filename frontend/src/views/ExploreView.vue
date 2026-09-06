<script setup lang="ts">
// 探索页（v2 D3）：/tags 原地升级 —— 模型 / 题目 / 描述性标签三段。
// 顶栏因此从 7 项收敛到 5 项：模型与题目不再各占一个导航位，只从本页进入。
// 兜底位（未定型号/未标注/灰测）不参与热门排名，折叠成一行「其他 · 未定 N」。
defineOptions({ name: 'ExploreView' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { ExploreResult, TagKeyValue } from '../api/types'
import { modelDisplay } from '../utils/modelDisplay'
import { t } from '../i18n'
import EntityStamp from '../components/EntityStamp.vue'
import TagGroupBox from '../components/TagGroupBox.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'

const data = ref<ExploreResult | null>(null)
const loading = ref(true)
const error = ref('')

const LABEL_KEYS = ['category', 'type', 'game'] as const
const labelTitles: Record<string, () => string> = {
  category: () => t('explore.catTitle', '分类'),
  type: () => t('explore.typeTitle', '类型'),
  game: () => t('explore.gameTitle', '玩法'),
}

/** D5 组盒统一：把 explore 的 {value, demos} 映射成 TagKeyValue，group 用键标签当盒头 */
function boxedValues(key: string): TagKeyValue[] {
  const label = labelTitles[key]?.() || key
  return (data.value?.tags[key] || []).map((v) => ({
    value: v.value,
    description: '',
    demo_count: v.demos,
    group: label,
  }))
}
function boxCount(key: string): number {
  return (data.value?.tags[key] || []).length
}

const totalWorks = computed(() => data.value?.models.total ?? 0)

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
  <div class="route-page">  <section class="page-hero page-hero--compact">
    <span class="eyebrow">{{ t('explore.eyebrow', '探索') }}</span>
    <h1 class="page-title">{{ t('explore.title', '探索') }}</h1>
    <p class="sub">{{ t('explore.sub', '按模型看它做过什么，按题目看同一句话不同模型的回答，按标签看题材分布。') }}</p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="tag-stat"><b>{{ data?.models.total ?? 0 }}</b> {{ t('explore.modelsN', '个模型') }}</span>
      <span class="tag-stat"><b>{{ data?.tasks_total ?? 0 }}</b> {{ t('explore.tasksN', '道题目') }}</span>
      <span class="tag-stat"><b>{{ totalWorks }}</b> {{ t('explore.worksN', '个作品') }}</span>
    </div>
  </section>

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
        <RouterLink v-for="m in data.models.items" :key="m.slug" class="explore-cell card card-entity" :to="`/models/${m.slug}`">
          <EntityStamp :name="m.name" :vendor="m.vendor" size="md" />
          <div class="explore-cell-main">
            <div class="explore-cell-name">{{ modelDisplay(m) }}</div>
            <div class="explore-cell-meta">
              <span class="muted">{{ t('explore.worksCount', '{n} 个作品', { n: m.demo_count }) }}</span>
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
        <RouterLink v-for="tk in data.tasks" :key="tk.slug" class="task-line" :to="`/tasks/${tk.slug}`">
          <span class="task-line-title">{{ tk.title }}</span>
          <!-- 一行题面摘要：没有它，"仿真题：坦克·科幻·幻坦"这种标题读者无从判断要不要点进去 -->
          <span v-if="tk.description || tk.prompt_excerpt" class="task-line-desc muted">
            {{ (tk.description || tk.prompt_excerpt || '').slice(0, 70) }}
          </span>
          <span class="task-line-count">{{ t('explore.taskWorks', '{n} 个作品', { n: tk.demo_count }) }}</span>
          <span class="task-line-cta">{{ t('explore.taskCta', '同题对比 →') }}</span>
        </RouterLink>
      </div>

      <!-- 3. 描述性标签（D5：面板级标签一律用青色组盒，行内才留 chips） -->
      <div class="section-head" style="margin-top: 28px">
        <h2 class="section-title">{{ t('explore.labelsTitle', '描述性标签') }}</h2>
        <RouterLink class="btn btn-sm btn-outline" to="/tags/keys">{{ t('explore.allKeys', '全部标签键 →') }}</RouterLink>
      </div>
      <div class="explore-labels">
        <div v-for="k in LABEL_KEYS" :key="k" class="explore-label-block">
          <TagGroupBox :values="boxedValues(k)" mode="display" :route-key="k" />
          <p v-if="!boxCount(k)" class="muted" style="font-size: 13px; margin: 6px 0 0">{{ t('explore.emptyLabels', '暂无') }}</p>
        </div>
      </div>
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
