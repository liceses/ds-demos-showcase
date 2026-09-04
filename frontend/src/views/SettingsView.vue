<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api'
import { t } from '../i18n'
import { getChosenTheme, getEffectiveTheme, setTheme } from '../utils/theme'
import type { EffectiveTheme, ThemeChoice } from '../utils/theme'

// 修改密码表单
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwdMsg = ref('')
const pwdError = ref('')
const pwdSubmitting = ref(false)

async function submitPassword() {
  pwdMsg.value = ''
  pwdError.value = ''
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    pwdError.value = t('settings.errComplete', '请填写完整')
    return
  }
  if (newPassword.value.length < 8) {
    pwdError.value = t('settings.errShort', '新密码至少 8 位')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwdError.value = t('settings.errMismatch', '两次输入的新密码不一致')
    return
  }
  pwdSubmitting.value = true
  try {
    await api.changePassword(oldPassword.value, newPassword.value)
    pwdMsg.value = t('settings.ok', '密码修改成功，下次登录请使用新密码')
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e) {
    pwdError.value = (e as Error).message
  } finally {
    pwdSubmitting.value = false
  }
}

// ---- 外观与主题（03 §11.3 落位#3 / 04 §3.5 四落位#2；M2-4）----
// 复用 utils/theme.ts：setTheme 即时应用+持久化（硬切闸内建，点击即全站换肤=即时预览）；
// getChosenTheme/getEffectiveTheme 为非响应式读取 → 组件内 ref 镜像。
const themeChoice = ref<ThemeChoice>(getChosenTheme())
// 跟随系统模式下解析出的生效主题（matchMedia 监听驱动，系统卡实时显示）
const sysEff = ref<EffectiveTheme>(getEffectiveTheme())

const themeOptions: { value: ThemeChoice; nameKey: string; nameZh: string; descKey: string; descZh: string }[] = [
  {
    value: 'system',
    nameKey: 'settings.themeSystem',
    nameZh: '跟随系统',
    descKey: 'settings.themeSystemDesc',
    descZh: '随设备深浅色偏好自动切换；首次访问默认',
  },
  {
    value: 'paper',
    nameKey: 'settings.themePaper',
    nameZh: '纸白',
    descKey: 'settings.themePaperDesc',
    descZh: '默认亮色——白纸黑字',
  },
  {
    value: 'ink',
    nameKey: 'settings.themeInk',
    nameZh: '墨黑',
    descKey: 'settings.themeInkDesc',
    descZh: '夜间暗色——近黑纸暖白字',
  },
]

function pickTheme(c: ThemeChoice) {
  if (themeChoice.value === c) return // 重复点击不重放硬切闸
  themeChoice.value = setTheme(c) // 即时预览：应用+落盘一步完成（04 §3.5）
  sysEff.value = getEffectiveTheme()
}

// 系统卡实时值：系统偏好翻转时（选择=system 期间）标签跟手刷新；
// html[data-theme] 的跟随重应用由 theme.ts initTheme 登记的监听负责（App.vue 挂载时已接管）。
let schemeMql: MediaQueryList | null = null
const onSchemeChange = () => {
  sysEff.value = getEffectiveTheme()
}
onMounted(() => {
  sysEff.value = getEffectiveTheme()
  schemeMql = window.matchMedia('(prefers-color-scheme: dark)')
  schemeMql.addEventListener('change', onSchemeChange)
})
onBeforeUnmount(() => {
  schemeMql?.removeEventListener('change', onSchemeChange)
})
</script>

