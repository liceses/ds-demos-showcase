// t33 复核：公告弹层关闭链路
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://localhost:5173/' })
await wait(3200)
console.log(JSON.stringify(await ev(`(async () => {
  const out = {}
  document.querySelector('.ann-banner')?.click()
  await new Promise((r) => setTimeout(r, 600))
  out.opened = !!document.querySelector('.ann-modal-panel')
  const btn = document.querySelector('.ann-modal-head .btn')
  out.btnText = btn?.textContent.trim() ?? null
  btn?.click()
  await new Promise((r) => setTimeout(r, 100))
  out.closedAt100 = !document.querySelector('.ann-modal-panel')
  await new Promise((r) => setTimeout(r, 500))
  out.closedAt600 = !document.querySelector('.ann-modal-panel')
  return out
})()`)))
ws.close()
