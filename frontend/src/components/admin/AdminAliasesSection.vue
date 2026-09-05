<script setup lang="ts">
// 别名中心（B4）：一个型号的多种写法，必须收在一处看得见。
// 别名是「匹配层」的唯一入口：历史标签值不会因为改名而失效（旧名转别名继续命中）。
defineOptions({ name: 'AdminAliasesSection' })
import { computed, ref, watch } from 'vue'
import { api } from '../../api'
import type { ModelDetail } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import EntityPicker from '../picker/EntityPicker.vue'
import type { EntityPick } from '../picker/pickerSources'
import EmptyBox from '../EmptyBox.vue'
import { modelDisplay } from '../../utils/modelDisplay'
import { t } from '../../i18n'

const ui = useUiStore()

const picked = ref<{ id: number | null; label: string; slug?: string | null } | null>(null)
const detail = ref<ModelDetail | null>(null)
const loading = ref(false)
const error = ref('')
const newAlias = ref('')
const adding = ref(false)

const RES_LABEL: Record<string, string> = {
  exact: '精确型号',
  family: '知厂商不知型号',
  unknown: '完全未标注',
  guess: '灰测未证实',
}
const resolutionLabel = computed(() => (detail.value ? RES_LABEL[detail.value.resolution || 'exact'] : ''))

async function loadDetail(slug: string) {
  loading.value = true
  error.value = ''
  try {
    detail.value = await api.getModel(slug)
  } catch (e) {
    error.value = (e as Error).message
    detail.value = null
  } finally {
    loading.value = false
  }
}

// EntityPicker 只回 id/label，这里按 slug 取详情（详情接口以 slug 为键）
const pickedSlug = ref('')
watch(pickedSlug, (s) => {
  if (s) void loadDetail(s)
})

async function pick(p: EntityPick) {
  // T5·M5-F2 基座富化：pick 直带 slug，无需再全量翻 200 行反查（旧 page_size=200 截断问题根治）
  picked.value = { id: p.id ?? null, label: p.label, slug: p.slug ?? null }
  if (p.slug) {
    pickedSlug.value = p.slug
    return
  }
  // 兜底：老数据源没给 slug 时才走列表反查
  const r = await api.adminListModels({ page_size: 200 })
  const row = r.items.find((x) => x.id === p.id)
  if (!row) {
    error.value = t('admin.alias.notFound', '没找到该实体，请刷新')
    return
  }
  pickedSlug.value = row.slug
}

async function addAlias() {
  const v = newAlias.value.trim()
  if (!v || !picked.value) return
  adding.value = true
  try {
    await api.addModelAlias(String(picked.value.id), v)
    ui.toast(t('admin.alias.added', '已登记别名 {v}', { v }), 'success')
    newAlias.value = ''
    await loadDetail(pickedSlug.value)
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    adding.value = false
  }
}

// 改 slug：旧值自动转别名（历史标签与旧链接仍可解析），但对外链接会变 —— 所以必须二次确认
const slugDraft = ref('')
const savingSlug = ref(false)

async function saveSlug() {
  const v = slugDraft.value.trim()
  if (!v || !picked.value || !detail.value) return
  if (v === detail.value.slug) {
    slugDraft.value = ''
    return
  }
  const ok = await ui.confirm({
    title: t('admin.alias.confirmSlug', '改这个实体的 slug？'),
    message: t('admin.alias.slugWarn', '旧 slug「{o}」会变成别名（旧链接与历史标签仍可解析），但今后对外分享要用新链接：{n}。', { o: detail.value.slug, n: v }),
    confirmText: t('admin.alias.doSlug', '修改'),
  })
  if (!ok) return
  savingSlug.value = true
  try {
    await api.updateModel(String(picked.value.id), { slug: v })
    ui.toast(t('admin.alias.slugDone', 'slug 已改为 {v}', { v }), 'success')
    slugDraft.value = ''
    pickedSlug.value = v
    await loadDetail(v)
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    savingSlug.value = false
  }
}

