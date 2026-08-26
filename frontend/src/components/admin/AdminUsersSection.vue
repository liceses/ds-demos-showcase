<script setup lang="ts">
defineOptions({ name: 'AdminUsersSection' })
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { AdminUser } from '../../api/types'

const ui = useUiStore()
const users = ref<AdminUser[]>([])

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
  <div class="table-wrap">
    <table class="data">
      <thead>
        <tr><th>用户名</th><th>角色</th><th>状态</th><th>Demo 数</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.username }}</td>
          <td>{{ u.role }}</td>
          <td><span class="status-pill" :class="`status-${u.status}`">{{ u.status }}</span></td>
          <td>{{ u.demo_count }}</td>
          <td>
            <button class="btn btn-sm btn-outline" type="button" @click="toggleUser(u, 'role')">切换角色</button>
            <button class="btn btn-sm btn-dark" type="button" @click="toggleUser(u, 'status')">{{ u.status === 'active' ? '停用' : '启用' }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
