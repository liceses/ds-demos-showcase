<script setup lang="ts">
// 实体检视器 ⑤ 区：关联作品（RF-4c 从 AdminEntityDetailSection 拆出）。
//
// 挂摘两条真实通道（既有端点，无新表，拆分不改变任何一条）：
//   Task      → POST/DELETE /admin/tasks/{slug}/demos[/slug/{demo_slug}]
//   Model/Tag → PUT /demos/{slug} 改 tags（必须保留至少一个 model 标签）
//
// 本地状态（挂载选择、忙碌位）随组件生命周期；宿主用 `:key` 在实体切换时重挂，
// 从而不需要额外的 watch 去清空（原实现是在宿主的 watch 里 attachPicks.value = []）。
defineOptions({ name: 'AdminEntityWorksSection' })
import { ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import EntityPicker from '../picker/EntityPicker.vue'
import type { EntityPick } from '../picker/pickerSources'
import { tagsForWrite } from '../../utils/entityDeepLink'
import { t } from '../../i18n'

const props = defineProps<{
  type: 'model' | 'task' | 'tag'
  /** Task 走 attach/detach 端点需要 slug */
  taskSlug?: string | null
  /** Model/Tag 走 PUT /demos 改 tags 需要的 {key,value}（Tag 时由宿主给 tagKey+value） */
  tagKV?: { key: string; value: string } | null
  works: Array<{ slug: string; title: string; rating_avg?: number | null; status?: string; id?: number }>
}>()

/** 挂摘成功后通知宿主：重拉详情 + 通知更上层刷新列表（原 emit('saved') 语义） */
const emit = defineEmits<{ changed: [] }>()

const ui = useUiStore()
const attachPicks = ref<EntityPick[]>([])
const attachBusy = ref(false)

function kvOf(tags: { key: string; value: string }[]): { key: string; value: string }[] {
  return tags.map((x) => ({ key: x.key, value: x.value }))
}

async function rewriteDemoTags(
  slug: string,
  mutate: (tags: { key: string; value: string }[]) => { key: string; value: string }[],
) {
  const demo = await api.getDemo(slug)
  const next = mutate(kvOf(demo.tags || []))
  const write = tagsForWrite(next)
  if (!write.some((x) => x.startsWith('model:'))) {
    throw new Error(t('admin.kc.needModelTag', '作品必须保留至少一个 model 标签（不确定就用 model:unspecified）'))
  }
  await api.updateDemo(slug, { tags: write })
}

async function attachPicked() {
  const picks = attachPicks.value
  if (!picks.length || attachBusy.value) return
  attachBusy.value = true
  let okCount = 0
  let firstErr = ''
  try {
    for (const p of picks) {
      const s = (p.slug || (p.label || '').trim()) as string
      if (!s) continue
      try {
        if (props.type === 'task' && props.taskSlug) {
          await api.attachTaskDemoBySlug(props.taskSlug, s)
        } else {
          const kv = props.tagKV
          if (!kv) throw new Error(t('admin.kc.attachNoEntity', '当前实体无法挂载'))
          await rewriteDemoTags(s, (tags) => {
            if (tags.some((x) => x.key === kv.key && x.value === kv.value)) return tags
            return [...tags, kv]
          })
        }
        okCount++
      } catch (e) {
        if (!firstErr) firstErr = (e as Error).message
      }
    }
    if (okCount > 0) {
      ui.toast(t('admin.kc.attachedN', '已挂载 {n} 件（attach 审计）', { n: okCount }), 'success')
      attachPicks.value = []
      emit('changed')
    }
    if (firstErr) ui.toast(firstErr, 'error')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    attachBusy.value = false
  }
}

async function detachDemo(slug: string) {
  if (attachBusy.value) return
  const ok = await ui.confirm({
    title: t('admin.kc.detachTitle', '摘除作品？'),
    message:
      props.type === 'task'
        ? t('admin.kc.detachMsg', '《{slug}》将从本题的归属列表移除（detach 审计；可重新挂载）。', { slug })
        : t('admin.kc.detachTagMsg', '《{slug}》将去掉本实体标签（PUT /demos 改 tags；可重新挂载）。', { slug }),
    confirmText: t('admin.kc.detach', '摘除'),
  })
  if (!ok) return
  attachBusy.value = true
  try {
    if (props.type === 'task' && props.taskSlug) {
      await api.detachTaskDemoBySlug(props.taskSlug, slug)
    } else {
      const kv = props.tagKV
      if (!kv) throw new Error(t('admin.kc.detachNoEntity', '当前实体无法摘除'))
      await rewriteDemoTags(slug, (tags) => tags.filter((x) => !(x.key === kv.key && x.value === kv.value)))
    }
    ui.toast(t('admin.kc.detached', '已摘除（detach 审计）'), 'success')
    emit('changed')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    attachBusy.value = false
  }
}
</script>

<template>
  <section class="kc-zone">
    <h3 class="kc-zone-title">{{ t('admin.kc.zWorks', '⑤ 关联作品') }}</h3>
    <div class="kc-rel-row">
      <EntityPicker
        v-model="attachPicks"
        kind="demo"
        mode="dropdown"
        multiple
        manual-slug
        :placeholder="t('admin.kc.attachSlugPh2', '搜作品名 / 作者 / slug 选入，逐个可挂载…')"
      />
      <button type="button" class="btn btn-sm btn-outline" :disabled="attachBusy || !attachPicks.length" @click="attachPicked">
        {{ attachBusy ? t('admin.kc.attaching', '挂载中…') : t('admin.kc.attachAdd', '挂载选中') }}
      </button>
      <span class="hint">{{
        type === 'task'
          ? t('admin.kc.attachNote', '按 slug 逐个挂载（attach 审计，未知 slug 单项失败不影响其余）；点 ✕ 可摘除选中。')
          : t('admin.kc.attachTagNote', '挂摘走 PUT /demos/{slug} 改 tags（保留键由服务端重挂；必须留下至少一个 model 标签）。')
      }}</span>
    </div>
    <div v-if="!works.length" class="muted">{{ t('admin.kc.noWorks', '没有关联作品') }}</div>
    <ul v-else class="kc-works">
      <li v-for="d in works" :key="d.slug">
        <RouterLink :to="`/demo/${d.slug}`" class="kc-work-link">{{ d.title }}</RouterLink>
        <span class="muted mono">{{ d.slug }}</span>
        <span v-if="d.status && d.status !== 'approved'" class="cluster-badge cb-fuzzy">{{ d.status }}</span>
        <span v-if="d.rating_avg != null" class="mini-stat"><b>{{ d.rating_avg.toFixed(1) }}</b></span>
        <button type="button" class="btn btn-sm btn-outline" :disabled="attachBusy" @click="detachDemo(d.slug)">{{ t('admin.kc.detach', '摘除') }}</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* 同 ④：从宿主的 scoped 块平移（子组件继承不到宿主的 scoped 样式） */
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
.kc-rel-row {
  display: flex;
  gap: var(--sp-10);
  align-items: center;
  flex-wrap: wrap;
  padding: var(--sp-6) 0;
}
.kc-works {
  list-style: none;
  padding: 0;
  margin: 0;
}
.kc-works li {
  display: flex;
  gap: var(--sp-10);
  align-items: baseline;
  padding: var(--sp-6) 0;
  border-bottom: 2px solid var(--ink, #000);
}
.kc-work-link {
  color: var(--ink, #000);
  font-weight: 700;
  text-decoration: none;
}
@media (hover: hover) {
  .kc-work-link:hover {
    text-decoration: underline;
  }
}
</style>