<template>
  <div class="route-page">  <section class="page-hero">
    <span class="eyebrow">{{ t('settings.eyebrow', '账户设置') }}</span>
    <h1 class="huge">{{ t('settings.title', '设置') }}</h1>
    <p class="sub">{{ t('settings.sub', '修改你的登录密码。密码修改后，下次登录请使用新密码。') }}</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="auth-card card card-coral" style="padding: 24px">
      <h2 style="margin-bottom: 12px">{{ t('settings.changePwd', '修改密码') }}</h2>
      <form class="form-stack" @submit.prevent="submitPassword">
        <label class="field">
          {{ t('settings.oldPwd', '原密码') }}
          <input v-model="oldPassword" class="input" type="password" autocomplete="current-password" required />
        </label>
        <label class="field">
          {{ t('settings.newPwd', '新密码（至少 8 位）') }}
          <input v-model="newPassword" class="input" type="password" autocomplete="new-password" required />
        </label>
        <label class="field">
          {{ t('settings.confirmPwd', '确认新密码') }}
          <input v-model="confirmPassword" class="input" type="password" autocomplete="new-password" required />
        </label>
        <div v-if="pwdError" class="notice notice-error">{{ pwdError }}</div>
        <div v-if="pwdMsg" class="notice notice-success">{{ pwdMsg }}</div>
        <button class="btn btn-primary btn-block" type="submit" :disabled="pwdSubmitting">
          {{ pwdSubmitting ? t('settings.submitting', '提交中…') : t('settings.changePwd', '修改密码') }}
        </button>
      </form>
    </div>
  </section>

  <section class="section" style="padding-top: 0">
    <div class="appearance-card card card-default">
      <h2 style="margin-bottom: 6px">{{ t('settings.appearanceTitle', '外观与主题') }}</h2>
      <p class="appearance-desc">
        {{ t('settings.appearanceDesc', '选择立即生效并保存在本设备；「跟随系统」随设备深浅色偏好自动换肤。') }}
      </p>
      <div class="theme-options" role="radiogroup" :aria-label="t('settings.appearanceTitle', '外观与主题')">
        <button
          v-for="o in themeOptions"
          :key="o.value"
          type="button"
          role="radio"
          :aria-checked="themeChoice === o.value"
          class="theme-card"
          :class="{ 'theme-card-on': themeChoice === o.value }"
          @click="pickTheme(o.value)"
        >
          <span class="theme-swatch" :class="`swatch-${o.value}`" aria-hidden="true">
            <i v-if="o.value === 'system'"></i>
            <i v-if="o.value === 'system'"></i>
          </span>
          <span class="theme-name">{{ t(o.nameKey, o.nameZh) }}</span>
          <span class="theme-desc">{{ t(o.descKey, o.descZh) }}</span>
          <span
            v-if="o.value === 'system' && themeChoice === 'system'"
            class="theme-eff"
          >
            {{ sysEff === 'paper' ? t('settings.effPaper', '当前生效：纸白') : t('settings.effInk', '当前生效：墨黑') }}
          </span>
        </button>
      </div>
    </div>
  </section>
  </div>
</template>

<style scoped>
/* ---- M2-4 外观与主题节 ---- */
.appearance-card {
  padding: 24px;
}
.appearance-desc {
  margin: 0 0 18px;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.7;
}

/* 三列栅格（03 §11.3）；<720 单列（触达 ≥44px 与说明行可读优先） */
.theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 719px) {
  .theme-options {
    grid-template-columns: 1fr;
  }
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  min-height: 44px; /* 触达红线 ≥44×44（03 §10.1；实际卡片远超下限） */
  padding: 14px;
  text-align: left;
  background: var(--paper-deep);
  border: 2px solid var(--ink);
  box-shadow: none;
  border-radius: 0;
  color: var(--ink);
  cursor: pointer;
  font-family: inherit;
  transition:
    transform var(--b-dur) var(--b-ease),
    box-shadow var(--b-dur) var(--b-ease);
}
.theme-card:focus-visible {
  outline: 3px solid var(--teal); /* 12.4 硬边框轮廓：3px 实线+2px offset */
  outline-offset: 2px;
}
@media (hover: hover) {
  /* hover 纪律（03 §12.5）：阴影增大+抬起，不倾斜；触屏以 :active 压平承担 */
  .theme-card:hover {
    box-shadow: 6px 6px 0 0 var(--ink);
    transform: translate(-2px, -2px);
  }
}
.theme-card:active {
  box-shadow: none;
  transform: translate(0, 0);
}
/* 选中=反色：ink 底纸白字（角色绑定随主题自动换向，反色语义不变——04 §3.1） */
.theme-card-on {
  background: var(--ink);
  color: var(--paper);
}

.theme-name {
  font-weight: 700;
  font-size: 15px;
}
.theme-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-soft);
}
.theme-card-on .theme-desc {
  color: var(--paper);
  opacity: 0.78;
}
/* 系统卡实时生效值章（matchMedia 监听驱动；仅跟随系统被选中时显示） */
.theme-eff {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border: 2px solid currentColor;
}

/*
 * R4 豁免：swatch 表示「固定主题的固定观感」——纸白卡必须恒显纸白、墨黑卡必须恒显墨黑；
 * 若绑 --paper/--ink 会随当前主题翻面，预览失真。故此处使用字面色常量
 * （值取 tokens/primitives.css --p-paper/--p-ink 与 tokens/themes.css --k-ink/--k-warm-white canonical）。
 * 边框用各主题自身墨色（currentColor）：保证 swatch 在选中反色卡（ink 底）上仍有轮廓。
 */
.theme-swatch {
  width: 44px;
  height: 28px;
  box-sizing: border-box;
  border: 2px solid currentColor;
}
.swatch-paper {
  background: #ffffff;
  color: #000000;
}
.swatch-ink {
  background: #141414;
  color: #f5f2ea;
}
/* 跟随系统：纸白/墨黑左右硬切对分（无渐变——法则 02，硬边即语义） */
.swatch-system {
  display: inline-flex;
  padding: 0;
  border: none;
  background: transparent;
}
.swatch-system i {
  display: block;
  width: 22px;
  height: 28px;
  box-sizing: border-box;
}
.swatch-system i:first-child {
  background: #ffffff;
  border: 2px solid #000000;
}
.swatch-system i:last-child {
  background: #141414;
  border: 2px solid #f5f2ea;
  margin-left: -2px; /* 中缝叠 2px：外缘各 2px、中缝 2px，双半等权 */
}
</style>