<script setup lang="ts">
/**
 * 双滑块范围选择（新野兽派）
 * modelValue: { lo, hi }，lo <= hi 自动约束
 */
const props = withDefaults(defineProps<{ min: number; max: number; step?: number }>(), { step: 1 })
const model = defineModel<{ lo: number; hi: number }>({ required: true })

function onLo(e: Event) {
  const v = Math.min(Number((e.target as HTMLInputElement).value), model.value.hi)
  model.value = { ...model.value, lo: v }
}
function onHi(e: Event) {
  const v = Math.max(Number((e.target as HTMLInputElement).value), model.value.lo)
  model.value = { ...model.value, hi: v }
}
</script>

<template>
  <div class="range-slider">
    <div class="range-track"></div>
    <input class="range-input range-lo" type="range" :min="min" :max="max" :step="step" :value="model.lo" @input="onLo" />
    <input class="range-input range-hi" type="range" :min="min" :max="max" :step="step" :value="model.hi" @input="onHi" />
    <div class="range-values"><span>{{ model.lo }}</span><span>~</span><span>{{ model.hi }}</span></div>
  </div>
</template>
