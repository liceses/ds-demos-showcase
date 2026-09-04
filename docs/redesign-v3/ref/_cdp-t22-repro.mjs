// t22 复现：三现象取证（①粘 ②APPROVED 对游客 ③浮层盖预览）
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
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
await new Promise((r) => setTimeout(r, 3500))
await ev(`localStorage.setItem('demo.factsOpen','1'); location.reload(); 'r'`)
await new Promise((r) => setTimeout(r, 3500))
const m = await ev(`(() => {
  const g = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const stage = g('.dv-stage'), facts = g('.dv-facts'), desc = g('.dv-desc-card'), iframe = g('.preview-shell .preview-frame') || g('.dv-stage iframe')
  const overlap = facts && iframe ? Math.max(0, Math.min(facts.x + facts.w, iframe.x + iframe.w) - Math.max(facts.x, iframe.x)) : 0
  return {
    gapStageToDesc: stage && desc ? Math.round(desc.y - (stage.y + stage.h)) : null,
    stageW: stage?.w, descW: desc?.w, sameWidth: stage?.w === desc?.w,
    facts: facts, iframeW: iframe?.w, factsOverlapIframePx: overlap,
    approvedVisible: (() => { const e = document.querySelector('.dv-facts-head .eyebrow'); return e ? { text: e.textContent.trim(), display: getComputedStyle(e).display } : null })(),
    authState: { loggedIn: !!localStorage.getItem('dsh_token') || !!Object.keys(localStorage).find(k => k.includes('token')) }
  }
})()`)
console.log('REPRO ' + JSON.stringify(m, null, 1))
const shot = await send('Page.captureScreenshot', { format: 'png' })
;(await import('fs')).writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t22-repro.png', Buffer.from(shot.data, 'base64'))
ws.close()
