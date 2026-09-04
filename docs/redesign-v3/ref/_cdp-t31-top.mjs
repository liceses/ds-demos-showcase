// t31 复核：滚到顶部桌面全页视觉（wrapper 后 dv-shell 完整形态）
const CDP = 9333
const fs = await import('fs')
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
await send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
await new Promise((r) => setTimeout(r, 3600))
await ev(`(() => { window.scrollTo(0, 0); return 1 })()`)
await new Promise((r) => setTimeout(r, 400))
console.log(JSON.stringify(await ev(`(() => {
  const g = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const stage = g('.dv-stage'), facts = g('.dv-facts'), story = g('.dv-story')
  return {
    stage, facts, story,
    sameWidth: stage && story ? stage.w === story.w : null,
    gapStageStory: stage && story ? Math.round(story.y - (stage.y + stage.h)) : null,
  }
})()`)))
const s = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t31-desktop-top2.png', Buffer.from(s.data, 'base64'))
ws.close()
