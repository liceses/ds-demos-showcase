// t16 probe3：eyebrow 字色实锤
const CDP = 9333
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
await new Promise((r) => setTimeout(r, 3000))
const r = await ev(`(() => {
  const els = [...document.querySelectorAll('.eyebrow')].slice(0, 4)
  return els.map((e) => { const cs = getComputedStyle(e); return { text: e.textContent.trim().slice(0, 14), color: cs.color, bg: cs.backgroundColor, theme: document.documentElement.dataset.theme } })
})()`)
console.log(JSON.stringify(r, null, 1))
ws.close()
process.exit(0)
