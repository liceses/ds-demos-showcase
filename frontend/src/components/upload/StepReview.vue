<!-- T15 拆分件（04 §5.4）：StepReview —— 核对并提交面板（自 UploadView.vue 逐字迁出，行为不变） -->
<script setup lang="ts">
import { t } from '../../i18n'

interface ReviewRow {
  label: string
  value: string
  note?: string
  mono?: boolean
  step: number
}

defineProps<{
  reviewRows: ReviewRow[]
  error: string
  dupSlug: string | null
  success: { slug: string; status: string; created?: boolean } | null
  challenge: { slug: string; title: string; description?: string; demos_total?: number } | null
  challengeOff: boolean
  editSlug: string
  submitting: boolean
  uploadProgress: number
}>()
const emit = defineEmits<{ go: [step: number]; reset: [] }>()
</script>

<template>
  <div class="uw-panel uw-review">
    <h2 class="section-title" style="margin-top: 0">{{ t('upload.s4Legend', '核对一遍再发布') }}</h2>
    <!-- 每行统一：标签 / 值 / 右对齐「改」—— 原先只有 3 行有按钮且挤成第三列，位置确实难看 -->
    <dl class="uw-sum">
      <div v-for="r in reviewRows" :key="r.label" class="uw-sum-row" :class="{ empty: r.value === '—' }">
        <dt>{{ r.label }}</dt>
        <dd :class="{ 'uw-sum-mono': r.mono }">{{ r.value }}<span v-if="r.note" class="muted"> · {{ r.note }}</span></dd>
        <dd><button type="button" class="uw-edit" @click="emit('go', r.step)">{{ t('upload.fix', '改') }}</button></dd>
      </div>
    </dl>
    <p class="hint">{{ t('upload.s4Foot', '发布后进入审核队列（登录作者可直接上架）；标签和提示词随时可再编辑。') }}</p>

    <div v-if="error" class="notice notice-error">
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
        <span>{{ error }}</span>
        <RouterLink v-if="dupSlug" class="btn btn-sm btn-outline" :to="`/demo/${dupSlug}`">{{ t('upload.viewDup', '查看已有 Demo →') }}</RouterLink>
      </div>
    </div>
    <div v-if="success" class="notice notice-success">
      <p style="margin-bottom: 10px">
        {{ editSlug ? t('upload.updated', '更新成功，已生成更新公告。') : success.status === 'pending' ? t('upload.pending', '已提交，等待管理员审核。') : t('upload.uploaded', '上传成功。') }}
      </p>
      <p v-if="challenge && !challengeOff && !editSlug" class="hint" style="margin: 0 0 10px">
        {{ t('upload.challengeQueued', '挑战已提交：挂题请求待管理员确认，通过后即出现在同题对比中。') }}
        <RouterLink :to="`/tasks/${challenge.slug}`">{{ t('upload.viewTask', '查看题目 →') }}</RouterLink>
      </p>
      <div class="filter-row" style="margin: 0">
        <template v-if="success.status !== 'pending'">
          <RouterLink class="btn btn-sm btn-primary" :to="`/demo/${success.status === 'updated' ? editSlug : success.slug}`">{{ t('upload.viewDemo', '查看 Demo') }}</RouterLink>
        </template>
        <span v-else class="hint">{{ t('upload.pendingHint', '审核通过后即可展示') }}</span>
        <RouterLink class="btn btn-sm btn-outline" to="/">{{ t('upload.backHome', '返回主页') }}</RouterLink>
        <RouterLink class="btn btn-sm btn-outline" to="/models">{{ t('upload.gotoModels', '看看模型页 →') }}</RouterLink>
        <button v-if="!editSlug" type="button" class="btn btn-sm btn-secondary" @click="emit('reset')">＋ {{ t('upload.anotherOne', '再传一个') }}</button>
      </div>
    </div>
    <div v-if="submitting" class="upload-progress">
      <div class="progress-track"><div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div></div>
      <span class="hint">{{ uploadProgress >= 100 ? t('upload.processing', '已上传，服务器处理中（解压 / 传 OSS）…') : t('upload.uploadingN', '上传中 {n}%', { n: uploadProgress }) }}</span>
    </div>
  </div>
</template>