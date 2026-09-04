// t27b 复核：滚到页底后 footer 是否仍被动作条遮住（body padding 垫底生效性）
const CDP = 9333
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && !/devtools/i.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
await wait(3200)
console.log(JSON.stringify(await ev(`(async () => {
  for (let i = 0; i < 4; i++) {
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((r) => setTimeout(r, 700))
  }
  const f = document.querySelector('.footer')
  const bar = document.querySelector('.dv-mbar')
  const fr = f?.getBoundingClientRect()
  const br = bar?.getBoundingClientRect()
  return {
    bodyPad: document.body.style.paddingBottom,
    scrollY: Math.round(window.scrollY),
    scrollH: document.documentElement.scrollHeight,
    footerBottom: fr ? Math.round(fr.bottom) : null,
    barTop: br ? Math.round(br.top) : null,
    footerAboveBarTop: fr && br ? fr.bottom <= br.top : null,
    gap: fr && br ? Math.round(br.top - fr.bottom) : null,
  }
})()`)))
ws.close()
