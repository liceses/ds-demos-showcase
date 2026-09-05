<!-- T15 拆分件（04 §5.4）：StepDescribe —— 步骤③说清楚（自 UploadView.vue 逐字迁出，行为不变） -->
<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../i18n'
import { tagLabel } from '../../utils/funMode'
import type { DerivedTag, TaskSuggestItem } from '../../api/types'
// T5·M5-F2：挑战挂题改用 TaskPicker（公开题目库搜索，词库归一）
import EntityPicker from '../picker/EntityPicker.vue'
import type { EntityPick } from '../picker/pickerSources'

const title = defineModel<string>('title', { default: '' })
const description = defineModel<string>('description', { default: '' })
const prompt = defineModel<string>('prompt', { default: '' })
const videoUrl = defineModel<string>('videoUrl', { default: '' })
const commitMessage = defineModel<string>('commitMessage', { default: '' })
const keepOldVersion = defineModel<boolean>('keepOldVersion', { default: false })
const uploadCode = defineModel<string>('uploadCode', { default: '' })
const forceUpload = defineModel<boolean>('forceUpload', { default: false })
const tagsOpen = defineModel<boolean>('tagsOpen', { default: false })
const taskQuery = defineModel<string>('taskQuery', { default: '' })
const taskPickerOpen = defineModel<boolean>('taskPickerOpen', { default: false })
// 高级区展开态：纯面板本地视觉态（原 wizard 内 ref 初始 false，行为一致）
const showAdvanced = ref(false)

defineProps<{
  descOk: boolean
  promptOk: boolean
  editSlug: string
  demoType: 'web' | 'zip' | 'link'
  zipFile: File | null
  coverFile: File | null
  currentCover: string
  coverPreview: string
  isWide: boolean
  isAdmin: boolean
  idempotencyKey: string
  expNo: string
  pickedTask: { slug: string; title: string } | null
  taskHits: TaskSuggestItem[]
  taskSearching: boolean
  simPct: (score: number) => string
  packVisible: DerivedTag[]
  packLoading: boolean
  packIgnored: boolean
  drawnTask: { slug: string; title: string } | null
  drawing: boolean
  chosenModelNames: string[]
  selectedList: { key: string; value: string; description: string }[]
  selectedCount: number
}>()
const emit = defineEmits<{
  pickTask: [x: TaskSuggestItem]
  clearTask: []
  openTaskPicker: []
  scheduleTaskSearch: [q: string]
  runTaskSearch: [q: string]
  addSuggestion: [s: DerivedTag]
  addAllSuggestions: []
  bringBackPack: []
  drawTask: []
  coverChange: [e: Event]
  clearCover: []
}>()

/** TaskPicker 命中 → 既有 pickTask 语义（parent 只用 slug/title 落 pickedTask） */
function onTaskEntityPick(p: EntityPick) {
  taskQuery.value = ''
  emit('pickTask', {
    task_id: p.id ?? 0,
    slug: (p.slug as string) || '',
    title: p.label,
    category: (p.category as string | null) ?? null,
    demo_count: 0,
    score: 1,
  } as TaskSuggestItem)
}
</script>

