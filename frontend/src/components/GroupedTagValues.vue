<script setup lang="ts">
import { computed } from 'vue'
import type { TagKeyValue } from '../api/types'
import { groupedTagValues } from '../utils/tagGroups'

const props = withDefaults(
  defineProps<{ values: TagKeyValue[]; routeKey: string; activeValue?: string; mode?: string; hit?: (value: string) => boolean }>(),
  { activeValue: '', mode: 'fixed', hit: undefined },
)

const groups = computed(() => groupedTagValues(props.values))
const multi = computed(() => groups.value.length > 1)
</script>

<template>
  <template v-if="multi">
    <div v-for="g in groups" :key="g.group" class="tag-group-block">
      <div class="tag-group-name">{{ g.group }}</div>
      <div class="filter-row" style="margin: 0">
        <RouterLink
          v-for="v in g.values"
          :key="v.value"
          class="tag-chip"
          :class="['mode-' + mode, { active: v.value === activeValue, 'search-hit': hit?.(v.value) }]"
          :to="`/tag/${routeKey}/${v.value}`"
        >
          {{ v.value }}<span class="count">{{ v.demo_count }}</span>
        </RouterLink>
      </div>
    </div>
  </template>
  <template v-else>
    <div class="filter-row" style="margin: 0">
      <RouterLink
        v-for="v in values"
        :key="v.value"
        class="tag-chip"
        :class="['mode-' + mode, { active: v.value === activeValue, 'search-hit': hit?.(v.value) }]"
        :to="`/tag/${routeKey}/${v.value}`"
      >
        {{ v.value }}<span class="count">{{ v.demo_count }}</span>
      </RouterLink>
    </div>
  </template>
</template>
