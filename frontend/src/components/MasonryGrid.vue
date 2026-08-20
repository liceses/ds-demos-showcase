<script setup lang="ts">
/**
 * JS Masonry 瀑布流（Pinterest 式）
 * - 按容器宽度计算列数，每张卡塞进「当前最短的列」
 * - 追加（无限滚动）时：已有卡片位置永不移动，新卡只进最短列 → 没有 CSS 多列的 rebalance 跳位
 * - 列表整体替换（搜索/筛选/刷新）时重建，配合稳定排序保证刷新后布局可复现
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    items: unknown[]
    /** 最小列宽（px），据此自适应列数 */
    minColWidth?: number
    /** 卡片间距（px） */
    gap?: number
    /** 唯一 key 提取函数（默认用数组下标） */
    itemKey?: (item: unknown, index: number) => string | number
  }>(),
  { minColWidth: 280, gap: 24, itemKey: (_: unknown, i: number) => i },
)

const root = ref<HTMLElement | null>(null)
const colCount = ref(1)
const columns = ref<number[][]>([])

/** 每项实测高度（按 itemKey 缓存，只影响后续追加，不回搬已放置卡片） */
const heights = new Map<string | number, number>()
const itemEls = new Map<number, HTMLElement>()
const ESTIMATE_H = 300
/** 首帧已用实测高度收敛过（只做一次，避免每帧重排） */
let initialSettled = false

function allMeasured(): boolean {
  if (!props.items.length) return false
  for (let i = 0; i < props.items.length; i++) {
    if (!heights.has(keyOf(props.items[i], i))) return false
  }
  return true
}

function trySettleInitial() {
  // 首帧：等所有卡片实测高度就绪后，按真实高度收敛重排一次
  // （此后的追加只进最短列，已有卡片永不移动）
  if (initialSettled || !allMeasured()) return
  initialSettled = true
  rebuild(props.items)
}

function keyOf(item: unknown, index: number) {
  return props.itemKey(item, index)
}

function colHeight(colIdx: number): number {
  let h = 0
  for (const idx of columns.value[colIdx]) {
    h += heights.get(keyOf(props.items[idx], idx)) ?? ESTIMATE_H
  }
  return h
}

function shortestCol(): number {
  let best = 0
  let bestH = Infinity
  for (let i = 0; i < colCount.value; i++) {
    const h = colHeight(i)
    if (h < bestH) {
      bestH = h
      best = i
    }
  }
  return best
}

function rebuild(items: unknown[]) {
  columns.value = Array.from({ length: colCount.value }, () => [])
  for (let i = 0; i < items.length; i++) {
    columns.value[shortestCol()].push(i)
  }
}

function appendTail(items: unknown[], start: number) {
  for (let i = start; i < items.length; i++) {
    columns.value[shortestCol()].push(i)
  }
}

watch(
  () => props.items,
  (items, prev) => {
    const firstKey = items.length ? keyOf(items[0], 0) : null
    const prevFirstKey = prev && prev.length ? keyOf(prev[0], 0) : null
    // 追加：首项不变且长度变长 → 只续排新增尾部；否则整体重建
    if (firstKey === prevFirstKey && items.length > (prev?.length ?? 0)) {
      appendTail(items, prev?.length ?? 0)
    } else {
      // 整体替换：重置首帧收敛标记，新列表就绪后重新收敛一次
      initialSettled = false
      rebuild(items)
      requestAnimationFrame(trySettleInitial)
    }
  },
  { immediate: true, deep: false },
)

function computeCols() {
  if (!root.value) return
  const w = root.value.clientWidth
  const n = Math.max(1, Math.floor((w + props.gap) / (props.minColWidth + props.gap)))
  if (n !== colCount.value) {
    colCount.value = n
    rebuild(props.items)
  }
}

let rootRO: ResizeObserver | null = null
let itemRO: ResizeObserver | null = null

function setItemRef(el: unknown, idx: number) {
  const dom = el as HTMLElement | null
  if (dom) {
    itemEls.set(idx, dom)
    itemRO?.observe(dom)
    heights.set(keyOf(props.items[idx], idx), dom.offsetHeight)
  } else {
    itemEls.delete(idx)
  }
}

onMounted(() => {
  computeCols()
  rootRO = new ResizeObserver(computeCols)
  if (root.value) rootRO.observe(root.value)
  itemRO = new ResizeObserver((entries) => {
    for (const en of entries) {
      const el = en.target as HTMLElement
      for (const [idx, dom] of itemEls) {
        if (dom === el) {
          heights.set(keyOf(props.items[idx], idx), el.offsetHeight)
          break
        }
      }
    }
    trySettleInitial()
  })
  for (const dom of itemEls.values()) itemRO.observe(dom)
  requestAnimationFrame(trySettleInitial)
})

onBeforeUnmount(() => {
  rootRO?.disconnect()
  itemRO?.disconnect()
  itemEls.clear()
})
</script>

<template>
  <div ref="root" class="masonry" :style="{ gap: gap + 'px' }">
    <div v-for="(col, ci) in columns" :key="ci" class="masonry-col" :style="{ gap: gap + 'px' }">
      <div
        v-for="idx in col"
        :key="keyOf(items[idx], idx)"
        class="masonry-item"
        :ref="(el) => setItemRef(el, idx)"
      >
        <slot :item="items[idx]" />
      </div>
    </div>
  </div>
</template>
