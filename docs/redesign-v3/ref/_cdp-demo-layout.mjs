// t21 复现：Demo 页收起/展开两态几何测量（推挤/同宽/毗邻三现象取证）
const CDP = 9333
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && !/devtools/i.test(t.url)) || list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable')
await send('Runtime.enable')
// 强制桌面视口（user-data-dir 可能残留旧 emulation）
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
const shot = async (name) => { const d = await send('Page.captureScreenshot', { format: 'png' }); const b64 = d.data; return { name, b64 } }

// 干净状态：清 facts 记忆 → 展开态为默认
await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
await new Promise((r) => setTimeout(r, 3500))
await ev(`localStorage.removeItem('demo.factsOpen'); location.reload(); 'reloading'`)
await new Promise((r) => setTimeout(r, 3500))

const measure = `(() => {
  const g = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, position: cs.position, gridCols: cs.gridTemplateColumns.split(' ').slice(0, 3).join(' ') }
  }
  const shell = document.querySelector('.dv-shell')
  return {
    vw: innerWidth,
    shell: g('.dv-shell'),
    stage: g('.dv-stage'),
    iframe: g('.dv-stage iframe, .dv-stage .preview-shell'),
    facts: g('.dv-facts'),
    rail: g('.dv-rail'),
    desc: g('.dv-desc-card'),
    mainContainer: g('main.container'),
    factsOpen: String(!!document.querySelector('.dv-facts')),
    shellTransition: shell ? getComputedStyle(shell).transition : null,
    gridTransitionOnShell: shell ? getComputedStyle(shell).transitionDuration : null,
  }
})()`

const expanded = await ev(measure)
console.log('EXPANDED ' + JSON.stringify(expanded, null, 1))
const s1 = await shot('t21-expanded')
// 截图落盘
const fs = await import('fs')
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t21-expanded.png', Buffer.from(s1.b64, 'base64'))

// 切到收起态（点收起按钮）
await ev(`(() => { const b = [...document.querySelectorAll('.dv-collapse')][0]; if (b) b.click(); return 'clicked' })()`)
await new Promise((r) => setTimeout(r, 700))
const collapsed = await ev(measure)
console.log('COLLAPSED ' + JSON.stringify(collapsed, null, 1))
const s2 = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t21-collapsed.png', Buffer.from(s2.data, 'base64'))

// 主列位移差（收起 vs 展开的 stage 宽度/位置变化 = 推挤量）
const push = expanded.stage && collapsed.stage ? { wDelta: collapsed.stage.w - expanded.stage.w, xDelta: collapsed.stage.x - expanded.stage.x } : null
console.log('PUSH ' + JSON.stringify(push))
ws.close()