<template>
  <fieldset class="uw-panel">
    <legend>{{ t('upload.s3Legend', '把它讲明白') }}</legend>
    <label class="field">
      <span class="uw-label-row">
        {{ t('upload.title', '标题') }}
        <span class="uw-count mono" :class="{ bad: !title.trim() }">{{ title.trim().length }}</span>
      </span>
      <input v-model="title" class="input" maxlength="200" :placeholder="t('upload.titlePlaceholder', 'Demo 标题')" required data-step-focus="3" />
      <span class="hint">{{ t('upload.titleWhy', '别人搜的就是这几个字 —— 写"它在干什么"，别写"我的作品 12"。') }}</span>
    </label>
    <label class="field">
      <span class="uw-label-row">
        {{ t('upload.desc', '描述') }}
        <span class="uw-count mono" :class="{ good: descOk }">{{ description.trim().length }}</span>
      </span>
      <textarea v-model="description" class="input textarea" maxlength="2000" rows="3" :placeholder="t('upload.descPlaceholder', '简要描述这个 Demo')"></textarea>
      <span class="hint">{{ descOk ? t('upload.descOk', '够了。补一句"怎么玩"会更好。') : t('upload.descShort', '太短了，写 2~4 句：这是什么、怎么玩、有什么新鲜处。') }}</span>
    </label>
    <label class="field">
      <span class="uw-label-row">
        {{ t('upload.prompt', '第一轮提示词（可选，展示为提示词卡片）') }}
        <span class="uw-count mono" :class="{ good: promptOk }">{{ prompt.trim().length }}</span>
      </span>
      <textarea v-model="prompt" class="input textarea" rows="4" :placeholder="t('upload.promptPlaceholder', '生成这个 Demo 时使用的第一轮提示词…')"></textarea>
      <span class="hint">{{ t('upload.promptWhy', '有了它，同一句话交给别的模型的作品会自动互相对照（详情页「同提示词」）。') }}</span>
    </label>

    <!-- 挂题（第 6 条）：作者终于能主动说"我这件答的是哪道题"。
         建议由规则层从标题/描述/提示词算出，选择由作者声明 —— 两者不混。 -->
    <div class="uw-task">
      <div class="uw-task-head">
        <b>{{ t('upload.taskTitle', '挂到哪道题？') }}</b>
        <span class="hint">{{ t('upload.taskIsApply', '可选。挂题是申请：管理员批准后才会出现在同题对比里。') }}</span>
      </div>

      <div v-if="pickedTask" class="uw-picked-row">
        <span class="tag-chip active">{{ t('upload.taskPicked', '题目') }}：{{ pickedTask.title }}</span>
        <button type="button" class="uw-x" :aria-label="t('upload.unpick', '取消选择')" @click="emit('clearTask')">✕</button>
        <RouterLink class="btn btn-sm btn-ghost" :to="`/tasks/${pickedTask.slug}`" target="_blank" rel="noopener">
          {{ t('upload.taskSeeBrief', '看题面 ↗') }}
        </RouterLink>
      </div>

      <template v-else>
        <div v-if="taskHits.length && !taskPickerOpen" class="uw-suggest">
          <span class="kpi-label">{{ t('upload.taskGuess', '根据你写的内容，可能是这些题') }}</span>
          <div class="filter-row" style="margin: 0; flex-wrap: wrap">
            <button v-for="x in taskHits" :key="x.slug" type="button" class="tag-chip mode-open" @click="emit('pickTask', x)">
              {{ x.title }}<span class="count">{{ x.demo_count }}</span>
              <i class="uw-sim mono">{{ simPct(x.score) }}</i>
            </button>
          </div>
        </div>
        <button v-if="!taskPickerOpen" type="button" class="btn btn-sm btn-outline" @click="emit('openTaskPicker')">
          {{ taskHits.length ? t('upload.taskFindMore', '都不是，我自己找…') : t('upload.taskFind', '选一道已有题目 →') }}
        </button>
      </template>

      <!-- T5·M5-F2：搜索挂题 = TaskPicker（公开题目库：标题/分类搜索，chips 建议保留在上方） -->
      <div v-if="taskPickerOpen" class="uw-task-search">
        <EntityPicker
          kind="task"
          source="public"
          mode="dropdown"
          :placeholder="t('upload.taskSearchPh', '输入题目关键词…')"
          @pick="onTaskEntityPick"
        />
        <div class="filter-row" style="margin: 6px 0 0">
          <button type="button" class="btn btn-sm btn-ghost" @click="taskPickerOpen = false">{{ t('common.collapse', '收起') }}</button>
        </div>
        <p class="hint" style="margin: 6px 0 0">
          {{ t('upload.taskNoHit', '没有匹配的题目。可以不挂题；若想出题，去题目页看看「题目候选」。') }}
          <RouterLink to="/tasks" target="_blank" rel="noopener">{{ t('upload.taskGo', '题目页 ↗') }}</RouterLink>
        </p>
      </div>
    </div>

    <!-- 建议包主动呈现（旧版藏在抽屉里 = 不存在）；provenance：建议 ≠ 声明，须作者点头 -->
    <div v-if="!packIgnored && packVisible.length" class="pack-card">
      <div class="filter-row" style="margin: 0 0 8px; flex-wrap: wrap">
        <b>{{ t('upload.packTitle', '根据你的描述，这些标签可能合适') }}</b>
        <span v-if="packLoading" class="muted mono">…</span>
        <button class="btn btn-sm btn-primary" type="button" @click="emit('addAllSuggestions')">{{ t('upload.packAll', '全部收下') }}</button>
        <button class="btn btn-sm btn-outline" type="button" @click="packIgnored = true">{{ t('upload.packHide', '不用了') }}</button>
      </div>
      <div class="pack-list">
        <button v-for="s in packVisible" :key="s.key + ':' + s.value" type="button" class="pack-chip" :title="`${s.reason}（${t('upload.packConf', '置信')} ${Math.round(s.confidence * 100)}%）`" @click="emit('addSuggestion', s)">
          <span class="pack-key mono">{{ s.key }}</span><b>{{ s.value }}</b><span class="count">+</span>
        </button>
      </div>
    </div>

    <!-- 建议包被收掉后必须能叫回来；顺手给一个「抽一题」的岔路口 -->
    <div v-if="packIgnored || !packVisible.length" class="filter-row" style="margin: 0 0 10px">
      <button v-if="packIgnored" type="button" class="btn btn-sm btn-outline" @click="emit('bringBackPack')">↺ {{ t('upload.packBack', '重新看看标签建议') }}</button>
      <button type="button" class="btn btn-sm btn-secondary" :disabled="drawing" @click="emit('drawTask')">
        {{ drawing ? '…' : '🎲 ' + t('upload.drawTask', '没灵感？抽一题') }}
      </button>
      <!-- 新标签打开：站内跳转会卸载本页，把作者已填的东西一起带走（实测反馈的问题） -->
      <RouterLink v-if="drawnTask" class="tag-chip mode-open" :to="`/tasks/${drawnTask.slug}`" target="_blank" rel="noopener">
        {{ drawnTask.title }} · {{ t('upload.drawGo', '去看题面 →') }}
      </RouterLink>
    </div>

    <!-- 其他标签：需要完全控制的人有门，普通人不必进去 -->
    <div class="tag-drawer-wrap">
      <button class="tag-drawer-bar" type="button" @click="tagsOpen = !tagsOpen">
        <span class="tag-drawer-title">{{ t('upload.tagsOther', '其他标签（类型 / 分类 / 玩法 / 轮数…）') }}</span>
        <span v-if="selectedList.length" class="tag-drawer-chips">
          <span v-for="s in selectedList" :key="s.key + ':' + s.value" class="tag-chip active" :title="s.description || ''">{{ s.key }}:{{ tagLabel(s.value) }}</span>
        </span>
        <span class="tag-drawer-count"><b>{{ selectedCount }}</b> {{ t('upload.selectedCount', '已选') }}</span>
        <span v-if="!isWide" class="tag-drawer-toggle">{{ tagsOpen ? t('upload.collapseArrow', '收起 ←') : t('upload.expandArrow', '展开 →') }}</span>
      </button>
    </div>

    <label class="field">
      {{ t('upload.cover', '封面（可选）') }}{{ editSlug ? t('upload.coverEdit', '（可选，不选保留当前封面）') : '' }}
      <input class="input" type="file" accept="image/png,image/jpeg,image/webp" @change="emit('coverChange', $event)" />
      <div v-if="currentCover || coverPreview" class="cover-preview">
        <img :src="coverPreview || currentCover" alt="封面预览" />
        <span v-if="coverPreview" class="cover-preview-badge">{{ t('upload.newCover', '新封面') }}</span>
        <button v-if="coverFile" type="button" class="uw-x uw-x-over" :aria-label="t('upload.removeCover', '移除封面')" @click="emit('clearCover')">✕</button>
      </div>
    </label>
    <label class="field">
      {{ t('upload.video', '介绍视频链接（可选，服务器不存视频）') }}
      <input v-model="videoUrl" class="input" :placeholder="t('upload.videoPlaceholder', 'https://…（B站/YouTube 等）')" />
    </label>
    <label v-if="editSlug" class="field">
      {{ t('upload.commitMsg', '更新说明 / commit 信息（可选）') }}
      <input v-model="commitMessage" class="input" :placeholder="t('upload.commitPlaceholder', '例如：修复第二关音效不同步的问题')" />
      <span class="hint">{{ t('upload.commitHint', '会生成「作品更新公告」并写入时间线') }}</span>
    </label>
    <label v-if="editSlug && zipFile && demoType !== 'link'" class="field" style="display: flex; gap: 8px; align-items: center">
      <input v-model="keepOldVersion" type="checkbox" style="width: 18px; height: 18px" />
      {{ t('upload.keepOld', '保留当前版本为独立旧版页面（上传新 zip 时生效）') }}
    </label>

    <!-- 受众分离：这三样不是作者的日常决策，别混在正文里 -->
    <button type="button" class="uw-adv-toggle" :aria-expanded="showAdvanced" @click="showAdvanced = !showAdvanced">
      {{ showAdvanced ? '▾' : '▸' }} {{ t('upload.advTitle', '高级（多数人不需碰）') }}
    </button>
    <div v-show="showAdvanced" class="uw-adv">
      <label class="field">
        {{ t('upload.uploadCode', '信任通道 upload_code（可选，未登录免审核）') }}
        <input v-model="uploadCode" class="input" placeholder="UPLOAD_CODE（有则填）" />
      </label>
      <p class="hint" style="margin: 0">
        {{ t('upload.idemPrefix', '幂等键已自动生成：') }}<code>{{ idempotencyKey }}</code>{{ t('upload.idemSuffix', '（重试不会重复创建）') }}
        <!-- 同一个键，换个读法：这是你这次实验的编号，截图发群时可引用 -->
        <span v-if="expNo" class="uw-expno mono" :title="t('upload.expTip', '本次上传的实验编号（由幂等键末 6 位得到）')">EXP-{{ expNo }}</span>
      </p>
      <label v-if="isAdmin" class="field" style="display: flex; gap: 8px; align-items: center; margin-top: 8px">
        <input v-model="forceUpload" type="checkbox" style="width: 18px; height: 18px" />
        {{ t('upload.force', '强制上传（跳过 zip 去重 409）') }}
      </label>
    </div>
  </fieldset>
</template>