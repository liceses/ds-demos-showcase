<script setup lang="ts">
// M1-C 404 增强（03 §12.3 死胡同纪律）：相似 slug 猜测 + 四入口卡。
// 猜测=客户端编辑距离（Levenshtein）：用路径末段 LIKE 搜索作品候选，再按编辑距离过滤排序；
// 无候选（搜索失败/零命中/阈值不达）→ 只给站点地图，不留死胡同也不瞎猜。
defineOptions({ name: 'NotFoundView' })
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import type { DemoSummary } from '../api/types'
import { t } from '../i18n'

const route = useRoute()

// 四入口（03 §13 路由归宿：逛/看/榜/社区——标签词表走探索页尾部，不再占 404 位）
const entries = [
  { to: '/demos', key: 'demos', zh: '作品库' },
  { to: '/tags', key: 'explore', zh: '探索' },
  { to: '/leaderboard', key: 'leaderboard', zh: '排行榜' },
  { to: '/forum', key: 'forum', zh: '论坛' },
]

const guesses = ref<DemoSummary[]>([])

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

onMounted(async () => {
  // 末段当 slug 候选（/demo/foo-bar → foo-bar）；过短（<4）的段猜不出有意义的东西
  const seg = route.path.split('/').filter(Boolean).pop() ?? ''
  if (seg.length < 4) return
  const s = seg.toLowerCase()
  const maxDist = Math.max(2, Math.round(s.length * 0.34))
  const rank = (items: DemoSummary[]) =>
    items
      .map((d) => {
        const slugFull = d.slug.toLowerCase() // t28 验收修复：用户输错的是 URL 末段（无前缀），slug 常带 demo-/pvz- 首段——对全串比距离恒差前缀长度、永不过阈；取全串/去首段双路最小
        const slugTail = slugFull.includes('-') ? slugFull.split('-').slice(1).join('-') : slugFull
        return {
          demo: d,
          dist: Math.min(levenshtein(s, slugFull), levenshtein(s, slugTail), levenshtein(s, d.title.toLowerCase())),
        }
      })
      .filter((x) => x.dist <= maxDist)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3)
      .map((x) => x.demo)
  // 两路候选并集：①q 搜（LIKE 覆盖标题/描述/标签——标题打错的情形）
  // ②近 100 件全扫（后端 q 不搜 slug——slug 打错只能靠近距离匹配；更早的作品
  //    覆盖不到，后端加 slug 索引是 P2 项，前端不装全知）
  try {
    const [qHit, sweep] = await Promise.all([
      api.listDemos({ q: seg, status: 'approved', page_size: 10 }).catch(() => ({ items: [] as DemoSummary[] })),
      api.listDemos({ status: 'approved', page_size: 100, sort: 'newest' }).catch(() => ({ items: [] as DemoSummary[] })),
    ])
    const seen = new Set<string>()
    const merged: DemoSummary[] = []
    for (const d of [...rank(qHit.items), ...rank(sweep.items)]) {
      if (seen.has(d.slug)) continue
      seen.add(d.slug)
      merged.push(d)
    }
    guesses.value = merged.slice(0, 3)
  } catch {
    /* 猜测是增值能力：失败静默，站点地图仍在 */
  }
})
</script>

<template>
  <div class="route-page">  <section class="empty-box nf">
    <h1 class="huge">404</h1>
    <p class="sub" style="margin: 12px auto 20px; max-width: 360px">{{ t('notFound.sub', '页面不存在，可能已被移动或删除。') }}</p>
    <RouterLink class="btn btn-primary" to="/">{{ t('notFound.back', '返回首页') }}</RouterLink>

    <!-- 相似 slug 猜测：命中才出现（零命中不渲染，站点地图不背锅） -->
    <div v-if="guesses.length" class="nf-guess">
      <p class="nf-label">{{ t('notFound.guessTitle', '你是不是要找：') }}</p>
      <RouterLink v-for="g in guesses" :key="g.slug" class="nf-guess-link" :to="`/demo/${g.slug}`">
        <span class="nf-guess-title">{{ g.title }}</span>
        <code class="nf-guess-slug">{{ g.slug }}</code>
      </RouterLink>
    </div>

    <!-- 四入口卡（站点地图）：作品库/探索/排行榜/论坛 -->
    <div class="nf-map">
      <p class="nf-label">{{ t('notFound.mapTitle', '站点地图') }}</p>
      <div class="nf-grid">
        <RouterLink v-for="e in entries" :key="e.to" class="nf-card" :to="e.to">
          <b>{{ t('app.nav.' + e.key, e.zh) }}</b>
          <span class="nf-card-arrow" aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </div>
  </section>
  </div>
</template>

<style scoped>
/* M1-C：styles/ 冻结令——新样式全 scoped，令牌 var() 引全局既有值带字面回落 */
.nf {
  margin-top: 60px;
  padding: 40px 16px 44px;
}
.nf-label {
  font-family: var(--font-mono, var(--font-body, monospace));
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft, #555);
  margin: 0 0 10px;
}

/* 相似猜测：三行候选，标题+slug 码 */
.nf-guess {
  margin-top: 30px;
  display: grid;
  gap: 8px;
  justify-items: center;
}
.nf-guess-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 2px solid var(--ink, #000);
  background: var(--paper, #fff);
  color: var(--ink, #000);
  text-decoration: none;
  font-weight: 800;
  font-size: 13px;
}
.nf-guess-slug {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ink-soft, #555);
}
@media (hover: hover) {
  .nf-guess-link:hover {
    background: var(--yellow, #ffd93d);
  }
}
.nf-guess-link:active {
  transform: translate(2px, 2px);
  transition-duration: 0ms;
}

/* 站点地图：四入口卡（移动 2×2，桌面 4 列） */
.nf-map {
  margin-top: 26px;
  max-width: 640px;
  margin-left: auto;
  margin-right: auto;
}
.nf-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (min-width: 720.02px) {
  .nf-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
.nf-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 56px; /* 触达底线富余 */
  padding: 10px 12px;
  border: var(--border-w, 4px) solid var(--ink, #000);
  background: var(--paper, #fff);
  color: var(--ink, #000);
  text-decoration: none;
  font-family: var(--font-heading, sans-serif);
  font-weight: 900;
  font-size: 13px;
  box-shadow: 4px 4px 0 0 var(--ink, #000);
  transition: transform var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1)),
    box-shadow var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1));
}
@media (hover: hover) {
  .nf-card:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 0 var(--ink, #000);
  }
}
.nf-card:active {
  transform: translate(4px, 4px);
  box-shadow: none;
  transition-duration: 0ms;
}
.nf-card-arrow {
  font-family: var(--font-body, monospace);
  font-weight: 900;
}
@media (prefers-reduced-motion: reduce) {
  .nf-card,
  .nf-guess-link {
    transition: none;
  }
  .nf-card:hover {
    transform: none;
  }
}
</style>
