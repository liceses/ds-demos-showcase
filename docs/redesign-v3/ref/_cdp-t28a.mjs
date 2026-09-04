// T28-A：导航/首页枢纽/分面桌面/404/水位线（1360 桌面会话）
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
const fs = await import('node:fs')
await send('Page.enable'); await send('Runtime.enable')
const out = {}
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/t28-${n}.png`, Buffer.from(s.data, 'base64')); return `t28-${n}.png` }

// ① 导航（未登录态：6 项+CTA；admin 菜单应隐藏）
await send('Page.navigate', { url: `${BASE}/` })
await sleep(2000)
out.nav = await ev(`(() => {
  const links = [...document.querySelectorAll('header .nav-link, header nav a')].map(a => ({ t: a.textContent.trim().slice(0, 10), href: a.getAttribute('href') }))
  const cta = [...document.querySelectorAll('header a, header button')].filter(x => x.textContent.includes('上传')).map(x => ({ tag: x.tagName, cls: String(x.className).slice(0, 30), href: x.getAttribute('href') }))
  const adminInNav = [...document.querySelectorAll('header a[href="/admin"]')].length
  return { links, cta, adminInNav }
})()`)
// ② 登录 → admin 用户菜单徽章
await ev(`(async () => { await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }), credentials: 'include' }) })()`)
await send('Page.reload')
await sleep(2200)
out.navAdmin = await ev(`(() => {
  const menuBtn = [...document.querySelectorAll('header button, header [class*=menu], header [class*=user]')].find(b => /admin|admin|管理员|用户|帐户|账户/i.test(b.textContent) || b.querySelector('[class*=avatar]'))
  return { menuBtnFound: !!menuBtn, txt: menuBtn ? menuBtn.textContent.trim().slice(0, 24) : null }
})()`)
// ③ 首页枢纽：贴纸墙/未读/热帖/榜单/实时
out.hub = await ev(`(() => {
  const t = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim().slice(0, 40) : null }
  const wall = document.querySelector('[class*=announce], [class*=ann-wall], aside [class*=ann]')
  const hot = [...document.querySelectorAll('[class*=hot], [class*=topic]')].filter(e => e.textContent.includes('热') || e.textContent.includes('topic')).length
  const board = [...document.querySelectorAll('a[href*="/leaderboard"]')].length
  const live = document.body.textContent.match(/\\d+\\s*(在线|online|人)/i)
  return { wallFound: !!wall, wallText: wall ? wall.textContent.slice(0, 60) : null, hotBlocks: hot, boardLinks: board, liveText: live ? live[0] : null, asideSticky: (() => { const a = document.querySelector('aside'); return a ? getComputedStyle(a).position : null })() }
})()`)
// ④ 水位线复核：公告未读徽章 → 打开 → 清零 + open 事件广播
out.watermark = await ev(`(async () => {
  const badgeBefore = document.querySelector('[class*=unread], [class*=badge]')
  const before = badgeBefore ? badgeBefore.textContent.trim() : null
  let broadcast = false
  document.addEventListener('announce-open', () => { broadcast = true }, { once: true })
  document.addEventListener('announcement-open', () => { broadcast = true }, { once: true })
  const opener = [...document.querySelectorAll('button, [role=button], [class*=ann]')].find(e => /公告|announc/i.test(e.textContent) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 400)
  if (opener) opener.click()
  await new Promise(r => setTimeout(r, 800))
  const ls = localStorage.getItem('dsh_ann_read_max')
  const badgeAfter = document.querySelector('[class*=unread], [class*=badge]')
  return { before, after: badgeAfter ? badgeAfter.textContent.trim() : null, broadcast, lsSet: ls ? ls.slice(0, 12) : null, opened: !!document.querySelector('[class*=open], [class*=modal], [class*=dialog]') }
})()`)
// ⑤ 分面：抽屉/钉住/chips/OR-AND
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(2000)
out.facet = await ev(`(async () => {
  const btn = document.querySelector('.facet-btn')
  if (!btn) return { err: 'no facet-btn' }
  const btnText = btn.textContent.trim()
  btn.click()
  await new Promise(r => setTimeout(r, 500))
  const body = document.querySelector('.facet-body')
  const andOr = document.body.textContent.match(/(或|任选|OR).*(且|叠加|AND)/)
  const chips = [...document.querySelectorAll('[class*=chip-x], [class*=active-chip], [class*=chosen]')].length
  // 点一个值产生已选 chip
  const val = document.querySelector('.facet-body .tag-chip, .facet-body [class*=facet-val]')
  if (val) val.click()
  await new Promise(r => setTimeout(r, 600))
  const summary = [...document.querySelectorAll('[class*=summary], [class*=chosen], [class*=active-filters]')].map(e => e.textContent.trim().slice(0, 50)).slice(0, 3)
  // 钉住
  const pin = [...document.querySelectorAll('.facet-body button, .facet-body [class*=pin]')].find(b => /钉|pin/i.test(b.textContent) || /pin/i.test(String(b.className)))
  if (pin) pin.click()
  await new Promise(r => setTimeout(r, 500))
  const pinnedMode = document.querySelector('.facet-body--pinned') !== null
  return { btnText, drawerOpen: !!body, andOrText: andOr ? andOr[0].slice(0, 20) : null, summary, pinnedMode }
})()`)
out.facetShot = await shot('facet')
// ⑥ 空态出口 + ForumNew ?title= 链路
await send('Page.navigate', { url: `${BASE}/demos?tag=model%3Ano-such-model-xyz` })
await sleep(2000)
out.empty = await ev(`(() => {
  const box = document.querySelector('.dv-empty, .empty-box')
  const btns = [...document.querySelectorAll('.dv-empty button, .empty-box button, .dv-empty a, .empty-box a')].map(b => b.textContent.trim().slice(0, 16))
  return { emptyFound: !!box, exits: btns }
})()`)
// 去论坛求助 → ForumNew 预填
const askLink = await ev(`(() => { const a = [...document.querySelectorAll('a')].find(x => x.getAttribute('href')?.startsWith('/forum/new')); return a ? a.getAttribute('href') : null })()`)
if (askLink) {
  await send('Page.navigate', { url: BASE + askLink })
  await sleep(2000)
  out.forumNew = await ev(`(() => {
    const inp = document.querySelector('input[type=text], input:not([type])')
    const cat = document.body.textContent.match(/求助/)
    return { href: ${JSON.stringify(askLink)}, titleValue: inp ? inp.value.slice(0, 60) : null, hasAskCat: !!cat, path: location.pathname }
  })()`)
  out.forumNewShot = await shot('forumnew')
}
// ⑦ 404 相似猜测
await send('Page.navigate', { url: `${BASE}/demo/demo-c004ab5x` })
await sleep(2000)
out.nf404 = await ev(`(() => {
  const guess = document.body.textContent.match(/相似|猜你可能|也许|相近/)
  const entries = [...document.querySelectorAll('a[href="/demos"], a[href="/tags"], a[href="/leaderboard"], a[href="/forum"]')].length
  return { guessFound: !!guess, guessText: guess ? guess[0] : null, entryLinks: entries, path: location.pathname }
})()`)
out.nf404Shot = await shot('nf404')
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
