<script setup lang="ts">
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
</script>

<template>
  <Teleport to="body">
    <div class="toast-host">
      <TransitionGroup name="toast">
        <div v-for="t in ui.toasts" :key="t.id" class="toast-item" :class="`toast-${t.type}`">
          <span class="toast-label mono">{{ t.type === 'success' ? 'OK' : t.type === 'error' ? 'ERR' : 'INFO' }}</span>
          <span class="toast-message">{{ t.message }}</span>
          <button class="toast-close" type="button" @click="ui.removeToast(t.id)">X</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
