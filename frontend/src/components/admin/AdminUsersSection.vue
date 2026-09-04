<script setup lang="ts">
defineOptions({ name: 'AdminUsersSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { AdminUser } from '../../api/types'
import PaginationBar from '../PaginationBar.vue'
import { useLocalPagination } from '../../composables/useLocalPagination'

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

// 客户端分页（M0-3，02 G 决策人点名项）：/admin/users 后端为全量返回，分页在过滤结果上切页（照 AdminDemosSection 模式）
const { page, total, pages, paged, setPage, pageSize } = useLocalPagination<AdminUser>(() => filtered.value, 8)

async function loadUsers() {
  try {
    users.value = await api.adminUsers()
  } catch {
    users.value = []
  }
}

/**
 * 权限级动作必须"说清目标态 → 二次确认 → 回执"：
 * 原实现一点就生效，而且按钮只写「切换角色」——不告诉管理员要切到哪，
 * 误点一次就把某人降权或把某人提成管理员。
 */
async function toggleUser(u: AdminUser, field: 'role' | 'status') {
  const toAdmin = u.role !== 'admin'
  const toSuspended = u.status === 'active'
  const title = field === 'role' ? (toAdmin ? '设为管理员？' : '取消管理员？') : toSuspended ? '停用该用户？' : '恢复该用户？'
  const message =
    field === 'role'
      ? toAdmin
        ? `${u.username} 将获得后台全部权限（含审核、删除、合并）。`
        : `${u.username} 将立刻失去后台权限${u.demo_count ? `；其 ${u.demo_count} 件作品不受影响` : ''}。`
      : toSuspended
        ? `${u.username} 将无法登录与上传${u.demo_count ? `；已发布的 ${u.demo_count} 件作品仍会保留` : ''}。`
        : `${u.username} 将恢复登录与上传。`
  const ok = await ui.confirm({
    title,
    message,
    confirmText: field === 'role' ? (toAdmin ? '设为管理员' : '取消管理员') : toSuspended ? '停用' : '恢复',
    danger: field === 'role' ? !toAdmin : toSuspended,
  })
  if (!ok) return
  try {
    if (field === 'role') {
      await api.updateUser(u.id, { role: toAdmin ? 'admin' : 'user' })
    } else {
      await api.updateUser(u.id, { status: toSuspended ? 'suspended' : 'active' })
    }
    ui.toast(`${u.username}：${field === 'role' ? (toAdmin ? '已设为管理员' : '已取消管理员') : toSuspended ? '已停用' : '已恢复'}`, 'success')
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
          <tr v-for="u in paged" :key="u.id">
            <td>{{ u.username }}</td>
            <td>{{ u.role }}</td>
            <td><span class="status-pill" :class="`status-${u.status}`">{{ u.status }}</span></td>
            <td>{{ u.demo_count }}</td>
            <td>
              <!-- 按钮写"目标态"而不是"切换"：管理员该在点之前就知道会发生什么 -->
              <button class="btn btn-sm btn-outline" type="button" @click="toggleUser(u, 'role')">{{ u.role === 'admin' ? '取消管理员' : '设为管理员' }}</button>
              <button class="btn btn-sm btn-dark" type="button" @click="toggleUser(u, 'status')">{{ u.status === 'active' ? '停用' : '启用' }}</button>
            </td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="5" style="text-align:center">没有匹配的用户</td></tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-if="pages > 1" :page="page" :total="total" :page-size="pageSize" @change="setPage" />
  </div>
</template>
