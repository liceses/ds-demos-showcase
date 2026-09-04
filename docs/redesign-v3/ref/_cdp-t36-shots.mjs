// T36 after 截图：1440/1200/1024 三档 header 对照
const CDP = 9333
const BASE = 'http://localhost:5173'
const fs = await import('node:fs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const l = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(l.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
await send('Page.enable')
await send('Page.navigate', { url: `${BASE}/` })
await sleep(2000)
for (const w of [1440, 1200, 1024]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 500, deviceScaleFactor: 1, mobile: false })
  await sleep(400)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(new URL(`./_t36-after-${w}.png`, import.meta.url), Buffer.from(shot.data, 'base64'))
  console.log(`saved _t36-after-${w}.png`)
}
process.exit(0)