async function removeAlias(alias: string) {
  if (!picked.value) return
  const ok = await ui.confirm({
    title: t('admin.alias.confirmRemove', '移除这个别名？'),
    message: t('admin.alias.removeWarn', '移除后，历史里用「{v}」写的标签将不再自动指向本实体（可能改判到同键的另一个实体）。', { v: alias }),
    confirmText: t('admin.alias.doRemove', '移除'),
  })
  if (!ok) return
  try {
    await api.removeModelAlias(String(picked.value.id), alias)
    ui.toast(t('admin.alias.removed', '已移除'), 'success')
    await loadDetail(pickedSlug.value)
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}
</script>

<template>
  <div>
    <p class="filter-label" style="margin-bottom: 10px">
      {{ t('admin.alias.hint', '上传写 dsv4-flash、dsv4flash、DSV4 Flash 都该落到同一个实体 —— 靠的就是这里登记的别名表。') }}
    </p>

    <div class="merge-cols">
      <div class="card card-default merge-col">
        <h3 class="archive-title">{{ t('admin.alias.pickModel', '选一个模型实体') }}</h3>
        <EntityPicker kind="model" mode="inline" :selected-id="picked?.id" :placeholder="t('admin.alias.ph', '搜型号名…')" @pick="pick" />
      </div>

      <div class="card card-default merge-col">
        <h3 class="archive-title">{{ t('admin.alias.current', '当前实体与别名') }}</h3>
        <div v-if="error && !detail" class="notice notice-error">{{ error }}</div>
        <EmptyBox v-else-if="!detail" :text="t('admin.alias.nonePicked', '左侧选一个实体')" />
        <template v-else>
          <div class="alias-head">
            <b class="alias-name">{{ modelDisplay(detail) }}</b>
            <code class="mono muted">{{ detail.slug }}</code>
            <span class="cluster-badge cb-exact">{{ resolutionLabel }}</span>
            <span class="mini-stat"><b>{{ detail.demo_count }}</b> {{ t('admin.alias.works', '件作品') }}</span>
          </div>
          <p v-if="detail.vendor" class="muted" style="margin: 6px 0">{{ t('admin.alias.vendor', '厂商') }}：{{ detail.vendor }}</p>

          <div class="filter-row" style="margin: 10px 0 0">
            <input
              v-model="newAlias"
              class="input"
              :placeholder="t('admin.alias.addPh', '新增写法，如 DSV4-Flash')"
              maxlength="128"
              style="max-width: 230px"
              @keyup.enter="addAlias"
            />
            <button class="btn btn-sm btn-primary" type="button" :disabled="adding || !newAlias.trim()" @click="addAlias">
              {{ adding ? t('admin.alias.adding', '登记中…') : t('admin.alias.addBtn', '登记别名') }}
            </button>
          </div>

          <!-- 改 slug：旧值转别名，但对外链接会变 -->
          <div class="filter-row" style="margin: 8px 0 0">
            <input
              v-model="slugDraft"
              class="input mono"
              :placeholder="t('admin.alias.slugPh', '新 slug（ASCII，如 dsv4-flash）')"
              maxlength="100"
              style="max-width: 230px"
              @keyup.enter="saveSlug"
            />
            <button class="btn btn-sm btn-outline" type="button" :disabled="savingSlug || !slugDraft.trim() || slugDraft.trim() === detail.slug" @click="saveSlug">
              {{ savingSlug ? t('admin.alias.slugSaving', '改中…') : t('admin.alias.slugBtn', '改 slug') }}
            </button>
          </div>

          <div class="alias-list">
            <div v-for="a in detail.aliases" :key="a" class="alias-row">
              <code class="mono">{{ a }}</code>
              <button class="btn btn-sm btn-dark" type="button" @click="removeAlias(a)">{{ t('admin.alias.removeBtn', '移除') }}</button>
            </div>
            <p v-if="!detail.aliases?.length" class="muted" style="margin: 8px 0 0">
              {{ t('admin.alias.noAlias', '还没有额外写法。历史标签名与当前名一致时不需要别名；一旦改名，旧名会自动进这里。') }}
            </p>
          </div>

          <div v-if="detail.tasks?.length" style="margin-top: 12px">
            <span class="kpi-label">{{ t('admin.alias.sharedTasks', '该型号参与的题目') }}</span>
            <div class="filter-row" style="margin-top: 6px">
              <RouterLink v-for="tk in detail.tasks" :key="tk.slug" class="tag-chip mode-open" :to="`/tasks/${tk.slug}`">
                {{ tk.title }}<span class="count">{{ tk.demo_count }}</span>
              </RouterLink>
            </div>
          </div>
          <RouterLink class="btn btn-sm btn-outline" style="margin-top: 12px" :to="`/models/${detail.slug}`">
            {{ t('admin.alias.openPage', '看模型页 →') }}
          </RouterLink>
        </template>
      </div>
    </div>
  </div>
</template>
