<script setup lang="ts">
// DSH 会话轨迹渲染：把 dsh 导出的 session.jsonl（JSONL 事件流）渲染成可读时间线。
import { computed, ref } from 'vue'

const props = defineProps<{ raw: string }>()

interface Ev {
  type: string
  data?: Record<string, unknown> | null
}

interface Block {
  kind: 'header' | 'user' | 'assistant' | 'tool' | 'toolresult' | 'reason' | 'meta'
  title?: string
  text?: string
  args?: string
}

const model = ref('')
const preset = ref('')
const meta: string[] = []

function parse(): Block[] {
  const out: Block[] = []
  if (!props.raw) return out
  const lines = props.raw.split('\n').filter(Boolean)
  for (const ln of lines) {
    let ev: Ev
    try {
      ev = JSON.parse(ln)
    } catch {
      continue
    }
    const d = ev.data
    switch (ev.type) {
      case 'request/context':
        if (d && typeof d.provider === 'string') model.value = `${d.provider}/${d.model ?? ''}`.replace(/\/$/, '')
        break
      case 'session':
        if (d && typeof d.agentPreset === 'string') preset.value = d.agentPreset as string
        break
      case 'user/message': {
        const c = (d as any)?.content
        if (typeof c === 'string' && c.trim()) out.push({ kind: 'user', title: '👤 用户', text: c.trim() })
        break
      }
      case 'assistant/message': {
        const m = (d as any)?.message
        const text = typeof m === 'string' ? m : JSON.stringify(m)
        if (text) out.push({ kind: 'assistant', title: '🤖 AI 助手', text })
        break
      }
      case 'tool/call': {
        const name = (d as any)?.name || 'tool'
        const args = (d as any)?.arguments
        out.push({
          kind: 'tool',
          title: `🛠️ ${name}`,
          args: typeof args === 'string' ? args : JSON.stringify(args ?? {}, null, 2),
        })
        break
      }
      case 'tool/result': {
        const m = (d as any)?.message
        const text = typeof m === 'string' ? m : JSON.stringify(m)
        out.push({ kind: 'toolresult', title: '↩️ 工具返回', text })
        break
      }
      case 'reasoning-chunks': {
        const idx = (d as any)?.index
        out.push({ kind: 'reason', title: `💭 思考${typeof idx === 'number' ? ' #' + (idx + 1) : ''}`, text: '（推理过程摘要）' })
        break
      }
      default:
        break
    }
  }
  return out
}

const blocks = computed(() => parse())
</script>

<template>
  <div v-if="model || preset" class="card card-mint" style="padding: 12px 16px; margin-bottom: 14px; font-size: 13px">
    <span v-if="model" class="mini-stat" style="margin-right: 16px"><b>模型</b> {{ model }}</span>
    <span v-if="preset" class="mini-stat"><b>预设</b> {{ preset }}</span>
  </div>

  <div class="dsh-trajectory">
    <div v-for="(b, i) in blocks" :key="i" class="dsh-block" :class="'dsh-' + b.kind">
      <div class="dsh-title">{{ b.title }}</div>
      <pre v-if="b.kind === 'tool'" class="dsh-code">{{ b.args }}</pre>
      <pre v-else-if="b.kind === 'reason'" class="muted" style="margin: 0; font-size: 12px">{{ b.text }}</pre>
      <p v-else class="dsh-text">{{ b.text }}</p>
    </div>
    <div v-if="!blocks.length" class="empty-box">未能解析会话轨迹</div>
  </div>
</template>
