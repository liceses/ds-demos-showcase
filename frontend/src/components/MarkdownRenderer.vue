<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../api'

const props = withDefaults(defineProps<{ content: string; compact?: boolean; resolveLinks?: boolean }>(), {
  compact: false,
  resolveLinks: true,
})

const root = ref<HTMLElement | null>(null)

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

// ---------- 内部链接富卡片 ----------
type DemoInfo = { slug: string; title: string; author: string; cover_url: string }
type TopicInfo = { id: number; title: string; author: string; reply_count: number }

const demoCache = new Map<string, Promise<DemoInfo | null>>()
const topicCache = new Map<string, Promise<TopicInfo | null>>()

function attr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function demoCardHtml(d: DemoInfo) {
  return `<a class="md-link-card md-link-demo" data-link-card="1" href="/demo/${attr(d.slug)}">
    <img class="md-link-cover" src="${attr(d.cover_url)}" alt="" loading="lazy" />
    <span class="md-link-main">
      <span class="md-link-title">${attr(d.title)}</span>
      <span class="md-link-meta">${attr(d.author)} · 查看作品 →</span>
    </span>
  </a>`
}

function topicCardHtml(t: TopicInfo) {
  return `<a class="md-link-card md-link-topic" data-link-card="1" href="/forum/topic/${t.id}">
    <span class="md-link-main">
      <span class="md-link-title">${attr(t.title)}</span>
      <span class="md-link-meta">${attr(t.author)} · 回复 ${t.reply_count} · 查看讨论 →</span>
    </span>
  </a>`
}

function placeholderHtml() {
  return `<span class="md-link-card md-link-loading" data-link-card="1">解析链接…</span>`
}

function scanLinks() {
  if (!props.resolveLinks || !root.value) return
  const anchors = root.value.querySelectorAll<HTMLAnchorElement>('a[href]')
  for (const a of anchors) {
    if (a.hasAttribute('data-link-card')) continue
    const href = a.getAttribute('href') || ''
    const demoM = href.match(/\/demo\/([^/?#]+)/)
    const topicM = href.match(/\/forum\/topic\/(\d+)/)
    if (!demoM && !topicM) continue
    const original = a.outerHTML
    const holder = document.createElement('span')
    holder.innerHTML = placeholderHtml()
    a.replaceWith(holder)
    if (demoM) {
      const slug = decodeURIComponent(demoM[1])
      if (!demoCache.has(slug)) {
        demoCache.set(
          slug,
          api.getDemo(slug).then((d) => ({ slug: d.slug, title: d.title, author: d.author, cover_url: d.cover_url })).catch(() => null),
        )
      }
      demoCache.get(slug)!.then((d) => {
        if (d) holder.outerHTML = demoCardHtml(d)
        else holder.outerHTML = original
      })
    } else if (topicM) {
      const id = topicM[1]
      if (!topicCache.has(id)) {
        topicCache.set(
          id,
          api
            .getForumTopic(Number(id))
            .then((t) => (t ? { id: t.id, title: t.title, author: t.author || '匿名', reply_count: t.reply_count } : null))
            .catch(() => null),
        )
      }
      topicCache.get(id)!.then((t) => {
        if (t) holder.outerHTML = topicCardHtml(t)
        else holder.outerHTML = original
      })
    }
  }
}

watch(
  () => props.content,
  () => {
    if (props.resolveLinks) void nextTick(scanLinks)
  },
  { immediate: true },
)

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
  <div ref="root" class="markdown-body" :class="{ compact }" v-html="html" @click="onRootClick"></div>
</template>
