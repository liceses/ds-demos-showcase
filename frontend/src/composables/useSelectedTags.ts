import { computed, type Ref } from 'vue'

/**
 * 「已选标签」的派生层（RF-3c）。
 *
 * 背景：同一份 `Record<key, 条目[]>` 在四处被各自展平一遍 ——
 *   UploadView：selectedTags（get/set 双向）、selectedCount、chosenModelNames
 *   useUploadWizard：selectedList（清单摘要）
 *   TagPicker：selectedCount、selectedList
 * 展平逻辑一旦要改（例如加排序、去重、带出 tier），就得同时改四处；
 * 而两处的**条目形状还不一样**（上传页存 {value,description}，选择器存 {key,value,description}），
 * 所以这里对条目类型做成泛型，只约定必须有 `value`。
 *
 * 只收敛派生（读）；写操作仍归各自的 composable/组件（它们语义不同：
 * 上传页是"建议包收下/合并"，选择器是"点选/输入/移除"）。
 */

/** 派生层要求的最小条目形状 */
export interface SelectedEntry {
  value: string
  description?: string
}

export type SelectedMap<T extends SelectedEntry = SelectedEntry> = Record<string, T[]>

/** 展平后的一行（带它所属的 key） */
export type SelectedRow<T extends SelectedEntry> = T & { key: string }

export function useSelectedTags<T extends SelectedEntry>(selected: Ref<SelectedMap<T>>) {
  /** 展平成带 key 的行；模板/摘要/校验都读它 */
  const list = computed<SelectedRow<T>[]>(() =>
    Object.entries(selected.value).flatMap(([key, items]) => items.map((it) => ({ ...it, key }))),
  )

  const count = computed(() => list.value.length)

  /** 某个 key 下的值（例：model 下的所有型号名） */
  function valuesOf(key: string): string[] {
    return (selected.value[key] ?? []).map((it) => it.value)
  }

  /** Q2：模型必选/灰测判定等场景消费 */
  const modelNames = computed(() => valuesOf('model'))

  /** 提交给后端的 `key:value` 串（保持既有顺序约定） */
  const tags = computed(() => list.value.map((s) => `${s.key}:${s.value}`))

  function has(key: string, value: string): boolean {
    return (selected.value[key] ?? []).some((it) => it.value === value)
  }

  /** 反向：把展平数组写回 map（v-model setter 用） */
  function toMap(rows: { key: string; value: string; description?: string }[]): SelectedMap<T> {
    const map: SelectedMap<T> = {}
    for (const t of rows) {
      ;(map[t.key] = map[t.key] || []).push({ value: t.value, description: t.description || '' } as T)
    }
    return map
  }

  return { list, count, valuesOf, modelNames, tags, has, toMap }
}
