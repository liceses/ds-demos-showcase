<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    tag: { key: string; value: string }
    active?: boolean
    count?: number
    color?: 'red' | 'teal' | 'yellow' | ''
    to?: string
  }>(),
  { active: false, count: undefined, color: '', to: '' },
)

const cls = computed(() => [props.color, props.active ? 'active' : ''].filter(Boolean).join(' '))
</script>

<template>
  <RouterLink v-if="to" :to="to" class="tag-chip" :class="cls">
    <span>{{ tag.key }}:{{ tag.value }}</span>
    <span v-if="count !== undefined" class="count">{{ count }}</span>
  </RouterLink>
  <span v-else class="tag-chip" :class="cls" role="button" tabindex="0">
    <span>{{ tag.key }}:{{ tag.value }}</span>
    <span v-if="count !== undefined" class="count">{{ count }}</span>
  </span>
</template>
