// 全局搜索覆盖层开关（M2-3，03 §12.1）——模块级 ref（funMode/useSearch 同范式，零 pinia 依赖）。
// 桌面顶栏 ⌕ 与 ⌘K 都是入口；未来 TabBar「我的」/命令面板（§12.2 M2 合一）可复用同一开关，
// 不必经 App.vue 传递——覆盖层组件挂在 App 根一次，Teleport 到 body 全路由可用（含 forum 双皮壳）。
import { ref } from 'vue'

export const searchOpen = ref(false)

export function openSearch() {
  searchOpen.value = true
}

export function closeSearch() {
  searchOpen.value = false
}
