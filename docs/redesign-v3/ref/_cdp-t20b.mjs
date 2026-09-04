// T20-B：页面转场实机（KeepAlive 往返/滚动/筛选/例外硬切/reduced-motion/警告清零）
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
await send('Page.enable'); await send('Runtime.enable')
// 转场观察器：记录 page-enter-active 出现→移除时长
await ev(`(() => { window.__t20 = { enterAt: null, removeAt: null, seen: false }; new MutationObserver(() => { const el = document.querySelector('.page-enter-active'); if (el && !window.__t20.seen) { window.__t20.enterAt = performance.now(); window.__t20.seen = true } if (window.__t20.seen && !el && window.__t20.removeAt === null) { window.__t20.removeAt = performance.now() } }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] }) })()`)
const watchReset = async () => ev(`(() => { window.__t20 = { enterAt: null, removeAt: null, seen: false } })()`)
const watchRead = async () => ev(`(() => { const d = window.__t20; return { seen: d.seen, dur: d.enterAt !== null && d.removeAt !== null ? Math.round(d.removeAt - d.enterAt) : (d.seen ? 'pending' : null) } })()`)
const out = {}
// 登录（admin 转场用）
await send('Page.navigate', { url: `${BASE}/login` })
await sleep(1400)
await ev(`(async () => { await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }), credentials: 'include' }) })()`)
// ① KeepAlive 往返：/demos?tag=game:tetris 滚动 → 进详情 → back
await send('Page.navigate', { url: `${BASE}/demos?tag=game:tetris` })
await sleep(2200)
const scrollSetup = await ev(`(() => { window.scrollTo(0, 760); return document.documentElement.scrollHeight })()`)
await sleep(420)
const y0 = await ev(`window.scrollY`)
await watchReset()
await ev(`(() => { const c = [...document.querySelectorAll('.demo-card, a[href*="/demo/"]')][0]; if (c) c.click() })()`)
await sleep(2400)
const atDemo = await ev(`({ path: location.pathname, active: !!document.querySelector('.page-enter-active, .page-enter') })`)
await watchReset()
await ev(`history.back()`)
await sleep(2600)
const back = await ev(`({ path: location.pathname, query: location.search, scrollY: Math.round(window.scrollY), filterKept: document.body.innerText.includes('game:tetris') || location.search.includes('tag') })`)
out.keepalive = { y0, demoPath: atDemo.path, enterAtDemo: atDemo.active, backPath: back.path, backQuery: back.query, backScrollY: back.scrollY, filterKept: back.filterKept, enterDur: await watchRead() }
// ② forum 例外硬切
await send('Page.navigate', { url: `${BASE}/` })
await sleep(1600)
await watchReset()
await ev(`(() => { const a = [...document.querySelectorAll('a')].find(x => x.getAttribute('href') === '/forum'); if (a) a.click() })()`)
await sleep(1400)
const forumEnter = await watchRead()
await watchReset()
await ev(`(() => { const a = [...document.querySelectorAll('a')].find(x => x.getAttribute('href')?.startsWith('/forum/topic')); if (a) a.click() })()`)
await sleep(1600)
const topicEnter = await watchRead()
out.forumException = { listEnter: forumEnter, topicEnter, path: await ev(`location.pathname`) }
// ③ upload 例外
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(1700)
await watchReset()
await ev(`(() => { const a = [...document.querySelectorAll('a')].find(x => x.getAttribute('href') === '/upload'); if (a) a.click() })()`)
await sleep(1700)
out.uploadException = { enter: await watchRead(), path: await ev(`location.pathname`) }
// ④ reduced-motion 转场直接换页
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(1900)
await watchReset()
await ev(`(() => { const c = [...document.querySelectorAll('.demo-card, a[href*="/demo/"]')][0]; if (c) c.click() })()`)
await sleep(1500)
const rm = await watchRead()
out.reducedMotion = { enterDur: rm, path: await ev(`location.pathname`) }
await send('Emulation.setEmulatedMedia', { features: [] })
// ⑤ admin 转场（修复后应动画+警告清零）
await send('Page.navigate', { url: `${BASE}/` })
await sleep(1500)
await watchReset()
await ev(`(() => { const a = [...document.querySelectorAll('a')].find(x => x.getAttribute('href') === '/admin'); if (a) a.click() })()`)
await sleep(2600)
out.adminEnter = { enter: await watchRead(), path: await ev(`location.pathname`) }
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
