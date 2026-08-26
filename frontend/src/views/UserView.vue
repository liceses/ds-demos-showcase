<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { parseDate } from '../utils/time'
import type { DemoSummary, User } from '../api/types'
import { useAuthStore } from '../stores/auth'
import DemoCard from '../components/DemoCard.vue'

const props = defineProps<{ username: string }>()
const auth = useAuthStore()

const user = ref<(User & { demo_count: number }) | null>(null)
const demos = ref<DemoSummary[]>([])
const loading = ref(true)
const error = ref('')

const isSelf = computed(() => !!auth.user && auth.user.username === props.username)

onMounted(async () => {
  try {
    user.value = await api.getUser(props.username)
    const res = await api.listDemos({ status: 'approved', tags: [`author:${props.username}`], page_size: 50 })
    demos.value = res.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section v-if="loading" class="loading-row"><span class="spinner"></span> 加载用户…</section>
  <section v-else-if="error" class="empty-box">{{ error }}</section>

  <template v-else-if="user">
    <section class="page-hero">
      <span class="eyebrow">用户主页</span>
      <h1 class="huge">{{ user.username }}</h1>
      <p class="sub">{{ user.bio || '这个人很懒，还没有写简介。' }}</p>
      <div class="filter-row" style="margin-top: 16px">
        <span class="mini-stat"><b>{{ user.demo_count }}</b> Demo</span>
        <span class="mini-stat"><b>{{ user.role }}</b> 角色</span>
        <span class="mini-stat"><b>{{ parseDate(user.created_at).toLocaleDateString('zh-CN') }}</b> 加入</span>
        <RouterLink v-if="isSelf" class="btn btn-sm btn-primary" to="/settings">账户设置</RouterLink>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">TA 的 Demo</h2>
      </div>
      <div v-if="!demos.length" class="empty-box">还没有发布 Demo</div>
      <div v-else class="waterfall">
        <div v-for="d in demos" :key="d.slug" class="waterfall-item">
          <DemoCard :demo="d" />
        </div>
      </div>
    </section>
  </template>
</template>