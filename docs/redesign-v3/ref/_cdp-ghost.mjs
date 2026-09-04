// t17 伪影定位：hover 时谁在渲染 rgb(124,158,130)
const CDP = 9333
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.method + JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'http://localhost:5173/demos' })
await new Promise((r) => setTimeout(r, 2000))
const target = await ev(`(() => { const els = [...document.querySelectorAll('.tag-chip')]; const el = els[0]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 40)), text: el.textContent.trim().slice(0, 16) } })()`)
console.log('target: ' + JSON.stringify(target))
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y })
await new Promise((r) => setTimeout(r, 300))
const who = await ev(`(() => {
  const out = []
  let el = document.elementFromPoint(${target.x}, ${target.y})
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el)
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') out.push({ tag: el.tagName, cls: String(el.className).slice(0, 50), bg: cs.backgroundColor, filter: cs.filter, opacity: cs.opacity, mix: cs.mixBlendMode })
    el = el.parentElement
  }
  const top = document.elementFromPoint(${target.x}, ${target.y})
  return { chain: out, topEl: top ? top.tagName + '.' + String(top.className).slice(0, 40) : null }
})()`)
console.log(JSON.stringify(who, null, 1))
ws.close()
process.exit(0)
