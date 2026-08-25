<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = withDefaults(defineProps<{ content: string; compact?: boolean }>(), { compact: false })

// ---------- 轻量代码高亮（不引 highlight.js，控制体积） ----------
function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const KEYWORDS =
  /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|true|false|null|undefined|def|print|lambda|in|not|and|or|type|interface|enum|public|private|static|void|int|float|string|bool)\b/g

function highlightCode(code: string) {
  const esc = escapeHtml(code)
  return esc
    .replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="md-tok-str">$1</span>')
    .replace(/(\/\/[^\n]*|#.*)/g, '<span class="md-tok-com">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="md-tok-num">$1</span>')
    .replace(KEYWORDS, '<span class="md-tok-kw">$1</span>')
}

// ---------- marked 自定义 renderer（v18 token 风格） ----------
const renderer = new marked.Renderer()
renderer.heading = ({ tokens, depth }) => {
  const text = tokens.map((t) => (t as { text?: string }).text || '').join('')
  const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '')
  return `<h${depth} id="${id}">${text} <a class="md-anchor" href="#${id}" aria-label="锚点">#</a></h${depth}>`
}
renderer.code = ({ text, lang }) => {
  const cls = lang ? ` class="language-${lang}"` : ''
  return `<div class="md-code"><button class="md-copy" type="button">复制</button><pre><code${cls}>${highlightCode(text)}</code></pre></div>`
}
renderer.link = ({ href, title, tokens }) => {
  const text = tokens.map((t) => (t as { text?: string }).text || '').join('')
  const safe = /^(https?:|mailto:|\/|#)/i.test(href || '')
  if (!safe) return text
  const external = /^https?:/i.test(href || '')
  return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}${title ? ` title="${title}"` : ''}>${text}</a>`
}

marked.setOptions({ gfm: true, breaks: true, renderer })

const html = computed(() => {
  const raw = marked.parse(props.content || '') as string
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel', 'id'],
  })
})

// ---------- 代码复制（事件委托，单监听） ----------
function onRootClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.md-copy') as HTMLElement | null
  if (!btn) return
  const code = btn.parentElement?.querySelector('pre code')
  const text = code?.textContent || ''
  navigator.clipboard
    .writeText(text)
    .then(() => {
      btn.textContent = '已复制'
      setTimeout(() => (btn.textContent = '复制'), 1200)
    })
    .catch(() => undefined)
}
</script>

<template>
  <div class="markdown-body" :class="{ compact }" v-html="html" @click="onRootClick"></div>
</template>
