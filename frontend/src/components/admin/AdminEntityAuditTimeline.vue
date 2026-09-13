<script setup lang="ts">
// 实体检视器 ④ 区：审计时间线（RF-4c 从 AdminEntityDetailSection 拆出，纯展示）。
// 拆它的理由：这是五区里唯一**无写操作、无本地状态**的区域 —— 先动它验证拆分不改行为，
// 再处理带表单/请求的三区。
defineOptions({ name: 'AdminEntityAuditTimeline' })
import type { AuditEntry } from '../../api/types'
import { auditActionLabel, fmtTime } from '../../utils/adminLabels'
import { t } from '../../i18n'

defineProps<{ audit: AuditEntry[] }>()
</script>

<template>
  <section class="kc-zone">
    <h3 class="kc-zone-title">{{ t('admin.kc.zAudit', '④ 审计时间线') }}</h3>
    <div v-if="!audit.length" class="muted">{{ t('admin.kc.noAudit', '暂无该实体的审计记录') }}</div>
    <ul v-else class="kc-audit">
      <li v-for="a in audit" :key="a.id">
        <span class="mono kc-time">{{ fmtTime(a.created_at) }}</span>
        <span class="mono">{{ a.actor }}</span>
        <span class="kc-act">{{ auditActionLabel(a) }}</span>
        <span class="muted">{{ a.reason || `${a.entity_type}#${a.entity_id}` }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* 从 AdminEntityDetailSection 的 scoped 块平移过来：宿主是 scoped，子组件拿不到它的样式，
   而 .kc-* 在全局 CSS 里零定义（admin 纪律：样式留在组件内）。 */
.kc-zone {
  margin-bottom: 22px;
}
.kc-zone-title {
  font-size: var(--fs-14);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-bottom: var(--border-w, 4px) solid var(--ink, #000);
  padding-bottom: var(--sp-6);
  margin-bottom: var(--sp-12);
  flex: 1 1 auto;
}
.kc-audit {
  list-style: none;
  padding: 0;
  margin: 0;
}
.kc-audit li {
  display: flex;
  gap: var(--sp-10);
  flex-wrap: wrap;
  padding: var(--sp-6) 0;
  border-bottom: 2px solid var(--ink, #000);
  font-size: var(--fs-13);
  align-items: baseline;
}
</style>
