<script setup lang="ts">
defineOptions({ name: 'AdminSettingsSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import { applyServerFunMode } from '../../utils/funMode'
import type { Settings } from '../../api/types'

const ui = useUiStore()
const settings = ref<Settings>({ auto_approve: true, auto_approve_public: false, fun_mode: false })
const storageInfo = ref<{ oss_enabled: boolean; mode: string; local_demos: number; local_files: number; local_size_bytes: number }>({
  oss_enabled: false,
  mode: 'local',
  local_demos: 0,
  local_files: 0,
  local_size_bytes: 0,
})
const storageModeLabel = computed(() => {
  if (storageInfo.value.mode === 'oss') return 'OSS 直连'
  if (storageInfo.value.mode === 'oss_backup') return '本地存储（OSS 备份）'
  return '本地存储'
})

async function loadSettings() {
  try {
    const [s, st] = await Promise.all([api.getSettings(), api.storageStatus()])
    settings.value = s
    storageInfo.value = st
  } catch {
    /* 静默 */
  }
}

async function saveSettings() {
  try {
    settings.value = await api.updateSettings(settings.value)
    // 整活开关：本端立即生效 + 强刷 site-info 缓存，让全站尽快广播新状态
    applyServerFunMode(!!settings.value.fun_mode)
    api.getSiteInfo({ refresh: true }).catch(() => undefined)
    ui.toast('设置已保存', 'success')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

const ossSyncing = ref(false)
const ossSyncProgress = ref('')
async function runOssSync(force = false) {
  if (ossSyncing.value) return
  ossSyncing.value = true
  ossSyncProgress.value = ''
  try {
    const r = await api.ossSync(force)
    if (!r.started) {
      ui.toast('已有同步任务在进行中，请稍候', 'info')
    }
    for (;;) {
      const job = await api.getOssSyncStatus()
      if (job.total) ossSyncProgress.value = `${job.done}/${job.total}`
      if (!job.running) {
        ui.toast(
          `OSS ${force ? '强制全量' : ''}同步完成：demo ${job.ok} 成功 / ${job.fail} 失败，封面 ${job.covers_ok} 成功 / ${job.covers_fail} 失败${job.last_error ? '，最后错误：' + job.last_error : ''}`,
          job.fail || job.covers_fail ? 'error' : 'success',
        )
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    ossSyncing.value = false
    ossSyncProgress.value = ''
  }
}

function fmtSize(n: number) {
  if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + ' GB'
  if (n >= 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}

onMounted(loadSettings)
</script>

<template>
  <div>
    <div class="card card-mint" style="max-width: 520px; padding: 24px; margin-bottom: 20px">
      <h2 style="margin-bottom: 12px">存储</h2>
      <div class="filter-row" style="margin-bottom: 10px">
        <span class="mini-stat"><b>{{ storageModeLabel }}</b> 模式</span>
        <span class="mini-stat"><b>{{ storageInfo.local_demos }}</b> demo</span>
        <span class="mini-stat"><b>{{ storageInfo.local_files }}</b> 文件</span>
        <span class="mini-stat"><b>{{ fmtSize(storageInfo.local_size_bytes) }}</b> 本地占用</span>
      </div>
      <p class="hint" style="margin-bottom: 12px">本地是完整存储（全量文件在服务器），OSS 只是镜像。切换模式：修改服务器 .env 的 <code>OSS_ENABLED</code>（false=本地 / true=OSS）+ <code>docker compose up -d backend</code> 重建生效。</p>
      <div class="filter-row" style="margin-bottom: 0">
        <button class="btn btn-secondary" type="button" :disabled="ossSyncing" @click="runOssSync()">
          {{ ossSyncing ? `同步中… ${ossSyncProgress}` : '同步本地文件到 OSS' }}
        </button>
        <button class="btn btn-dark" type="button" :disabled="ossSyncing" @click="runOssSync(true)">
          {{ ossSyncing ? `同步中… ${ossSyncProgress}` : '强制全量同步' }}
        </button>
      </div>
    </div>

    <div class="card card-default" style="max-width: 520px; padding: 24px">
      <label class="field">
        <input v-model="settings.auto_approve" type="checkbox" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle" />
        新上传 Demo 自动通过审核（登录用户）
      </label>
      <label class="field">
        <input v-model="settings.auto_approve_public" type="checkbox" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle" />
        未注册（public）上传自动通过审核
      </label>
      <p class="hint" style="margin-bottom: 14px">开启「未注册放行」后，任何人（含 AI agent）不注册即可上传并即时上线，建议配合限流与 UPLOAD_CODE 信任通道使用。</p>
      <label class="field">
        <input v-model="settings.fun_mode" type="checkbox" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle" />
        整活模式（astra 灰测作品收集）
      </label>
      <p class="hint" style="margin-bottom: 14px">
        纯显示层整活：前端把 <code>ds-unknown</code> 显示为 <code>astra-grey</code>、站点标题换成「astra 灰测作品收集」。
        不改任何数据、URL 和上传行为；保存后全站访客约 1~2 分钟内生效（CDN 缓存），管理后台恒显真实值。
      </p>
      <button class="btn btn-primary" type="button" @click="saveSettings">保存设置</button>
    </div>
  </div>
</template>
