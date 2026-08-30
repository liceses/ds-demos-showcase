<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../api'
import { t, lang } from '../i18n'

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
  return `<h${depth} id="${id}">${text} <a class="md-anchor" href="#${id}" aria-label="${t('md.anchor', '锚点')}">#</a></h${depth}>`
}
renderer.code = ({ text, lang: codeLang }) => {
  const cls = codeLang ? ` class="language-${codeLang}"` : ''
  return `<div class="md-code"><button class="md-copy" type="button">${t('md.copy', '复制')}</button><pre><code${cls}>${highlightCode(text)}</code></pre></div>`
}
renderer.link = ({ href, title, tokens }) => {
  const text = tokens.map((t) => (t as { text?: string }).text || '').join('')
  const safe = /^(https?:|mailto:|\/|#)/i.test(href || '')
  if (!safe) return text
  const external = /^https?:/i.test(href || '')
  return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}${title ? ` title="${title}"` : ''}>${text}</a>`
}

marked.setOptions({ gfm: true, breaks: true, renderer })

// 渲染缓存：同一 content 重复渲染（公告/回复/帖子）不再重复 parse+sanitize；
// key 带 lang——切换语言后缓存自动失效，富卡片/按钮文案随语言更新
const htmlCache = new Map<string, string>()
const html = computed(() => {
  const raw = props.content || ''
  const key = lang.value + '|' + raw
  const cached = htmlCache.get(key)
  if (cached) return cached
  const out = DOMPurify.sanitize(marked.parse(raw) as string, {
    ADD_ATTR: ['target', 'rel', 'id'],
  })
  if (htmlCache.size > 500) htmlCache.clear()
  htmlCache.set(key, out)
  return out
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
      <span class="md-link-meta">${attr(d.author)} · ${t('md.viewDemo', '查看作品 →')}</span>
    </span>
  </a>`
}

function topicCardHtml(topic: TopicInfo) {
  return `<a class="md-link-card md-link-topic" data-link-card="1" href="/forum/topic/${topic.id}">
    <span class="md-link-main">
      <span class="md-link-title">${attr(topic.title)}</span>
      <span class="md-link-meta">${attr(topic.author)} · ${t('md.topicMeta', '回复 {n} · 查看讨论 →', { n: topic.reply_count })}</span>
    </span>
  </a>`
}

function placeholderHtml() {
  return `<span class="md-link-card md-link-loading" data-link-card="1">${t('md.resolving', '解析链接…')}</span>`
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
            .then((tp) => (tp ? { id: tp.id, title: tp.title, author: tp.author || t('forum.anon', '匿名'), reply_count: tp.reply_count } : null))
            .catch(() => null),
        )
      }
      topicCache.get(id)!.then((tp) => {
        if (tp) holder.outerHTML = topicCardHtml(tp)
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
      btn.textContent = t('md.copied', '已复制')
      setTimeout(() => (btn.textContent = t('md.copy', '复制')), 1200)
    })
    .catch(() => undefined)
}
</script>

<template>
  <div ref="root" class="markdown-body" :class="{ compact }" v-html="html" @click="onRootClick"></div>
</template>
