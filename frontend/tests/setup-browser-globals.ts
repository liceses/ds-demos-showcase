// RF-1 测试环境准备：给 node 环境补上浏览器全局。
//
// 背景：`src/i18n/index.ts` 在**模块加载期**就读 location / sessionStorage / localStorage /
// navigator（语言探测 + 持久化），所以任何间接 import i18n 的模块（utils/time、modelDisplay、
// announcement…）在 vitest 默认的 node 环境下会直接 ReferenceError。
// 与其在每个测试文件里重复 stub，不如在这里装一次（vitest setupFiles）。
//
// 刻意只为「纯逻辑单测」补齐最小面；需要真实 DOM 行为的测试（focus、布局、事件）
// 应当走组件测试环境，而不是把这里堆成一个假浏览器。

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  } as Storage
}

const g = globalThis as unknown as Record<string, unknown>

if (typeof g.location === 'undefined') {
  g.location = {
    search: '',
    href: 'http://localhost/',
    origin: 'http://localhost',
    pathname: '/',
    hash: '',
  }
}
if (typeof g.localStorage === 'undefined') g.localStorage = memoryStorage()
if (typeof g.sessionStorage === 'undefined') g.sessionStorage = memoryStorage()
if (typeof g.navigator === 'undefined') g.navigator = { language: 'zh-CN', userAgent: 'vitest' }
// 刻意**不**装 document：Vue 的 runtime-dom 在 import 期就会用 createElement，
// 给一个残缺的假 document 会让所有 import vue 的测试在加载期炸。
// 需要 document 的测试（如 useBodyScrollLock）在自己文件里于**调用前**局部 stub。
