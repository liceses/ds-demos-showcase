// t1 补充探针：未登录分支 + 「我的」内聚页内自我工具（CDP 9333 + localhost:5174 真后端）
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t1-${name}.png`, Buffer.from(s.data, 'base64'))
}
const go = async (url, ms = 2600) => { await send('Page.navigate', { url }); await wait(ms) }
await send('Page.enable')
const mob = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })

// ---------- 未登录态：清 cookie + storage ----------
await mob(375, 960)
await go('http://localhost:5174/')
await send('Network.enable')
await send('Network.clearBrowserCookies')
await ev('localStorage.clear(); sessionStorage.clear(); "cleared"')
await go('http://localhost:5174/', 3000)
const unlogged = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const tabs = [...document.querySelectorAll('.tabbar .tb')]
  const active = document.querySelector('.tabbar .tb.active')
  return {
    loggedIn: !!(q('.user-menu-trigger')),
    tabLabels: tabs.map((t) => t.textContent.trim()),
    activeLabel: active ? active.textContent.trim() : null,
    topbarVisibleButtons: [...document.querySelectorAll('.topbar button')].filter((b) => b.getClientRects().length > 0).map((b) => b.textContent.trim()),
    authClusterVisibleLinks: [...document.querySelectorAll('.auth-cluster a')].filter((a) => a.getClientRects().length > 0).map((a) => a.textContent.trim()),
  }
})()`)
console.log('=== 375 unlogged home ===')
console.log(JSON.stringify(unlogged, null, 1))
await shot('375-unlogged-home')

await go('http://localhost:5174/login')
const unloggedLogin = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const active = document.querySelector('.tabbar .tb.active')
  return {
    onLoginPage: !!q('form'),
    activeLabel: active ? active.textContent.trim() : null,
    hasRegisterLink: !!q('a[href="/register"]'),
    tabLabels: [...document.querySelectorAll('.tabbar .tb')].map((t) => t.textContent.trim()),
  }
})()`)
console.log('=== 375 unlogged login ===')
console.log(JSON.stringify(unloggedLogin))
await shot('375-unlogged-login')

// ---------- 登录态：我的内聚页内自我工具 ----------
await go('http://localhost:5174/user/m24probe', 3200)
const selfTools = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const me = q('.tabbar .tb-me')
  return {
    onUserPage: !!q('.page-hero'),
    heroButtons: [...document.querySelectorAll('.page-hero .filter-row > *')].map((e) => (e.textContent.trim().slice(0, 12) || e.tagName)),
    notifTool: !!q('.self-notif'),
    notifToolHref: q('.self-notif') ? q('.self-notif').getAttribute('href') : null,
    logoutBtn: !!q('.page-hero .btn-dark'),
    workbenchLink: !!q('.page-hero a[href="/admin"]'),
    meTabActive: me ? me.classList.contains('active') : false,
    settingsLink: !!q('.page-hero a[href="/settings"]'),
  }
})()`)
console.log('=== 375 self tools ===')
console.log(JSON.stringify(selfTools, null, 1))
await shot('375-self-tools')

ws.close()
console.log('PROBE2 DONE')