import { getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * 打字机循环（RF-4h：从 HomeView 的 setup 里抽出）。
 *
 * 原实现是 26 行内联逻辑 + 4 个闭包变量（定时器/词序/字符位/是否在退格），
 * 与组件实例绑死 —— 行为（打完停 2.6s → 退格 → 换下一句）**无法单测**。
 * 抽出来后可用 vitest fake timers 直接断言整条时序。
 *
 * @param phrases 词池（响应式：整活模式/语言切换会换池）
 * @param opts 节奏：逐字 42ms / 退格 18ms / 打完停顿 2600ms（与原来逐字一致）
 */
export interface TypewriterOptions {
  /** 逐字间隔（ms） */
  typeMs?: number
  /** 退格间隔（ms） */
  eraseMs?: number
  /** 一句打完后停留（ms） */
  holdMs?: number
  /** 是否立即开跑（默认 true） */
  start?: boolean
}

export function useTypewriter(phrases: Ref<string[]>, opts: TypewriterOptions = {}) {
  const { typeMs = 42, eraseMs = 18, holdMs = 2600, start = true } = opts
  const text = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null
  let idx = 0
  let char = 0
  let deleting = false
  let running = false

  function pool(): string[] {
    return phrases.value.length ? phrases.value : ['']
  }

  function tick() {
    const list = pool()
    const phrase = list[idx % list.length]
    if (!deleting) {
      char++
      text.value = phrase.slice(0, char)
      if (char >= phrase.length) {
        deleting = true
        timer = setTimeout(tick, holdMs)
        return
      }
    } else {
      char--
      text.value = phrase.slice(0, Math.max(0, char))
      if (char <= 0) {
        deleting = false
        idx = (idx + 1) % list.length
      }
    }
    timer = setTimeout(tick, deleting ? eraseMs : typeMs)
  }

  function startLoop() {
    if (running) return
    running = true
    idx = 0
    char = 0
    deleting = false
    text.value = ''
    tick()
  }

  function stopLoop() {
    running = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  if (start) startLoop()

  // 词池换了（切语言/整活模式）→ 从头重打，避免用旧词的下标切新词
  watch(phrases, () => {
    stopLoop()
    startLoop()
  })

  // 只在组件上下文注册清理（测试/非组件环境调用时不打 Vue 警告）
  if (getCurrentInstance()) onBeforeUnmount(stopLoop)

  return { text, start: startLoop, stop: stopLoop }
}
