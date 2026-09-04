<script setup lang="ts">
import { computed } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { parseDate, currentLocale } from '../utils/time'
import { annLabel } from '../utils/announcement'
import type { Announcement } from '../api/types'
import { t } from '../i18n'

/**
 * M1-D（t33·05 §5.2）：双形态公告弹层。
 * - detail（既有契约不动）：单条详情——AnnouncementBlock 卡片点击直达（:ann）。
 * - list（新增）：横幅直驱的「全部公告」两组列表（:list）——置顶组 + 公告组（T30 裁决：
 *   「一条横幅+一个弹层」，弹层=全部公告两组列表；打开即全读由调用方 markRead 承担）。
 * 容器三律（05 §5.2）：无边框（scoped 覆写全局 markdown.css 的 4px 边框盒——styles/ 冻结令
 * 不动全局）+ 外部投影一刀 + b-stamp-drop 350ms 入场；关闭 0ms 硬切对称；reduced-motion 退场。
 */
const props = defineProps<{ ann?: Announcement | null; list?: Announcement[] | null; open?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const pinnedList = computed(() => (props.list ?? []).filter((a) => a.pinned))
const generalList = computed(() => (props.list ?? []).filter((a) => !a.pinned))
</script>

<template>
  <Teleport to="body">
    <!-- 详情形态（既有）：单条公告 -->
    <div v-if="ann" class="ann-modal">
      <div class="ann-modal-mask" @click="emit('close')"></div>
      <div class="ann-modal-panel ann-modal-panel--drop">
        <div class="ann-modal-head">
          <div>
            <div class="filter-row" style="margin: 0 0 6px">
              <span v-if="ann.pinned" class="ann-pin">{{ t('ann.pinBadge', '置顶') }}</span>
              <span v-if="ann.category" class="ann-cat">{{ ann.category }}</span>
            </div>
            <h2 style="margin: 0">{{ ann.title }}</h2>
          </div>
          <button class="btn btn-sm btn-dark" type="button" @click="emit('close')">{{ t('ann.close', '关闭') }}</button>
        </div>
        <MarkdownRenderer :content="ann.content" />
        <div class="filter-row" style="margin-top: 14px">
          <RouterLink v-if="ann.topic_id" class="btn btn-sm btn-outline" :to="`/forum/topic/${ann.topic_id}`">{{ t('ann.discuss', '去讨论 →') }}</RouterLink>
          <span class="muted" style="font-size: 12px">{{ parseDate(ann.created_at).toLocaleString(currentLocale()) }}</span>
        </div>
      </div>
    </div>

    <!-- 列表形态（t33）：全部公告两组列表，条目原生 details 手风琴；open 门控（否则 list 恒真=常开泄漏） -->
    <div v-else-if="open && list?.length" class="ann-modal">
      <div class="ann-modal-mask" @click="emit('close')"></div>
      <div class="ann-modal-panel ann-modal-panel--drop">
        <div class="ann-modal-head">
          <h2 class="ann-list-title">{{ t('ann.allTitle', '全部公告') }}</h2>
          <button class="btn btn-sm btn-dark" type="button" @click="emit('close')">{{ t('ann.close', '关闭') }}</button>
        </div>

        <section v-if="pinnedList.length" class="ann-list-group">
          <h3 class="ann-group-head">{{ t('ann.pinnedGroup', '置顶') }}</h3>
          <details v-for="a in pinnedList" :key="a.id" class="ann-list-item">
            <summary>
              <span class="ann-item-title">{{ a.title }}</span>
              <span class="ann-item-meta">
                <span class="ann-pin">{{ t('ann.pinBadge', '置顶') }}</span>
                <span class="mono">{{ annLabel(a.type) }}</span>
                <span class="ann-item-date">{{ parseDate(a.created_at).toLocaleDateString(currentLocale()) }}</span>
              </span>
            </summary>
            <div class="ann-item-body">
              <MarkdownRenderer :content="a.content" />
              <div class="filter-row" style="margin: 10px 0 0">
                <RouterLink v-if="a.topic_id" class="btn btn-sm btn-outline" :to="`/forum/topic/${a.topic_id}`">{{ t('ann.discuss', '去讨论 →') }}</RouterLink>
                <RouterLink v-else-if="a.demo_slug" class="btn btn-sm btn-outline" :to="`/demo/${a.demo_slug}`">{{ t('ann.viewDemo', '看这件作品 →') }}</RouterLink>
              </div>
            </div>
          </details>
        </section>

        <section v-if="generalList.length" class="ann-list-group">
          <h3 class="ann-group-head">{{ t('ann.generalGroup', '公告') }}</h3>
          <details v-for="a in generalList" :key="a.id" class="ann-list-item">
            <summary>
              <span class="ann-item-title">{{ a.title }}</span>
              <span class="ann-item-meta">
                <span class="mono">{{ annLabel(a.type) }}</span>
                <span class="ann-item-date">{{ parseDate(a.created_at).toLocaleDateString(currentLocale()) }}</span>
              </span>
            </summary>
            <div class="ann-item-body">
              <MarkdownRenderer :content="a.content" />
              <div class="filter-row" style="margin: 10px 0 0">
                <RouterLink v-if="a.topic_id" class="btn btn-sm btn-outline" :to="`/forum/topic/${a.topic_id}`">{{ t('ann.discuss', '去讨论 →') }}</RouterLink>
                <RouterLink v-else-if="a.demo_slug" class="btn btn-sm btn-outline" :to="`/demo/${a.demo_slug}`">{{ t('ann.viewDemo', '看这件作品 →') }}</RouterLink>
              </div>
            </div>
          </details>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 三律落弹层（05 §5.2）：scoped 覆写全局 .ann-modal-panel 的 4px 边框盒（特异度 0,2,0 > 0,1,0）——
   无边框 + 外部投影一刀 + b-stamp-drop 350ms 落下回弹一次；关闭 0ms 对称（v-if 卸载即消失） */
.ann-modal-panel--drop {
  border: none;
  box-shadow: var(--shadow-black, 6px 0 0 var(--ink, #000));
  animation: b-stamp-drop var(--b-dur-stage, 350ms) var(--b-ease-stamp, cubic-bezier(0.16, 1, 0.3, 1)) both;
}
@media (prefers-reduced-motion: reduce) {
  .ann-modal-panel--drop {
    animation: none;
  }
}

/* 列表形态：三律 2 实线分割——组头 11px 大写字距小标题，条目间 2px 实线，节奏靠线不靠盒 */
.ann-list-title {
  font-family: var(--font-heading, sans-serif);
  font-weight: 900;
  font-size: 17px;
  margin: 0;
}
.ann-list-group + .ann-list-group {
  margin-top: 20px;
}
.ann-group-head {
  font-family: var(--font-body, monospace);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink, #000);
  margin: 0 0 4px;
}
.ann-list-item {
  border-top: 2px solid var(--ink, #000);
}
.ann-list-group .ann-list-item:first-of-type {
  border-top: none;
}
.ann-list-item summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px; /* 触达底线 */
  padding: 8px 2px;
  cursor: pointer;
  list-style: none;
}
.ann-list-item summary::-webkit-details-marker {
  display: none;
}
.ann-list-item summary::before {
  content: '▸';
  font-weight: 900;
  transition: transform var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1));
}
.ann-list-item[open] summary::before {
  transform: rotate(90deg);
}
@media (hover: hover) {
  .ann-list-item summary:hover {
    background: var(--paper-deep, #f2eee6);
  }
}
.ann-item-title {
  font-weight: 800;
  font-size: 14px;
  color: var(--ink, #000);
  min-width: 0;
  overflow-wrap: anywhere;
}
.ann-item-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  font-size: 11px;
  color: var(--ink-soft, #555);
}
.ann-item-date {
  font-variant-numeric: tabular-nums;
}
.ann-item-body {
  padding: 2px 2px 12px 18px;
}
@media (prefers-reduced-motion: reduce) {
  .ann-list-item summary::before {
    transition: none;
  }
}
</style>
