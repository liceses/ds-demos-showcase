<script setup lang="ts">
// 题目候选（v2 B3′）：Task 不从标签长出来，从 prompt 簇长出来。
// 管理员只做两个动作：确认/改名 + 点「成题」（一次调用 = 建题 + 批量挂题）。
// 聚类产物一律是建议，绝不自动落库（治理文档：禁止无审查地自动创建 Task）。
defineOptions({ name: 'AdminClustersSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { PromptCluster, PromptClusters } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import { tagLabel } from '../../utils/funMode'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import { t } from '../../i18n'

const ui = useUiStore()

const data = ref<PromptClusters | null>(null)
const loading = ref(false)
const error = ref('')
const names = ref<Record<string, string>>({})
const busy = ref<Record<string, boolean>>({})
// 面板上手动放宽阈值（观察用），默认走后端标定值
const minScore = ref(0.35)

// 统计口径（避免模板里拼串导致 EN 插值失配）
const corpusN = computed(() => data.value?.stats.demos_with_prompt ?? 0)
const uniqueN = computed(() => data.value?.stats.unique_prompts ?? 0)
const exactN = computed(() => data.value?.stats.exact_clusters ?? 0)
const similarN = computed(() => data.value?.stats.similar_clusters ?? 0)

// 键必须与模板里的 v-model 索引完全一致：档位名 + 该档内序号
function nameKey(kind: 'exact' | 'similar', i: number) {
  return `${kind}-${i}`
}

async function load(refresh = false) {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getPromptClusters({ refresh, minScore: minScore.value })
    data.value = res
    // 预填建议题名（管理员改一个字就能成题）
    const next: Record<string, string> = {}
    for (const kind of ['exact', 'similar'] as const) {
      res[kind].forEach((c, i) => {
        next[nameKey(kind, i)] = c.suggested_title
      })
    }
    names.value = next
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function adopt(kind: 'exact' | 'similar', c: PromptCluster, i: number) {
  const k = nameKey(kind, i)
  const title = (names.value[k] || '').trim()
  if (!title) {
    ui.toast(t('admin.clusters.needName', '请先给题目起个名字'), 'error')
    return
  }
  const demoIds = c.demos.map((d) => d.demo_id).filter((id) => id > 0)
  if (!demoIds.length) {
    ui.toast(t('admin.clusters.noDemoIds', '该簇作品缺少可挂载的 id'), 'error')
    return
  }
  // 预览影响 → 确认 → 回执：这一步会创建公开实体（题目）并改动 N 件作品的归属，
  // 相似簇还是模糊匹配（阈值 0.35），所以必须让管理员在点之前看见"会挂哪些、有多确定"。
  const fuzzy = kind === 'similar'
  const ok = await ui.confirm({
    title: t('admin.clusters.confirmTitle', '执行成题？'),
    message:
      `${t('admin.clusters.willCreate', '将创建题目')}《${title}》，${t('admin.clusters.willAttach', '并挂载 {n} 件作品', { n: demoIds.length })}。` +
      (fuzzy
        ? ` ${t('admin.clusters.fuzzyWarn', '注意：这是相似簇（按提示词相似度聚组，非完全相同），挂载后它们会出现在同一「同题对比」里。')}`
        : ` ${t('admin.clusters.exactNote', '这些作品提示词完全相同，成题后进入严格复现对照。')}`),
    confirmText: t('admin.clusters.doAdopt', '执行'),
  })
  if (!ok) return
  busy.value[k] = true
  try {
    const res = await api.adminCreateTask({ title, demo_ids: demoIds })
    ui.toast(t('admin.clusters.adopted', `已成题《${res.title}》，挂载 ${res.attached} 个作品`, { title: res.title, n: res.attached }), 'success')
    await load(true)
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value[k] = false
  }
}

onMounted(() => load())
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
      <span class="filter-label">{{ t('admin.clusters.hint', '同一句提示词 / 相似提示词聚成的题目候选，命名后即可成题') }}</span>
      <label class="mini-stat" style="display: flex; align-items: center; gap: 6px">
        {{ t('admin.clusters.threshold', '相似阈值') }}
        <input v-model.number="minScore" class="input" type="number" min="0.1" max="1" step="0.05" style="max-width: 90px" />
      </label>
      <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load(true)">
        {{ loading ? t('common.rescanning', '扫描中…') : t('admin.clusters.rescan', '重新扫描') }}
      </button>
      <span v-if="data" class="muted mono" style="font-size: 12px">
        {{ t('admin.clusters.stats', `语料 ${corpusN} 条 / 去重 ${uniqueN} 句 / exact ${exactN} · similar ${similarN}`, {
          a: corpusN, b: uniqueN, c: exactN, d: similarN,
        }) }}
      </span>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading && !data" :text="t('admin.clusters.loading', '聚类中…')" />

    <template v-else-if="data">
      <template v-for="kind in (['exact', 'similar'] as const)" :key="kind">
        <div class="section-head" style="margin-top: 18px">
          <h3 class="section-title" style="font-size: 20px">
            {{ kind === 'exact' ? t('admin.clusters.exact', '同句提示词（最高质量）') : t('admin.clusters.similar', '相似提示词（需人工判题）') }}
          </h3>
          <span class="muted" style="font-size: 12px">
            {{ kind === 'exact'
              ? t('admin.clusters.exactHint', '同一句话交给不同模型，直接就是 Benchmark')
              : t('admin.clusters.similarHint', '阈值 0.35 起（线上语料标定），再低会混入不同题') }}
          </span>
        </div>

        <EmptyBox v-if="!data[kind].length" :text="t('admin.clusters.emptyKind', '这一档暂无候选')" />
        <div v-else class="cluster-list">
          <article v-for="(c, i) in data[kind]" :key="kind + i" class="cluster-card card card-default" :class="{ 'is-covered': c.covered }">
            <header class="cluster-head">
              <span class="cluster-badge" :class="'cb-' + c.kind">{{ kind === 'exact' ? 'EXACT' : `SIM ${c.score ?? minScore}` }}</span>
              <span class="stat stat-teal">DEMO {{ c.demo_count }}</span>
              <span class="stat stat-mint">MODEL {{ c.distinct_models }}</span>
              <span v-if="c.covered" class="cluster-covered-tag">{{ t('admin.clusters.covered', '已入题') }}</span>
            </header>

            <label class="field" style="margin: 10px 0 6px">
              {{ t('admin.clusters.nameLabel', '题面名称') }}
              <input v-model="names[kind + '-' + i]" class="input" :placeholder="t('admin.clusters.namePh', '给这道题起个短名')" />
            </label>

            <div class="cluster-models">
              <span v-for="m in c.models" :key="m" class="tag-chip mode-fixed">{{ tagLabel(m) }}</span>
            </div>

            <p class="cluster-prompt mono" :title="c.sample_prompt">{{ c.sample_prompt }}</p>

            <ul class="cluster-demos">
              <li v-for="d in c.demos" :key="d.slug">
                <RouterLink :to="`/demo/${d.slug}`" target="_blank">{{ d.title }}</RouterLink>
                <span class="muted">
                  {{ d.models.map(tagLabel).join('/') || '—' }}
                  <template v-if="d.rating_count"> · ★{{ d.rating_avg.toFixed(1) }}({{ d.rating_count }})</template>
                </span>
              </li>
            </ul>

            <div class="filter-row" style="margin-top: 10px">
              <button
                class="btn btn-sm btn-primary"
                type="button"
                :disabled="busy[kind + '-' + i]"
                @click="adopt(kind, c, i)"
              >{{ busy[kind + '-' + i] ? t('admin.clusters.adopting', '执行中…') : t('admin.clusters.adopt', '执行：创建题目并挂题 →') }}</button>
              <span class="hint">{{ t('admin.clusters.adoptHint', '一次调用 = 建题 + 批量挂载；成题后该簇标记为已入题') }}</span>
            </div>
          </article>
        </div>
      </template>
    </template>
  </div>
</template>
