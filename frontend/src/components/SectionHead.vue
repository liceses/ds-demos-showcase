<script setup lang="ts">
// J2（09 §7）：区头行范式 = 标题 + 右侧次级控件槽。消费面统一走本组件，
// 消灭手搓 .section-head/.section-title；class/style 透传到根（单根 fallthrough）。
defineProps<{ title: string }>()
</script>

<template>
  <div class="section-head">
    <h2 class="section-title">{{ title }}</h2>
    <slot />
  </div>
</template>
