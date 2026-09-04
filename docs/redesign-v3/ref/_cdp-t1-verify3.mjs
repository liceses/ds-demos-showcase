// t1 探针3：mock 5180 上登录态「我的」内聚全链（admin=工作台+徽章；未读红点镜像；TabBar active）
const CDP = 9334
const BASE = 'http://localhost:5180'
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
const go = async (url, ms = 2800) => { await send('Page.navigate', { url }); await wait(ms) }
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 960, deviceScaleFactor: 1, mobile: false })

// 未登录 → /login（TabBar 登录位 active）
await go(BASE + '/login')
const loginProbe = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const active = q('.tabbar .tb.active')
  const u = q('input[placeholder*="用户"], input[name="username"], input[type="text"]')
  const p = q('input[type="password"]')
  return { onLogin: !!q('form'), activeLabel: active ? active.textContent.trim() : null, hasUser: !!u, hasPass: !!p }
})()`)
console.log('login page:', JSON.stringify(loginProbe))

// 登录 admin
const loginRes = await ev(`(async () => {
  const u = document.querySelector('input[type="text"], input:not([type="password"])')
  const p = document.querySelector('input[type="password"]')
  const set = (el, v) => { el.focus(); el.value = ''; document.execCommand('insertText', false, el === u ? 'admin' : 'admin123'); el.dispatchEvent(new Event('input', { bubbles: true })); }
  set(u); set(p)
  const btn = [...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录|log ?in/i.test(b.textContent))
  if (!btn) return { error: 'no submit btn' }
  btn.click()
  await new Promise((r) => setTimeout(r, 2200))
  return { nowAt: location.pathname, loggedIn: !!document.querySelector('.user-menu-trigger') }
})()`)
console.log('login action:', JSON.stringify(loginRes))

// 登录后已在 /（SPA）：等待稳定即测（mock 内存态经不起重载）
await wait(800)
const homeAfter = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  return {
    username: q('.user-menu-trigger') ? q('.user-menu-trigger').textContent.trim().slice(0, 20) : null,
    tabLabels: [...document.querySelectorAll('.tabbar .tb')].map((t) => t.textContent.trim()),
    meHasDot: !!q('.tabbar .tb-dot'),
    topbarVisibleButtons: [...document.querySelectorAll('.topbar button')].filter((b) => b.getClientRects().length > 0).map((b) => b.textContent.trim().slice(0, 12)),
    fabPresent: !!q('.tabbar .fab'),
  }
})()`)
console.log('home after login:', JSON.stringify(homeAfter, null, 1))
await shot('mock-375-home-loggedin')

// 我的页（/user/admin）：自我工具排 + meTab active
await ev("document.querySelector('.tabbar .tb-me').click(); 'spa'")
await wait(2500)
const selfTools = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const row = [...document.querySelectorAll('.page-hero .filter-row > *')]
  return {
    onUserPage: !!q('.page-hero'),
    heroTail: row.slice(-5).map((e) => e.textContent.trim().slice(0, 16)),
    notifTool: !!q('.self-notif'),
    notifHref: q('.self-notif') ? q('.self-notif').getAttribute('href') : null,
    notifDot: !!q('.self-notif-dot'),
    settingsLink: !!q('.page-hero a[href="/settings"]'),
    workbenchLink: !!q('.page-hero a[href="/admin"]'),
    workbenchBadge: q('.page-hero a[href="/admin"] .self-badge') ? q('.page-hero a[href="/admin"] .self-badge').textContent.trim() : null,
    logoutBtn: !!q('.page-hero .btn-dark'),
    meTabActive: (() => { const m = q('.tabbar .tb-me'); return m ? m.classList.contains('active') : false })(),
  }
})()`)
console.log('self tools:', JSON.stringify(selfTools, null, 1))
await shot('mock-375-self-tools')

// 点通知工具 → /notifications 路由可达
await ev(`document.querySelector('.self-notif')?.click(); "clicked"`)
await wait(2200)
const notifPage = await ev(`(() => ({ path: location.pathname, hasNotifUI: !!document.querySelector('.route-page') }))()`)
console.log('notif nav:', JSON.stringify(notifPage))

// 工作台路由（admin）可达性（移动）
await ev("document.querySelector('.page-hero a[href=\"/admin\"]').click(); 'spa'")
await wait(2500)
const adminPage = await ev(`(() => ({ path: location.pathname, hasShell: !!document.querySelector('.app-shell'), tabbar: !!document.querySelector('.tabbar') }))()`)
console.log('admin page:', JSON.stringify(adminPage))

ws.close()
console.log('PROBE3 DONE')