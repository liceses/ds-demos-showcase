<script setup lang="ts">
/**
 * 功能页页头（P2-b 的**唯一入口**）。
 *
 * 收敛前：16 个页面手写 `<section class="page-hero"><span class="eyebrow"><h1 class="huge">`，
 * 5 个列表页手写 `page-hero--compact` + `h1.page-title`；4 个详情页还各自内联
 * `style="padding-bottom: var(--sp-20)"` 与 `h1 style="margin-top: 0"`。
 * 结果：同一件事 3 种写法，且"巨字档"（`.huge` = clamp(44px,8vw,120px)，1440 屏实测
 * 115.2px）与紧凑档（42px）混用 —— 登录页顶着 115px 巨标题配 440px 表单卡。
 *
 * D2 决策（用户已批）：**巨字只属于首页品牌封面**（HomeView 的 `hero-v2` 自持），
 * 功能页统一紧凑档。所以本组件恒为紧凑档，没有 tier 开关 ——
 * 留一个没人用的 `tier="hero"` 只会变成下一个"看似有档位、实际只有一条路"的死配置。
 *
 * 形态说明（诚实的边界）：这是个**薄壳**。它收敛的是"档位与变体"（紧凑档 + tight），
 * 不收敛 eyebrow/title/sub 的内部结构 —— 那部分各页差异大（子标题里带链接、标题行里带
 * 印章与徽章、标题后跟统计条），硬套 props 会把差异藏进条件分支。结构收敛留到 P3 逐页
 * 改造时按页做。薄壳的价值在**唯一入口**：护栏测试要求页头必须走本组件，
 * 手写 `<section class="page-hero">` 或再挂 `.huge` 会直接测试失败。
 */
withDefaults(
  defineProps<{
    /** 详情页变体：底部收紧到 20px（原是各详情页的内联 style） */
    tight?: boolean
  }>(),
  {},
)
</script>

<template>
  <section class="page-hero page-hero--compact" :class="{ 'page-hero--tight': tight }">
    <slot />
  </section>
</template>
