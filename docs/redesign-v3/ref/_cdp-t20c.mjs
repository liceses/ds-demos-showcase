// T20-C：forum 例外硬切 / reduced-motion / admin 警告清零 / R6 物理（hover/active computed）
const CDP = 9333
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.method + JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
const consoleErrs = []
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) consoleErrs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 90)) })
await send('Page.navigate', { url: `${BASE}/login` })
await sleep(1400)
await ev(`(async () => { await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }), credentials: 'include' }) })()`)
const out = {}
// ① forum 例外硬切（页内 push）
await send('Page.navigate', { url: `${BASE}/` })
await sleep(1800)
const r1 = await ev(`(async () => { const seen = []; const h = (e) => { if ((e.animationName || '').includes('stamp') || (e.animationName || '').includes('rise')) seen.push(e.animationName) }; document.addEventListener('animationstart', h, true); const app = document.querySelector('#app').__vue_app__; app.config.globalProperties.$router.push('/forum'); await new Promise(r => setTimeout(r, 900)); document.removeEventListener('animationstart', h, true); return { stampSeen: seen, path: location.pathname, hasForumShell: !!document.querySelector('.forum-shell'), hasHeader: !!document.querySelector('header.topbar') } })()`)
out.forumException = r1
// ② reduced-motion 转场
await send('Page.navigate', { url: `${BASE}/` })
await sleep(1600)
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await send('Page.reload')
await sleep(1800)
const r2 = await ev(`(async () => { const seen = []; const h = (e) => { if ((e.animationName || '').includes('stamp')) seen.push(e.animationName) }; document.addEventListener('animationstart', h, true); const app = document.querySelector('#app').__vue_app__; app.config.globalProperties.$router.push('/demos'); await new Promise(r => setTimeout(r, 700)); document.removeEventListener('animationstart', h, true); return { stampSeen: seen, path: location.pathname } })()`)
out.reducedMotion = r2
await send('Emulation.setEmulatedMedia', { features: [] })
await send('Page.reload')
await sleep(1800)
// ③ R6 物理：demos 页按钮 hover/active computed
const r3 = await ev(`(async () => {
  const btn = [...document.querySelectorAll('.btn')].find(b => b.getBoundingClientRect().top > 60 && b.getBoundingClientRect().top < innerHeight - 40) || document.querySelector('.btn')
  const rr = btn.getBoundingClientRect()
  const cx = Math.round(rr.left + rr.width / 2), cy = Math.round(rr.top + rr.height / 2)
  const read = () => { const cs = getComputedStyle(btn); return { shadow: cs.boxShadow.slice(0, 60), transform: cs.transform, transDur: cs.transitionDuration, transProp: cs.transitionProperty.slice(0, 40) } }
  const base = read()
  const moveEv = new PointerEvent('pointerover', { bubbles: true })
  btn.dispatchEvent(moveEv)
  document.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy }))
  await new Promise(r => setTimeout(r, 320))
  const hover = read()
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await new Promise(r => setTimeout(r, 80))
  const active = read()
  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  return { cls: String(btn.className).slice(0, 40), base, hover, active }
})()`)
out.r6physics = r3
// ④ admin 警告复验（切 admin + 两个面板）
await send('Page.navigate', { url: `${BASE}/admin` })
await sleep(3000)
await ev(`(() => { const items = [...document.querySelectorAll('.ad-nav-item')]; items[1]?.click() })()`)
await sleep(1200)
await ev(`(() => { const items = [...document.querySelectorAll('.ad-nav-item')]; items[14]?.click() })()`)
await sleep(1200)
out.adminWarns = consoleErrs.filter((e) => e.includes('Transition') || e.includes('non-element')).slice(0, 4)
out.adminWarnCount = out.adminWarns.length
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
