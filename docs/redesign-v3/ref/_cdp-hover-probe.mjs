// t17 hover 机制探针
const CDP = 9333
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.method + JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable')
await send('Page.navigate', { url: 'http://localhost:5173/demos' })
await new Promise((r) => setTimeout(r, 2000))
// 找一个 chip 的 nodeId 与索引
const root = await send('DOM.getDocument', { depth: 0 })
const q = await send('DOM.querySelectorAll', { nodeId: root.root.nodeId, selector: '.tag-chip' })
console.error('chip count: ' + q.nodeIds.length)
const nid = q.nodeIds[0]
if (nid) {
  const before = await ev(`(() => { const el = document.querySelectorAll('.tag-chip')[0]; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color } })()`)
  await send('CSS.forcePseudoStates', { nodeId: nid, forcedPseudoClasses: ['hover'] })
  const after = await ev(`(() => { const el = document.querySelectorAll('.tag-chip')[0]; const cs = getComputedStyle(el); const m = el.matches(':hover'); return { bg: cs.backgroundColor, color: cs.color, matchesHover: m } })()`)
  console.log('BEFORE ' + JSON.stringify(before))
  console.log('HOVER  ' + JSON.stringify(after))
  await send('CSS.forcePseudoStates', { nodeId: nid, forcedPseudoClasses: [] })
} else console.error('no chip found')
ws.close()
process.exit(0)
