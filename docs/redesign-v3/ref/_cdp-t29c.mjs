// T29-C：滚动态覆盖复验（脚本侧 sleep，表达式纯同步）
const CDP = 9333
const l = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const ws = new WebSocket(l.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 250)); return r.result.value }
const fs = await import('node:fs')
await send('Page.enable')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = {}
for (const y of [200, 400, 600]) {
  await ev(`window.scrollTo(0, ${y})`)
  await sleep(400)
  const r = await ev(`(() => {
    const ps = document.querySelector(".preview-shell")
    const story = document.querySelector(".dv-story")
    if (!ps || !story) return "gone"
    const pr = ps.getBoundingClientRect()
    const sr = story.getBoundingClientRect()
    const ov = Math.round(pr.bottom - sr.top)
    const midY = ov > 0 ? Math.round((sr.top + Math.min(pr.bottom, sr.bottom)) / 2) : null
    let topAt = "n/a"
    if (ov > 0 && midY > 0 && midY < innerHeight) { const el = document.elementFromPoint(300, midY); topAt = el ? el.tagName + "." + String(el.className).slice(0, 34) : "null" }
    const st = getComputedStyle(document.querySelector(".dv-stage"))
    return { scrollY: Math.round(scrollY), previewBottomViewport: Math.round(pr.bottom), storyTopViewport: Math.round(sr.top), overlapPx: ov, topElementInOverlap: topAt, stagePos: st.position, stageTop: st.top }
  })()`)
  out['scroll' + y] = r
}
await ev('window.scrollTo(0, 400)')
await sleep(400)
const s = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/t29-demo-scrolled.png', Buffer.from(s.data, 'base64'))
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
