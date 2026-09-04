// T29-A：Demo 页 preview-shell/dv-story 层叠实况 + quick-comments 折叠结构
const CDP = 9333
const l = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const ws = new WebSocket(l.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 250)); return r.result.value }
const fs = await import('node:fs')
await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
await new Promise((r) => setTimeout(r, 3200))
const out = {}
out.layout = await ev(`(() => {
  const ps = document.querySelector(".preview-shell")
  const story = document.querySelector(".dv-story")
  const rc = (e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }
  const cs = (e) => { const c = getComputedStyle(e); return { pos: c.position, z: c.zIndex, bg: c.backgroundColor, mt: c.marginTop, overflow: c.overflow } }
  const overlap = ps && story ? Math.round(rc(ps).bottom - rc(story).top) : null
  let topEl = null
  if (ps && story) { const probe = document.elementFromPoint(rc(ps).left + 60, Math.min(rc(ps).bottom + 3, innerHeight - 10)); topEl = probe ? probe.tagName + "." + String(probe.className).slice(0, 32) : "null" }
  const shell = document.querySelector(".dv-shell")
  return {
    preview: ps ? Object.assign(rc(ps), cs(ps)) : null,
    story: story ? Object.assign(rc(story), cs(story)) : null,
    overlapPx: overlap,
    topAfterPreviewEdge: topEl,
    shellCols: shell ? getComputedStyle(shell).gridTemplateColumns.slice(0, 70) : null,
  }
})()`)
out.qc = await ev(`(() => {
  const ds = [...document.querySelectorAll(".dv-disclose")].map(d => ({ summary: d.querySelector("summary") ? d.querySelector("summary").textContent.trim().slice(0, 22) : null, open: d.open }))
  const qcs = [...document.querySelectorAll("[class*=quick-comment], [class*=comment]")].map(x => String(x.className).slice(0, 40)).slice(0, 4)
  return { discloses: ds, commentCls: qcs }
})()`)
const s = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/t29-demo-top.png', Buffer.from(s.data, 'base64'))
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
