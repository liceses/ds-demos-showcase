<script setup lang="ts">
// 全局搜索覆盖层（M2-3，03 §12.1 / M2 立系统）：
// 一次请求并行查 作品 / 模型 / 题目 三域（各取 Top5），分组呈现 + 「在作品库搜索 q 的全部结果」兜底；
// 键盘 ↑↓ 选中、↵ 跳转、Esc 关闭（§12.4 弹层底线：焦点圈闭 + Esc + aria-modal）。
// 竞态保护（任务书硬要求）：250ms 输入防抖 + 请求序号守卫（过期响应整包丢弃）+ 三域 allSettled（单域失败不拖垮整层）。
// 入场动效（05 §5.2 抽屉三律的全屏形态转译，裁量说明见 t3 回执）：覆盖层面=纯色直落 0ms（无边框三律第 1 律，
// 整屏位移会在视口底缘露出旧页撕裂带，故「落下回弹」收缩到内容面板）；面板=b-stamp-drop 350ms 落下回弹一次，
// 关闭 0ms 硬切对称；reduced-motion 全退场。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import type { DemoSummary, ModelSummary, TaskSummary } from '../api/types'
import { closeSearch, openSearch, searchOpen } from '../composables/useSearch'
import { t } from '../i18n'
import { modelDisplay } from '../utils/modelDisplay'

type Group = 'demos' | 'models' | 'tasks'

interface SearchRow {
  key: string
  group: Group
  idx: number
  path: string
  title: string
  meta: string
}

const router = useRouter()
const rootEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

const q = ref('')
const searching = ref(false)
const hasSearched = ref(false)
const demoItems = ref<DemoSummary[]>([])
const modelItems = ref<ModelSummary[]>([])
const taskItems = ref<TaskSummary[]>([])
const demoTotal = ref(0)
const modelTotal = ref(0)
const taskTotal = ref(0)
const failed = ref({ demos: false, models: false, tasks: false })
const activeIdx = ref(-1)

let seq = 0 // 竞态守卫：每次触发 ++，过期响应整包丢弃
let timer: ReturnType<typeof setTimeout> | undefined
let prevOverflow = ''

const term = computed(() => q.value.trim())

const rows = computed<SearchRow[]>(() => {
  const out: SearchRow[] = []
  for (const d of demoItems.value) {
    const meta = d.rating_count
      ? `${d.author} · ★${(d.rating_avg ?? 0).toFixed(1)}(${d.rating_count})`
      : d.author
    out.push({ key: `demo:${d.slug}`, group: 'demos', idx: out.length, path: `/demo/${d.slug}`, title: d.title, meta })
  }
  for (const m of modelItems.value) {
    const meta = [m.vendor || '', t('search.worksN', '{n} 作品', { n: m.demo_count })].filter(Boolean).join(' · ')
    out.push({ key: `model:${m.slug}`, group: 'models', idx: out.length, path: `/models/${m.slug}`, title: modelDisplay(m), meta })
  }
  for (const k of taskItems.value) {
    out.push({
      key: `task:${k.slug}`,
      group: 'tasks',
      idx: out.length,
      path: `/tasks/${k.slug}`,
      title: k.title,
      meta: t('search.worksN', '{n} 作品', { n: k.demo_count }),
    })
  }
  return out
})
const groupDemos = computed(() => rows.value.filter((r) => r.group === 'demos'))
const groupModels = computed(() => rows.value.filter((r) => r.group === 'models'))
const groupTasks = computed(() => rows.value.filter((r) => r.group === 'tasks'))
const activeRow = computed(() => (activeIdx.value >= 0 ? rows.value[activeIdx.value] ?? null : null))
const anyResult = computed(() => rows.value.length > 0)
const allFailed = computed(() => failed.value.demos && failed.value.models && failed.value.tasks)

