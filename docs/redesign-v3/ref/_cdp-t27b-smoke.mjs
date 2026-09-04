// t27/M1-B 冒烟：Demo 页 ≤720 移动动作条——5 键/44px/主动作居中/三态衔接/评分滚达/讨论展开/全屏降级层
const CDP = 9333
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && !/devtools/i.test(t.url)) || list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
const errors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300))
  }
}
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  await (await import('fs/promises')).writeFile(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t27b-${name}.png`, Buffer.from(s.data, 'base64'))
}
await send('Runtime.enable')
await send('Page.enable')

const SLUG = '/demo/demo-c004ab51'
// 桌面 1440：动作条必须不可见
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://localhost:5173' + SLUG })
await wait(3200)
console.log('DESKTOP ' + JSON.stringify(await ev(`(() => {
  const b = document.querySelector('.dv-mbar')
  return { bar: !!b, display: b ? getComputedStyle(b).display : null }
})()`)))

// 移动 375：动作条出现；5 键；每键 ≥44px；全屏居中（第 3 键）
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://localhost:5173' + SLUG })
await wait(3400)
console.log('MOBILE-BAR ' + JSON.stringify(await ev(`(() => {
  const bar = document.querySelector('.dv-mbar')
  if (!bar) return { bar: false }
  const btns = [...bar.querySelectorAll('.dv-mbar-btn')]
  const hs = btns.map((b) => Math.round(b.getBoundingClientRect().height))
  const labels = btns.map((b) => b.querySelector('span')?.textContent.trim())
  const xs = btns.map((b) => Math.round(b.getBoundingClientRect().x))
  const cs = getComputedStyle(bar)
  return {
    bar: true, labels, minH: Math.min(...hs), display: cs.display, pos: cs.position,
    safePad: cs.paddingBottom, mainIsThird: bar.children[2]?.classList.contains('dv-mbar-main'),
    order: labels[2],
    pagePadBottom: getComputedStyle(document.querySelector('.route-page')).paddingBottom,
    overlapsFooter: (() => { const f = document.querySelector('.footer'); const r = bar.getBoundingClientRect(); return f ? f.getBoundingClientRect().bottom > r.top : null })(),
    xsMonotonic: xs.every((x, i) => i === 0 || x > xs[i - 1]),
  }
})()`)))
await shot('bar')
// 重开 → 预览回加载态（或海报 arm）
const before = await ev(`(() => ({ state: window.__pv ?? null, armed: undefined, iframes: document.querySelectorAll('.dv-stage iframe').length, loading: !!document.querySelector('.pv-loading') }))()`)
await ev(`(() => { [...document.querySelectorAll('.dv-mbar-btn')].find((b) => b.textContent.includes('重开'))?.click(); return 1 })()`)
await wait(600)
console.log('RESTART ' + JSON.stringify(await ev(`(() => ({ loading: !!document.querySelector('.pv-loading'), iframes: document.querySelectorAll('.dv-stage iframe').length }))()`)))
// 评分滚达：信息卡先展开 + 滚动 + 闪档
await ev(`(() => { localStorage.setItem('demo.factsOpen', '0'); return 1 })()`)
await send('Page.navigate', { url: 'http://localhost:5173' + SLUG })
await wait(3000)
const rate1 = await ev(`(() => {
  const facts = !!document.querySelector('.dv-facts')
  const y0 = window.scrollY
  ;[...document.querySelectorAll('.dv-mbar-btn')].find((b) => b.textContent.includes('评分'))?.click()
  return new Promise((r) => setTimeout(() => r({
    factsAfter: !!document.querySelector('.dv-facts'),
    scrolled: window.scrollY > y0 || Math.abs(window.scrollY - y0) > 10,
    flash: !!document.querySelector('.dv-rate--flash'),
    ratingInViewport: (() => { const e = document.getElementById('dv-rating'); if (!e) return null; const rr = e.getBoundingClientRect(); return rr.top >= 0 && rr.top < window.innerHeight })(),
  }), 900))
})()`)
console.log('RATE ' + JSON.stringify(rate1))
// 讨论：details 展开 + 滚动
const disc = await ev(`(() => {
  const y0 = window.scrollY
  ;[...document.querySelectorAll('.dv-mbar-btn')].find((b) => b.textContent.includes('讨论'))?.click()
  return new Promise((r) => setTimeout(() => {
    const d = document.getElementById('dv-comments')
    r({ open: d?.hasAttribute('open') ?? null, scrolled: window.scrollY !== y0 })
  }, 900))
})()`)
console.log('DISCUSS ' + JSON.stringify(disc))
// 全屏：headless Edge 元素级 requestFullscreen 可用性探测 + 降级层验证
const fs = await ev(`(() => {
  const stage = document.querySelector('.dv-stage')
  const hasApi = !!stage?.requestFullscreen
  ;[...document.querySelectorAll('.dv-mbar-btn')].find((b) => b.textContent.includes('全屏'))?.click()
  return new Promise((r) => setTimeout(() => r({
    hasApi,
    fsEl: !!document.fullscreenElement,
    fakeLayer: (() => { const s = document.querySelector('.dv-stage'); return s ? getComputedStyle(s).position === 'fixed' && getComputedStyle(s).zIndex === '1050' : false })(),
    exitBtn: !!document.querySelector('.dv-fs-exit'),
  }), 900))
})()`)
console.log('FULLSCREEN ' + JSON.stringify(fs))
await shot('fs')
// 退出全屏
await ev(`(() => { document.querySelector('.dv-fs-exit')?.click(); return 1 })()`)
await wait(600)
console.log('FS-EXIT ' + JSON.stringify(await ev(`(() => ({ fsEl: !!document.fullscreenElement, stagePos: getComputedStyle(document.querySelector('.dv-stage')).position }))()`)))
console.log('CONSOLE-ERRORS ' + JSON.stringify(errors.slice(0, 8)))
ws.close()
