// t27a 复核：桌面 OR 行内注 display 应为 none（textContent 读得到不代表看得见）
const CDP = 9333
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && !/devtools/i.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://localhost:5173/demos' })
await wait(2600)
await ev(`document.querySelector('.facet-btn').click()`)
await wait(500)
console.log(JSON.stringify(await ev(`(() => {
  const l = document.querySelector('.fp-grammar-or-line')
  const g = document.querySelector('.fp-grammar-or')
  return { orLineDisplay: l ? getComputedStyle(l).display : null, perGroupOr: g ? getComputedStyle(g).display : null }
})()`)))
ws.close()
