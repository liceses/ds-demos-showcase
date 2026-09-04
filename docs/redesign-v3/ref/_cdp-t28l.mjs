// T28 钉住终验（干净版）
const CDP = 9333
const fs = await import('node:fs')
const l = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const ws = new WebSocket(l.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 250)); return r.result.value }
await send('Page.enable')
const out = {}
await send('Page.navigate', { url: 'http://localhost:5173/demos' })
await new Promise((r) => setTimeout(r, 2000))
out.step1 = await ev('(() => ({ vw: innerWidth, ls: localStorage.getItem("dsh_demos_facet_pin"), btn: !!document.querySelector(".facet-btn") }))()')
out.drawer = await ev(`(async () => { const b = document.querySelector(".facet-btn"); if (!b) return "no-btn"; b.click(); await new Promise(r => setTimeout(r, 700)); return { panel: !!document.querySelector(".facet-panel"), panelCls: [...document.querySelectorAll("[class*=facet-panel]")].map(x => x.className).slice(0, 2), pinBtn: !!document.querySelector(".fp-pin") } })()`)
out.pinClick = await ev(`(() => { const p = document.querySelector(".fp-pin"); if (!p) return "no-pin"; p.click(); return "pin-clicked" })()`)
await new Promise((r) => setTimeout(r, 700))
out.afterPin = await ev('(() => ({ pinnedPanel: !!document.querySelector(".facet-panel--pinned"), pos: document.querySelector(".facet-panel--pinned") ? getComputedStyle(document.querySelector(".facet-panel--pinned")).position : null, btnHidden: (() => { const b = document.querySelector(".facet-btn"); return b ? getComputedStyle(b).display === "none" : null })() }))()')
await send('Page.reload')
await new Promise((r) => setTimeout(r, 2600))
out.afterReload = await ev('(() => ({ ls: localStorage.getItem("dsh_demos_facet_pin"), pinnedPanel: !!document.querySelector(".facet-panel--pinned"), sticky: (() => { const p = document.querySelector(".facet-panel--pinned"); return p ? getComputedStyle(p).position : null })(), btnHidden: (() => { const b = document.querySelector(".facet-btn"); return b ? getComputedStyle(b).display === "none" : null })() }))()')
const s = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/t28-pin.png', Buffer.from(s.data, 'base64'))
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
