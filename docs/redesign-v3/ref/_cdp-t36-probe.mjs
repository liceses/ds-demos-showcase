// T36 探针：为什么右簇折行/溢出
const CDP = 9333
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const l = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(l.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 250)); return r.result.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${BASE}/` })
await sleep(2200)
const r = await ev(`(() => {
  const bar = document.querySelector('header.topbar')
  const kids = [...bar.children].map((k) => { const b = k.getBoundingClientRect(); const c = getComputedStyle(k); return { cls: String(k.className).slice(0, 40), x: +b.left.toFixed(1), w: +b.width.toFixed(1), top: +b.top.toFixed(1), disp: c.display, shrink: c.flexShrink, wrap: c.flexWrap } })
  const tops = [...new Set(kids.map((k) => k.top))]
  const mob = bar.querySelector('.mobile-nav-toggle')
  return { kids, rows: tops.length, tops, mobDisp: mob ? getComputedStyle(mob).display : 'none', barW: bar.getBoundingClientRect().width, scrollW: bar.scrollWidth }
})()`)
console.log(JSON.stringify(r, null, 2))
process.exit(0)
