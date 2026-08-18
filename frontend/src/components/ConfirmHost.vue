<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useUiStore } from '../stores/ui'

const ui = useUiStore()

function cancel() {
  ui.resolveConfirm(false)
}

function confirm() {
  ui.resolveConfirm(true)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.confirmState) {
    cancel()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="ui.confirmState" class="modal-mask" @click.self="cancel">
      <div class="modal-card card" :class="ui.confirmState.options.danger ? 'card-coral' : 'card-default'">
        <h2 class="modal-title">{{ ui.confirmState.options.title }}</h2>
        <p v-if="ui.confirmState.options.message" class="modal-message">{{ ui.confirmState.options.message }}</p>
        <div class="filter-row" style="margin-bottom: 0; justify-content: flex-end">
          <button class="btn btn-sm btn-dark" type="button" @click="cancel">
            {{ ui.confirmState.options.cancelText || '取消' }}
          </button>
          <button class="btn btn-sm" :class="ui.confirmState.options.danger ? 'btn-danger' : 'btn-primary'" type="button" @click="confirm">
            {{ ui.confirmState.options.confirmText || '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