function resetResults() {
  demoItems.value = []
  modelItems.value = []
  taskItems.value = []
  demoTotal.value = 0
  modelTotal.value = 0
  taskTotal.value = 0
  failed.value = { demos: false, models: false, tasks: false }
  activeIdx.value = -1
}

function scheduleRun() {
  if (timer) clearTimeout(timer)
  if (!term.value) {
    resetResults()
    hasSearched.value = false
    searching.value = false
    return
  }
  timer = setTimeout(run, 250) // 输入防抖：停 250ms 才发三域请求
}

async function run() {
  const my = ++seq
  const keyword = term.value
  if (!keyword) return
  searching.value = true
  hasSearched.value = true
  resetResults()
  const [d, m, k] = await Promise.allSettled([
    api.listDemos({ q: keyword, page: 1, page_size: 5 }),
    api.listModels({ q: keyword, page: 1, page_size: 5 }),
    api.listTasks({ q: keyword, page: 1, page_size: 5 }),
  ])
  if (my !== seq) return // 竞态守卫：期间用户又输入/关闭了 → 本次响应作废
  searching.value = false
  if (d.status === 'fulfilled') {
    demoItems.value = d.value.items
    demoTotal.value = d.value.total
  } else failed.value.demos = true
  if (m.status === 'fulfilled') {
    modelItems.value = m.value.items
    modelTotal.value = m.value.total
  } else failed.value.models = true
  if (k.status === 'fulfilled') {
    taskItems.value = k.value.items
    taskTotal.value = k.value.total
  } else failed.value.tasks = true
  activeIdx.value = rows.value.length ? 0 : -1 // 首条预选：↵ 即走
}

function clearQuery() {
  q.value = ''
  void inputEl.value?.focus()
}

function go(row: SearchRow | null) {
  if (row) router.push(row.path)
  else if (term.value) router.push({ path: '/demos', query: { q: term.value } })
  else return
  closeSearch()
}

function onInputKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = rows.value.length
    if (!n) return
    activeIdx.value = e.key === 'ArrowDown' ? (activeIdx.value + 1) % n : (activeIdx.value - 1 + n) % n
  } else if (e.key === 'Enter') {
    e.preventDefault()
    go(activeRow.value)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation() // 窗口级 Esc 监听不再重复处理
    closeSearch()
  }
}

// 焦点圈闭（§12.4）：Tab 循环在覆盖层内
function onTrapKey(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const root = rootEl.value
  if (!root) return
  const focusables = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input')).filter(
    (el) => el.offsetParent !== null,
  )
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const cur = document.activeElement
  if (e.shiftKey && (cur === first || !(cur instanceof Node && root.contains(cur)))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (cur === last || !(cur instanceof Node && root.contains(cur)))) {
    e.preventDefault()
    first.focus()
  }
}

// 全局键：⌘K/Ctrl K 常开；`/` 快捷键（输入焦点内不抢）；Esc 关闭（M2 命令面板 §12.2 的入口预埋）
function onWinKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (!searchOpen.value) openSearch()
    return
  }
  if (e.key === '/' && !searchOpen.value) {
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    e.preventDefault()
    openSearch()
    return
  }
  if (e.key === 'Escape' && searchOpen.value) closeSearch()
}

watch(searchOpen, (open) => {
  if (open) {
    prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // 全屏覆盖层期间锁定背后滚动
    void nextTick(() => {
      inputEl.value?.focus()
      inputEl.value?.select()
    })
  } else {
    document.body.style.overflow = prevOverflow
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    seq++ // 作废在途请求：关闭后回来的响应不再上屏
  }
})

watch(activeIdx, (i) => {
  if (i < 0) return
  document.getElementById(`so-opt-${i}`)?.scrollIntoView({ block: 'nearest' })
})

