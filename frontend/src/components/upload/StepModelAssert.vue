<!-- T15 拆分件（04 §5.4）：StepModelAssert —— 步骤②哪个模型做的·必答（自 UploadView.vue 逐字迁出，行为不变） -->
<script setup lang="ts">
import { t } from '../../i18n'
import { tagLabel } from '../../utils/funMode'
// T5·M5-F2：词表无命中时展开 ModelPicker（后端模型搜索含别名——上传别名缺口根治）
import EntityPicker from '../picker/EntityPicker.vue'
import type { EntityPick } from '../picker/pickerSources'

const modelQuery = defineModel<string>('modelQuery')
const modelHint = defineModel<string>('modelHint')
const fbVendorOpen = defineModel<boolean>('fbVendorOpen')

defineProps<{
  filteredExact: { value: string; description?: string; demo_count: number; group?: string | null }[]
  chosenModelNames: string[]
  vendorFamilies: { vendor: string; value: string }[]
  unknownValue: string
  guessValue: string
  modelUncertain: boolean
  fbVendorOpen: boolean
  stamped: Record<string, boolean>
  modelStats: { name: string; demo_count: number; rating_avg: number | null } | null
  statsLoading: boolean
}>()
const emit = defineEmits<{ pick: [value: string]; clear: [] }>()

/** ModelPicker 命中：实体规范 slug 即词表值（模型库与 model 词表同源），别名命中 → 真名入选 */
function onEntityModelPick(p: EntityPick) {
  const value = (p.slug as string) || (p.label as string)
  if (!value) return
  emit('pick', value)
}
</script>

<template>
  <fieldset class="uw-panel">
    <legend>{{ t('upload.s2Legend', '它是哪个模型做出来的？') }}</legend>
    <p class="uw-why">{{ t('upload.s2Why', '模型是本站的地基：只有声明了，作品才会进模型页与同题对比。') }}</p>

    <div class="filter-row" style="margin: 0 0 8px">
      <input v-model="modelQuery" class="input" type="search" :placeholder="t('upload.s2Search', '搜型号名…')" data-step-focus="2" style="max-width: 240px" />
      <span class="muted mono">{{ filteredExact.length }}</span>
    </div>
    <div class="uw-chipgrid">
      <button
        v-for="v in filteredExact"
        :key="v.value"
        type="button"
        class="tag-chip mode-fixed uw-mc"
        :class="{ active: chosenModelNames.includes(v.value) }"
        :title="v.description || v.value"
        @click="emit('pick', v.value)"
      >
        <span v-if="v.group" class="uw-mc-vendor">{{ v.group }}</span>
        {{ tagLabel(v.value) }}<span class="count">{{ v.demo_count }}</span>
      </button>
      <p v-if="!filteredExact.length" class="muted">{{ t('upload.s2NoMatch', '词表里没有这个写法 —— 用下面三条出口之一，别硬填。') }}</p>
    </div>

    <!-- T5·M5-F2 别名缺口根治：词表无命中且已输入、尚未声明时，展开模型库搜索（后端 model 搜索含别名） -->
    <div v-if="(modelQuery ?? '').trim() && !filteredExact.length && !chosenModelNames.length" class="uw-entity-fallback">
      <p class="hint" style="margin: 4px 0 6px">
        {{ t('upload.s2EntityNote', '按名称/别名在模型库里找（如输入了旧写法会命中真名）…') }}
      </p>
      <EntityPicker
        kind="model"
        source="public"
        mode="dropdown"
        :placeholder="t('upload.s2EntityPh', '搜模型名 / 别名…')"
        @pick="onEntityModelPick"
      />
    </div>

    <!-- 三条"不确定"出口与精确选择同层级：不确定是合法答案 -->
    <div class="uw-fallbacks">
      <div class="uw-fb">
        <b>{{ t('upload.s2FbVendor', '知道厂商，不确定具体型号') }}</b>
        <div v-if="fbVendorOpen" class="filter-row" style="margin-top: 6px; flex-wrap: wrap">
          <button v-for="f in vendorFamilies" :key="f.value" type="button" class="tag-chip mode-open" :class="{ active: chosenModelNames.includes(f.value) }" @click="emit('pick', f.value)">
            {{ f.vendor }}
          </button>
          <p v-if="!vendorFamilies.length" class="muted">{{ t('upload.s2NoVendor', '厂商族节点还没建立，请选下一条。') }}</p>
          <button class="btn btn-sm btn-outline" type="button" @click="fbVendorOpen = false">▴ {{ t('upload.collapse', '收起') }}</button>
        </div>
        <button v-else class="btn btn-sm btn-outline" type="button" style="margin-top: 6px" @click="fbVendorOpen = true">{{ t('upload.s2PickVendor', '选厂商 →') }}</button>
      </div>
      <div class="uw-fb">
        <b>{{ t('upload.s2FbUnknown', '完全不知道是什么模型') }}</b>
        <button class="btn btn-sm btn-outline" type="button" style="margin-top: 6px" :class="{ active: chosenModelNames.includes(unknownValue) }" @click="emit('pick', unknownValue)">
          {{ t('upload.s2FbUnknownBtn', '标为「未标注」') }}
        </button>
      </div>
      <div class="uw-fb">
        <b>{{ t('upload.s2FbGuess', '网传灰测 / 内部版本，未经证实') }}</b>
        <button class="btn btn-sm btn-outline" type="button" style="margin-top: 6px" :class="{ active: chosenModelNames.includes(guessValue) }" @click="emit('pick', guessValue)">
          {{ t('upload.s2FbGuessBtn', '标为「灰测未证实」') }}
        </button>
      </div>
    </div>

    <p v-if="modelUncertain" class="hint" style="margin: 10px 0 0">
      {{ t('upload.s2UncertainNote', '不确定也是有效信息：写下依据，站方日后确认了可以批量帮你归位。') }}
    </p>
    <label v-if="modelUncertain" class="field" style="margin-top: 6px">
      {{ t('upload.modelHintLabel', '为什么不确定型号？（可选，但会帮助日后归类）') }}
      <input v-model="modelHint" class="input" maxlength="500" :placeholder="t('upload.modelHintPh', '如：网传灰测版 / 别人传的没写 / 只知道是 DeepSeek')" />
    </label>

    <div v-if="chosenModelNames.length" class="uw-picked-row">
      <span class="kpi-label">{{ t('upload.s2Picked', '已声明') }}</span>
      <span v-for="m in chosenModelNames" :key="m" class="tag-chip active">
        {{ tagLabel(m) }}
        <button type="button" class="uw-x" :aria-label="t('upload.unpick', '取消选择')" @click="emit('clear')">✕</button>
      </span>
      <button type="button" class="btn btn-sm btn-outline" @click="emit('clear')">{{ t('upload.changeMind', '改主意') }}</button>
      <span v-if="stamped.model" class="uw-stamp" aria-hidden="true">{{ t('upload.stampRegistered', '已登记') }}</span>
    </div>

    <!-- 站内战绩：把"选了谁"变成"你知道对手是谁" -->
    <p v-if="modelStats && !statsLoading" class="uw-record">
      <b>{{ modelStats.name }}</b>
      {{ t('upload.recordLine', '站内 {n} 件作品', { n: modelStats.demo_count }) }}
      <template v-if="modelStats.rating_avg != null"> · {{ t('upload.recordRating', '平均社区分 {r}', { r: modelStats.rating_avg.toFixed(2) }) }}</template>
      <span class="muted"> · {{ t('upload.recordTip', '同题对比页能看到它输给了谁') }}</span>
    </p>
  </fieldset>
</template>