<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { useUiStore } from '../stores/ui'
import type { RecognitionItem } from '../api/types'

const ui = useUiStore()
const items = ref<RecognitionItem[]>([])
const kind = ref<'sponsor' | 'thanks'>('sponsor')
const loading = ref(true)
const error = ref('')

const form = ref({
  kind: 'sponsor' as 'sponsor' | 'thanks',
  name: '',
  amount: null as number | null,
  message: '',
  show_amount: true,
  sort: 0,
})
const editing = ref<RecognitionItem | null>(null)

function sponsorList() {
  return items.value.filter((i) => i.kind === 'sponsor').sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
}
function thanksList() {
  return items.value.filter((i) => i.kind === 'thanks')
}

async function load() {
  loading.value = true
  try {
    items.value = (await api.listRecognition()).items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = { kind: kind.value, name: '', amount: null, message: '', show_amount: true, sort: 0 }
  editing.value = null
}

function startEdit(r: RecognitionItem) {
  editing.value = r
  form.value = {
    kind: r.kind,
    name: r.name,
    amount: r.amount ?? null,
    message: r.message || '',
    show_amount: r.show_amount,
    sort: r.sort,
  }
}

async function save() {
  if (!form.value.name.trim()) {
    ui.toast('名字必填', 'error')
    return
  }
  const payload = {
    kind: form.value.kind,
    name: form.value.name.trim(),
    amount: form.value.kind === 'sponsor' ? form.value.amount : null,
    message: form.value.message,
    show_amount: form.value.show_amount,
    sort: Number(form.value.sort) || 0,
  }
  try {
    if (editing.value) await api.updateRecognition(editing.value.id, payload)
    else await api.createRecognition(payload)
    ui.toast(editing.value ? '已更新' : '已添加', 'success')
    resetForm()
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function toggleActive(r: RecognitionItem) {
  try {
    await api.updateRecognition(r.id, {
      kind: r.kind,
      name: r.name,
      amount: r.amount,
      message: r.message || '',
      show_amount: r.show_amount,
      sort: r.sort,
      active: !r.active,
    })
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function remove(r: RecognitionItem) {
  const ok = await ui.confirm({ title: '删除', message: `确定删除「${r.name}」？`, confirmText: '删除', danger: true })
  if (!ok) return
  try {
    await api.deleteRecognition(r.id)
    ui.toast('已删除', 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

onMounted(load)
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">管理后台</span>
    <h1 class="huge">赞助 / 致谢榜</h1>
    <p class="sub">管理员添加赞助者与致谢名单，前台「关于本站」页展示。</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="error" class="notice notice-error">{{ error }}</div>

    <div class="card card-default" style="max-width: 520px; padding: 20px; margin-bottom: 20px">
      <h2 style="margin-bottom: 12px">{{ editing ? '编辑' : '添加' }}（{{ form.kind === 'sponsor' ? '赞助' : '致谢' }}）</h2>
      <div class="form-stack">
        <div class="filter-row" style="margin-bottom: 0">
          <select v-model="form.kind" class="input" style="max-width: 120px" @change="resetForm">
            <option value="sponsor">赞助</option>
            <option value="thanks">致谢</option>
          </select>
          <input v-model="form.name" class="input" placeholder="名字" maxlength="64" />
        </div>
        <template v-if="form.kind === 'sponsor'">
          <div class="filter-row" style="margin-bottom: 0">
            <input v-model.number="form.amount" class="input" type="number" min="0" placeholder="金额（元，可空）" style="max-width: 160px" />
            <label style="display: flex; align-items: center; gap: 6px">
              <input v-model="form.show_amount" type="checkbox" style="width: 18px; height: 18px" /> 公开金额
            </label>
          </div>
        </template>
        <input v-model="form.message" class="input" placeholder="一句话（备注 / 致谢语，可选）" maxlength="200" />
        <input v-model.number="form.sort" class="input" type="number" placeholder="排序（0 前置）" style="max-width: 160px" />
        <div class="filter-row" style="margin-bottom: 0">
          <button class="btn btn-primary" type="button" @click="save">{{ editing ? '保存' : '添加' }}</button>
          <button v-if="editing" class="btn btn-outline" type="button" @click="resetForm">取消</button>
        </div>
      </div>
    </div>

    <div class="filter-row" style="gap: 8px; margin-bottom: 8px">
      <button class="tab" :class="{ active: kind === 'sponsor' }" type="button" @click="kind = 'sponsor'; form.kind = 'sponsor'">赞助榜</button>
      <button class="tab" :class="{ active: kind === 'thanks' }" type="button" @click="kind = 'thanks'; form.kind = 'thanks'">致谢榜</button>
    </div>

    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载…</div>
    <div v-else class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>名字</th><th>金额</th><th>一句话</th><th>公开金额</th><th>排序</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in (kind === 'sponsor' ? sponsorList() : thanksList())" :key="r.id">
            <td>{{ r.name }}</td>
            <td>{{ r.kind === 'sponsor' ? (r.amount ?? '') : '-' }}</td>
            <td style="max-width: 220px; overflow-wrap: anywhere">{{ r.message }}</td>
            <td>{{ r.kind === 'sponsor' ? (r.show_amount ? '公开' : '隐藏') : '-' }}</td>
            <td>{{ r.sort }}</td>
            <td>{{ r.active ? '展示' : '隐藏' }}</td>
            <td>
              <button class="btn btn-sm btn-outline" type="button" @click="startEdit(r)">编辑</button>
              <button class="btn btn-sm btn-secondary" type="button" @click="toggleActive(r)">{{ r.active ? '下架' : '上架' }}</button>
              <button class="btn btn-sm btn-danger" type="button" @click="remove(r)">删除</button>
            </td>
          </tr>
          <tr v-if="!sponsorList().length && kind === 'sponsor'"><td colspan="7">暂无赞助</td></tr>
          <tr v-if="!thanksList().length && kind === 'thanks'"><td colspan="7">暂无致谢</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
