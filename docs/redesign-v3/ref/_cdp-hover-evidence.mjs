// t17 用户重验证据：demos 标签 hover 前后对照截图（双主题）
const CDP = 9333
const BASE = 'http://localhost:5173'
const OUT = 'D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.method + JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable'); await send('Runtime.enable')
const fs = await import('node:fs')
for (const theme of ['ink', 'paper']) {
  await send('Page.navigate', { url: `${BASE}/demos` })
  await sleep(1600)
  await ev(`localStorage.setItem('dsh_theme','${theme}'); sessionStorage.clear()`)
  await send('Page.reload')
  await sleep(2400)
  const chip = await ev(`(() => { const el = [...document.querySelectorAll('.tag-chip')].find(c => c.getBoundingClientRect().top > 60 && c.getBoundingClientRect().top < innerHeight - 40); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 40)) } })()`)
  if (!chip) continue
  const s1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${OUT}/t17-tagchip-${theme}-rest.png`, Buffer.from(s1.data, 'base64'))
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: chip.x, y: chip.y })
  await sleep(420)
  const s2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${OUT}/t17-tagchip-${theme}-hover.png`, Buffer.from(s2.data, 'base64'))
  const st = await ev(`(() => { const el = document.elementFromPoint(${chip.x}, ${chip.y}); const cs = getComputedStyle(el); return { cls: String(el.className).slice(0, 40), bg: cs.backgroundColor, color: cs.color } })()`)
  console.log(`${theme} hover 实测: ` + JSON.stringify(st))
}
ws.close()
process.exit(0)
