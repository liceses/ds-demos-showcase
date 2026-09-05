<!-- T15 拆分件（04 §5.4）：CompletenessDash —— 完成度仪表盘（自 UploadView.vue 逐字迁出，行为不变） -->
<script setup lang="ts">
import { t } from '../../i18n'

defineProps<{
  rank: { label: string; hint: string }
  allDone: number
  checklist: { label: string; done: boolean; step: number; must: boolean }[]
  mustDone: number
  mustTotal: number
  barPct: number
  step: number
  asideOn: boolean
}>()
const emit = defineEmits<{ go: [step: number]; toggleAside: [] }>()
</script>

<template>
  <div class="uw-dash">
    <span class="uw-rank" :class="{ full: rank.label && allDone === checklist.length }">
      <b>{{ rank.label }}</b><span class="uw-rank-hint">{{ rank.hint }}</span>
    </span>
    <span class="uw-dash-lead">
      <b>{{ mustDone }}</b>/{{ mustTotal }} {{ t('upload.dashMust', '必答已就绪') }} · {{ allDone }}/{{ checklist.length }} {{ t('upload.dashAll', '项已填') }}
    </span>
    <span class="uw-dash-bar" role="progressbar" :aria-valuenow="barPct" aria-valuemin="0" aria-valuemax="100" :aria-label="t('upload.dashAll', '完成度')"><i :style="{ width: barPct + '%' }"></i></span>
    <button
      v-for="c in checklist"
      :key="c.label"
      type="button"
      class="uw-item"
      :class="{ done: c.done, pending: c.must && !c.done && c.step === step }"
      :title="c.must ? t('upload.dashRequired', '必填') : t('upload.dashBetter', '建议补上')"
      @click="emit('go', c.step)"
    >
      <span class="uw-dot">{{ c.done ? '✓' : '·' }}</span>{{ c.label }}
    </button>
    <button class="uw-aside-toggle" type="button" :aria-pressed="asideOn" :title="t('upload.asideTip', '要不要旁白解说')" @click="emit('toggleAside')">
      {{ asideOn ? '💬' : '💬̸' }} {{ t('upload.asideLabel', '旁白') }}
    </button>
  </div>
</template>