onMounted(() => document.addEventListener('keydown', onWinKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onWinKey)
  if (searchOpen.value) document.body.style.overflow = prevOverflow
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="searchOpen"
      ref="rootEl"
      class="so"
      role="dialog"
      aria-modal="true"
      :aria-label="t('search.title', '全局搜索')"
      @keydown="onTrapKey"
    >
      <div class="so-panel">
        <div class="so-input-row">
          <svg class="so-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4" />
            <path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
          <input
            ref="inputEl"
            v-model="q"
            class="so-input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="so-listbox"
            :aria-activedescendant="activeRow ? `so-opt-${activeRow.idx}` : undefined"
            :aria-expanded="rows.length > 0"
            :placeholder="t('search.placeholderScope', '搜作品 / 模型 / 题目…')"
            :aria-label="t('search.title', '全局搜索')"
            autocomplete="off"
            spellcheck="false"
            @input="scheduleRun"
            @keydown="onInputKey"
          />
          <button class="so-close" type="button" :aria-label="t('common.close', '关闭')" :title="t('search.closeTip', '关闭（Esc）')" @click="closeSearch">✕</button>
        </div>

        <div id="so-listbox" class="so-body" aria-live="polite">
          <span class="so-sr" role="status">{{ rows.length ? t('search.resultCount', '{n} 条结果', { n: rows.length }) : '' }}</span>

          <!-- 加载：三域并行，单 spinner -->
          <div v-if="searching" class="loading-row"><span class="spinner"></span> {{ t('search.searching', '搜索中…') }}</div>

          <!-- 错误（三域全挂）：诚实报错 + 重试 -->
          <template v-else-if="allFailed">
            <div class="notice notice-error">{{ t('search.allFailed', '搜索请求失败——网络或服务暂时不可用') }}</div>
            <button class="btn btn-sm btn-outline" style="margin-top: 10px" type="button" @click="run">{{ t('search.retry', '重试') }}</button>
          </template>

          <!-- 结果：三域分组（组间 2px 实线分割，节奏靠线不靠盒） -->
          <template v-else-if="anyResult">
            <section v-if="groupDemos.length" class="so-group">
              <h3 class="so-kicker">
                {{ t('search.groupDemos', '作品') }}
                <span class="so-count mono">{{ demoTotal }}</span>
                <span v-if="failed.demos" class="so-count mono">{{ t('search.groupFailed', '该域查询失败') }}</span>
              </h3>
              <RouterLink
                v-for="r in groupDemos"
                :id="`so-opt-${r.idx}`"
                :key="r.key"
                class="so-item"
                :class="{ 'so-item--active': r.idx === activeIdx }"
                role="option"
                :aria-selected="r.idx === activeIdx"
                :to="r.path"
                @mouseenter="activeIdx = r.idx"
                @click="closeSearch()"
              >
                <span class="so-item-title">{{ r.title }}</span>
                <span class="so-item-meta">{{ r.meta }}</span>
              </RouterLink>
            </section>

            <section v-if="groupModels.length || failed.models" class="so-group">
              <h3 class="so-kicker">
                {{ t('search.groupModels', '模型') }}
                <span class="so-count mono">{{ modelTotal }}</span>
                <span v-if="failed.models" class="so-count mono">{{ t('search.groupFailed', '该域查询失败') }}</span>
              </h3>
              <RouterLink
                v-for="r in groupModels"
                :id="`so-opt-${r.idx}`"
                :key="r.key"
                class="so-item"
                :class="{ 'so-item--active': r.idx === activeIdx }"
                role="option"
                :aria-selected="r.idx === activeIdx"
                :to="r.path"
                @mouseenter="activeIdx = r.idx"
                @click="closeSearch()"
              >
                <span class="so-item-title">{{ r.title }}</span>
                <span class="so-item-meta">{{ r.meta }}</span>
              </RouterLink>
            </section>

            <section v-if="groupTasks.length || failed.tasks" class="so-group">
              <h3 class="so-kicker">
                {{ t('search.groupTasks', '题目') }}
                <span class="so-count mono">{{ taskTotal }}</span>
                <span v-if="failed.tasks" class="so-count mono">{{ t('search.groupFailed', '该域查询失败') }}</span>
              </h3>
              <RouterLink
                v-for="r in groupTasks"
                :id="`so-opt-${r.idx}`"
                :key="r.key"
                class="so-item"
                :class="{ 'so-item--active': r.idx === activeIdx }"
                role="option"
                :aria-selected="r.idx === activeIdx"
                :to="r.path"
                @mouseenter="activeIdx = r.idx"
                @click="closeSearch()"
              >
                <span class="so-item-title">{{ r.title }}</span>
                <span class="so-item-meta">{{ r.meta }}</span>
              </RouterLink>
            </section>
          </template>

          <!-- 空：诚实文案 + 出口（§12.1「搜不到」不装死） -->
          <div v-else-if="hasSearched && term" class="so-empty">
            <p class="so-empty-title">{{ t('search.empty', '没有与「{q}」匹配的结果', { q: term }) }}</p>
            <p class="so-empty-hint">{{ t('search.emptyHint', '换个更短的关键词，或从下面的出口继续。') }}</p>
            <div class="so-empty-actions">
              <RouterLink class="btn btn-sm btn-outline" :to="{ path: '/demos', query: { q: term } }">{{ t('search.allInDemos', '作品库搜「{q}」全部结果 →', { q: term }) }}</RouterLink>
              <RouterLink class="btn btn-sm btn-outline" :to="{ path: '/demos', query: { sort: 'random' } }">{{ t('demos.casual', '随便看看') }} →</RouterLink>
              <button class="btn btn-sm btn-outline" type="button" @click="clearQuery">{{ t('search.clear', '清空重搜') }}</button>
            </div>
          </div>

          <!-- 空闲：域直达（一次点击落地三个库） -->
          <div v-else class="so-idle">
            <p class="so-idle-hint">{{ t('search.idleHint', '输入关键词，一次搜作品 / 模型 / 题目（各取前 5）') }}</p>
            <RouterLink class="so-item" :to="'/demos'" @click="closeSearch()"><span class="so-item-title">{{ t('app.nav.demos', '作品库') }}</span><span class="so-item-go">→</span></RouterLink>
            <RouterLink class="so-item" :to="'/models'" @click="closeSearch()"><span class="so-item-title">{{ t('app.nav.models', '模型') }}</span><span class="so-item-go">→</span></RouterLink>
            <RouterLink class="so-item" :to="'/tasks'" @click="closeSearch()"><span class="so-item-title">{{ t('app.nav.tasks', '题目') }}</span><span class="so-item-go">→</span></RouterLink>
          </div>
        </div>

        <div class="so-foot">
          <RouterLink v-if="term" class="so-all" :to="{ path: '/demos', query: { q: term } }" @click="closeSearch()">
            {{ t('search.allInDemos', '作品库搜「{q}」全部结果 →', { q: term }) }}
          </RouterLink>
          <span v-else class="so-all so-all--muted">{{ t('search.footIdle', '支持 ⇅ 选中后 ↵ 直达') }}</span>
          <span class="so-hints">{{ t('search.hintKeys', '↑↓ 选择 · ↵ 打开 · Esc 关闭') }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ---- 覆盖层面（三律·全屏形态）：无边框纯色直落——覆盖层自身就是面，无容器边框；
      入场 0ms（落下回弹收缩到内容面板，避免整屏位移在视口底缘露出旧页撕裂带），关闭 0ms 对称 ---- */
.so {
  position: fixed;
  inset: 0;
  z-index: 1050; /* 压过 modal/drawer 1000，让 toast(1100) 仍在其上 */
  background: var(--paper, #fff);
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* ---- 内容面板：b-stamp-drop 350ms 落下回弹一次（token 零新增，05 §5.2 帧谱）---- */
.so-panel {
  width: min(860px, calc(100% - 32px));
  margin: clamp(40px, 12vh, 140px) auto 48px;
  animation: b-stamp-drop var(--b-dur-stage, 350ms) var(--b-ease-stamp, cubic-bezier(0.16, 1, 0.3, 1)) both;
}
@media (max-width: 720px) {
  .so-panel {
    width: calc(100% - 24px);
    margin-top: 24px;
    margin-bottom: 24px;
  }
}
.so-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 2px 12px;
  border-bottom: 2px solid var(--ink, #000);
}
.so-input-row:focus-within {
  border-bottom-color: var(--red, #ff6b6b); /* 焦点指示=底线换色 + 输入光标（12.4 硬指示的行内形态） */
}
.so-ico {
  flex: none;
  color: var(--ink, #000);
}
.so-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  font-family: var(--font-heading, sans-serif);
  font-size: 20px;
  font-weight: 800;
  color: var(--ink, #000);
  padding: 8px 0;
}
.so-input:focus {
  outline: none; /* 指示器交给行底线（focus-within 换色）——盒子轮廓在搜索条内是噪音 */
}
.so-input::placeholder {
  color: var(--ink-soft, #555);
  font-weight: 600;
}
.so-close {
  flex: none;
  width: 40px;
  height: 40px;
  border: 2px solid var(--ink, #000);
  background: var(--red, #ff6b6b);
  color: var(--on-accent, #000);
  font-weight: 900;
  font-size: 14px;
  cursor: pointer;
}
.so-close:hover {
  background: var(--paper, #fff);
  color: var(--ink, #000);
}

.so-body {
  padding: 16px 2px 4px;
  min-height: 120px;
}
/* ---- 组间 2px 实线分割（三律第 2 律）：分组节奏靠线不靠盒 ---- */
.so-group {
  padding: 12px 0 6px;
}
.so-group + .so-group {
  border-top: 2px solid var(--ink, #000);
}
.so-kicker {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 4px;
  font-family: var(--font-heading, sans-serif);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink, #000);
}
.so-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft, #555);
  font-variant-numeric: tabular-nums;
}
.so-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px; /* 触达底线 */
  padding: 6px 10px;
  margin: 0 -10px;
  text-decoration: none;
  color: var(--ink, #000);
}
.so-item-title {
  font-weight: 800;
  font-size: 14px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.so-item-meta {
  flex: none;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ink-soft, #555);
  font-variant-numeric: tabular-nums;
}
.so-item-go {
  font-weight: 900;
}
.so-item--active {
  background: var(--paper-deep, #f2eee6);
}
@media (hover: hover) {
  .so-item:hover {
    background: var(--paper-deep, #f2eee6);
  }
}
/* ---- 空态（诚实 + 出口） ---- */
.so-empty {
  padding: 20px 2px 8px;
}
.so-empty-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 900;
  color: var(--ink, #000);
}
.so-empty-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--ink-soft, #555);
}
.so-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
/* ---- 空闲：域直达 ---- */
.so-idle {
  padding: 4px 0 8px;
}
.so-idle-hint {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--ink-soft, #555);
}
/* ---- 页脚：兜底链 + 键位提示（触屏隐藏键位） ---- */
.so-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding: 12px 2px 0;
  border-top: 2px solid var(--ink, #000);
}
.so-all {
  font-weight: 800;
  font-size: 13px;
  color: var(--ink, #000);
  text-decoration: none;
}
.so-all:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.so-all--muted {
  color: var(--ink-soft, #555);
  font-weight: 600;
}
.so-hints {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ink-soft, #555);
}
@media (hover: none) {
  .so-hints {
    display: none;
  }
}
/* 屏读专用（结果数 aria-live） */
.so-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
/* reduced-motion：落下回弹退场（面板直接出现；底面本就 0ms） */
@media (prefers-reduced-motion: reduce) {
  .so-panel {
    animation: none;
  }
}
</style>
