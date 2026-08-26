<script setup lang="ts">
defineOptions({ name: 'AdminUsersSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { AdminUser } from '../../api/types'

const ui = useUiStore()
const users = ref<AdminUser[]>([])
const query = ref('')
const roleFilter = ref<'all' | 'admin' | 'user'>('all')
const statusFilter = ref<'all' | 'active' | 'suspended'>('all')

const filtered = computed(() => {
  let items = users.value
  if (roleFilter.value !== 'all') items = items.filter((u) => u.role === roleFilter.value)
  if (statusFilter.value !== 'all') items = items.filter((u) => u.status === statusFilter.value)
  const q = query.value.trim().toLowerCase()
  if (q) items = items.filter((u) => u.username.toLowerCase().includes(q))
  return items
})

async function loadUsers() {
  try {
    users.value = await api.adminUsers()
  } catch {
    users.value = []
  }
}

async function toggleUser(u: AdminUser, field: 'role' | 'status') {
  try {
    if (field === 'role') {
      await api.updateUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })
    } else {
      await api.updateUser(u.id, { status: u.status === 'active' ? 'suspended' : 'active' })
    }
    await loadUsers()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

onMounted(loadUsers)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 14px; flex-wrap: wrap">
      <div class="search-box" style="flex: 1; max-width: 260px">
        <input v-model="query" class="input" type="search" placeholder="搜索用户名…" />
        <span class="search-icon">Q</span>
      </div>
      <div class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: roleFilter === 'all' }" type="button" @click="roleFilter = 'all'">全部角色</button>
        <button class="tab" :class="{ active: roleFilter === 'admin' }" type="button" @click="roleFilter = 'admin'">管理员</button>
        <button class="tab" :class="{ active: roleFilter === 'user' }" type="button" @click="roleFilter = 'user'">普通用户</button>
      </div>
      <div class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: statusFilter === 'all' }" type="button" @click="statusFilter = 'all'">全部状态</button>
        <button class="tab" :class="{ active: statusFilter === 'active' }" type="button" @click="statusFilter = 'active'">正常</button>
        <button class="tab" :class="{ active: statusFilter === 'suspended' }" type="button" @click="statusFilter = 'suspended'">停用</button>
      </div>
    </div>

    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>用户名</th><th>角色</th><th>状态</th><th>Demo 数</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.id">
            <td>{{ u.username }}</td>
            <td>{{ u.role }}</td>
            <td><span class="status-pill" :class="`status-${u.status}`">{{ u.status }}</span></td>
            <td>{{ u.demo_count }}</td>
            <td>
              <button class="btn btn-sm btn-outline" type="button" @click="toggleUser(u, 'role')">切换角色</button>
              <button class="btn btn-sm btn-dark" type="button" @click="toggleUser(u, 'status')">{{ u.status === 'active' ? '停用' : '启用' }}</button>
            </td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="5" style="text-align:center">没有匹配的用户</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
