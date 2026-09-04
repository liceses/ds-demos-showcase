// T20-A：admin 真实点击手测——懒加载面板切换异常/队列徽章计数/重复请求风暴
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
const onEvent = (method, fn) => { ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === method) fn(m.params) }) }
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
const reqCount = new Map()
onEvent('Network.requestWillBeSent', (p) => { const u = p.request.url.replace(/[?&]_=\\d+/, ''); const k = u.split('?')[0]; if (!/localhost:5173|127.0.0.1:5173/.test(k) || /\\.css|\\.png|\\.ico|\\.svg/.test(k)) return; reqCount.set(k, (reqCount.get(k) || 0) + 1) })
const consoleErrs = []
onEvent('Runtime.consoleAPICalled', (p) => { if (p.type === 'error' || p.type === 'warning') consoleErrs.push(p.args.map((a) => a.value || a.description || '').join(' ').slice(0, 120)) })

await send('Page.navigate', { url: `${BASE}/login` })
await sleep(1500)
const login = await ev(`(async () => { const r = await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }), credentials: 'include' }); return r.status })()`)
console.error('login: ' + login)
await send('Page.navigate', { url: `${BASE}/admin` })
await sleep(3200)
// 读取 admin 导航 tabs
const tabs = await ev(`(() => { const items = [...document.querySelectorAll('.ad-nav-item, [class*=ad-nav] button, .admin-nav button')]; return items.map((b, i) => ({ i, text: b.textContent.trim().slice(0, 18), cls: String(b.className).slice(0, 30), badge: (b.querySelector('.ad-nav-badge, [class*=badge]') || {}).textContent?.trim() || null })) })()`)
console.log('TABS ' + JSON.stringify(tabs))
// 徽章初始计数
const badge0 = await ev(`(() => { const bs = [...document.querySelectorAll('.ad-nav-badge, [class*=ad-nav] [class*=badge]')]; return bs.map(b => b.textContent.trim()) })()`)
console.log('BADGES0 ' + JSON.stringify(badge0))
// 逐 tab 点击（排除已 active）——记录每个 tab 的 chunk 请求与渲染
const out = []
for (const t of tabs.slice(0, 10)) {
  const before = reqCount.size
  const clicked = await ev(`(() => { const items = [...document.querySelectorAll('.ad-nav-item, [class*=ad-nav] button, .admin-nav button')]; const b = items[${t.i}]; if (!b) return false; b.click(); return true })()`)
  await sleep(1400)
  const state = await ev(`(() => { const panel = document.querySelector('.admin-shell [class*=section], .admin-shell .ad-body, .admin-shell main, .admin-shell'); const errs = [...document.querySelectorAll('[class*=error]')].length; return { hasPanel: !!panel, panelText: (panel?.textContent || '').trim().slice(0, 40), bodyLen: document.body.innerText.length } })()`)
  out.push({ tab: t.text, clicked, hasPanel: state.hasPanel, sample: state.panelText, bodyLen: state.bodyLen, newReqs: reqCount.size - before })
}
console.log('SWITCHES ' + JSON.stringify(out))
// 二次循环：重复切换（风暴检测——每 tab 再点一轮，看同 tab 是否重复拉 API/chunk）
const storm = {}
for (const t of tabs.slice(0, 6)) {
  const snap = new Map(reqCount)
  await ev(`(() => { const items = [...document.querySelectorAll('.ad-nav-item, [class*=ad-nav] button, .admin-nav button')]; items[${t.i}]?.click() })()`)
  await sleep(1300)
  const diffs = []
  for (const [u, c] of reqCount) { const was = snap.get(u) || 0; if (c > was) diffs.push((u.replace('http://localhost:5173', '') || '/') + ' +' + (c - was)) }
  storm[t.text || ('tab' + t.i)] = diffs
}
console.log('STORM ' + JSON.stringify(storm))
const badge1 = await ev(`(() => { const bs = [...document.querySelectorAll('.ad-nav-badge, [class*=ad-nav] [class*=badge]')]; return bs.map(b => b.textContent.trim()) })()`)
console.log('BADGES1 ' + JSON.stringify(badge1))
console.log('CONSOLE_ERRS ' + JSON.stringify(consoleErrs.filter((e) => e && !e.includes('Download the Vue Devtools')).slice(0, 10)))
ws.close()
process.exit(0)
