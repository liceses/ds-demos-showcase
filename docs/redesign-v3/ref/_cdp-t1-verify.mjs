// t1 M2 移动 TabBar 验证探针（CDP 9333 + localhost:5174 mock）
// 断言面：375 TabBar 结构/触达/active 反色/顶栏降级（品牌+主题/语言）/抽屉退役无残留/
//         app-shell 让位/forum 壳不挂载/未登录我的位；1200 桌面零影响。
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

// ---------- 375 首页 ----------
await mob(375, 960)
await go('http://localhost:5174/')
const m375 = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  const vis = (s) => { const e = q(s); return e ? getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0 : false }
  const rect = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) } }
  const cs = (s) => { const e = q(s); return e ? getComputedStyle(e) : null }
  const tabbar = q('.tabbar')
  const tabs = qa('.tabbar .tb')
  const fab = q('.tabbar .fab')
  const active = q('.tabbar .tb.active')
  const topbarBtns = qa('.topbar button')
  const shell = q('.app-shell')
  return {
    tabbarPresent: !!tabbar,
    tabbarDisplay: tabbar ? cs('.tabbar').display : null,
    tabbarPos: tabbar ? cs('.tabbar').position : null,
    tabbarBottom: tabbar ? cs('.tabbar').bottom : null,
    tabbarPadBottom: tabbar ? cs('.tabbar').paddingBottom : null,
    tabbarRect: rect('.tabbar'),
    tabCount: tabs.length,
    tabHeights: tabs.map((t) => Math.round(t.getBoundingClientRect().height)),
    fabPresent: !!fab,
    fabRect: rect('.tabbar .fab'),
    fabBg: fab ? getComputedStyle(fab).backgroundColor : null,
    tabLabels: tabs.map((t) => t.textContent.trim()),
    activeLabel: active ? active.textContent.trim() : null,
    activeBg: active ? getComputedStyle(active).backgroundColor : null,
    activeColor: active ? getComputedStyle(active).color : null,
    // 顶栏降级：<720 只留品牌+主题/语言
    brandVisible: vis('.topbar .brand'),
    navLinksVisible: vis('.topbar nav.topnav-desktop'),
    ctaVisible: vis('.topnav-cta'),
    authClusterDisplay: cs('.auth-cluster') ? cs('.auth-cluster').display : null,
    topbarButtons: topbarBtns.map((b) => (b.textContent.trim() || b.getAttribute('aria-label') || '?')).slice(0, 6),
    topbarButtonsVisible: topbarBtns.map((b) => b.getClientRects().length > 0).slice(0, 6),
    // 抽屉退役
    drawerDom: !!q('.mobile-drawer'),
    toggleDom: !!q('.mobile-nav-toggle'),
    drawerCssRemnant: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.selectorText && /mobile-drawer|mobile-nav-toggle/.test(r.selectorText)) } catch { return false } }),
    // 让位
    shellPadBottom: shell ? cs('.app-shell').paddingBottom : null,
    // forum 壳探针在单独导航做
  }
})()`)
console.log('=== 375 home ===')
console.log(JSON.stringify(m375, null, 1))
await shot('375-home')

// ---------- 375 /login（未登录我的位 active）----------
await go('http://localhost:5174/login')
const mLogin = await ev(`(() => {
  const tabs = [...document.querySelectorAll('.tabbar .tb')]
  const active = document.querySelector('.tabbar .tb.active')
  return {
    activeLabel: active ? active.textContent.trim() : null,
    activeIsLast: active ? tabs.indexOf(active) === tabs.length - 1 : false,
    labels: tabs.map((t) => t.textContent.trim()),
    loginPageHasRegister: !!document.querySelector('a[href="/register"]'),
  }
})()`)
console.log('=== 375 login ===')
console.log(JSON.stringify(mLogin))
await shot('375-login')

// ---------- 375 /forum（双皮壳不挂 TabBar）----------
await go('http://localhost:5174/forum')
const mForum = await ev(`(() => ({
  tabbarPresent: !!document.querySelector('.tabbar'),
  forumShell: !!document.querySelector('.forum-shell'),
  shellPadBottom: getComputedStyle(document.querySelector('.app-shell')).paddingBottom,
}))()`)
console.log('=== 375 forum ===')
console.log(JSON.stringify(mForum))
await shot('375-forum')

// ---------- 1200 桌面零影响 ----------
await mob(1200, 960)
await go('http://localhost:5174/')
const m1200 = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const vis = (s) => { const e = q(s); return e ? getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0 : false }
  const cs = (s) => { const e = q(s); return e ? getComputedStyle(e) : null }
  return {
    tabbarDisplay: cs('.tabbar') ? cs('.tabbar').display : 'absent',
    navLinksVisible: vis('.topbar nav.topnav-desktop'),
    navLinkCount: [...document.querySelectorAll('.topbar nav.topnav-desktop .nav-link')].length,
    ctaVisible: vis('.topnav-cta'),
    authClusterDisplay: cs('.auth-cluster') ? cs('.auth-cluster').display : null,
    toolsGap: cs('.topnav-tools') ? cs('.topnav-tools').gap : null,
    toolsVisible: vis('.topnav-tools'),
    shellPadBottom: cs('.app-shell').paddingBottom,
    bellPresent: !!q('.notif-bell'),
  }
})()`)
console.log('=== 1200 desktop ===')
console.log(JSON.stringify(m1200, null, 1))
await shot('1200-home')

ws.close()
console.log('PROBE DONE')