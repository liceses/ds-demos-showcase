// t4 验证探针（mock 5180 / CDP 9334，admin 登录态全 SPA）
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
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t4-${name}.png`, Buffer.from(s.data, 'base64'))
}
const wait2 = async (ms) => wait(ms)
await send('Page.enable')

// 登录 admin（mock：admin/admin123）
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: BASE + '/login' })
await wait(3000)
const login = await ev(`(async () => {
  const u = document.querySelector('input[type="text"], input:not([type="password"])')
  const p = document.querySelector('input[type="password"]')
  const set = (el, v) => { el.focus(); el.value = ''; document.execCommand('insertText', false, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(u, 'admin'); set(p, 'admin123')
  const btn = [...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录/.test(b.textContent))
  btn.click()
  await new Promise((r) => setTimeout(r, 2200))
  return { nowAt: location.pathname, loggedIn: !!document.querySelector('.user-menu-trigger, .admin-shell') }
})()`)
console.log('login:', JSON.stringify(login))

// SPA 进工作台概览台
await ev(`document.querySelector('a[href="/admin"], .user-menu-panel a[href="/admin"]')?.click() || (location.hash = '', history.pushState({}, '', '/admin'))`)
await wait2(600)
await ev(`document.querySelectorAll('.admin-side a, .ad-nav a, nav a[href="/admin"]').forEach(a => a.click()); 'nav'`)
await wait2(1200)
// 若还没进 /admin：用顶栏用户菜单里的管理工作台
await ev(`(() => { const t = document.querySelector('.user-menu-trigger'); if (t && !/admin/.test(location.pathname)) { t.click(); setTimeout(() => document.querySelector('.user-menu-panel a[href="/admin"]')?.click(), 120) } return 'ok' })()`)
await wait2(3000)
console.log('at:', await ev('location.pathname + location.search'))

// ---- 概览台：池卡 + inbox 卡 kind 链 ----
const consoleProbe = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const pool = q('.ac-pool')
  const cs = pool ? getComputedStyle(pool) : null
  const flag = q('.ac-pool-flag')
  return {
    onConsole: location.pathname + location.search,
    poolPresent: !!pool,
    poolText: pool ? pool.textContent.replace(/\\s+/g, ' ').trim().slice(0, 160) : null,
    poolRedBorder: cs ? cs.borderLeftWidth : null,
    poolRedFlag: flag ? flag.textContent.trim().slice(0, 40) : null,
    poolGoBtn: !!q('.ac-pool button'),
    inboxCardKindChips: [...document.querySelectorAll('.ac-kind')].map((b) => b.textContent.trim()),
    inboxBatchBtn: [...document.querySelectorAll('.ac-card .btn')].map((b) => b.textContent.trim()).slice(0, 3),
    totalWaiting: q('.ac-total') ? q('.ac-total').textContent.trim() : null,
  }
})()`)
console.log('console:', JSON.stringify(consoleProbe, null, 1))
await shot('console-pool')

// ---- kind 直达深链：点击 retag_demo chip → ?tab=inbox&filter=retag_demo ----
await ev(`[...document.querySelectorAll('.ac-kind')].find(b => /类型细分|Refine type/.test(b.textContent))?.click(); 'chip'`)
await wait2(2600)
const deepLink = await ev(`(() => {
  const q = (s) => document.querySelector(s)
  const kindSel = [...document.querySelectorAll('select')].map((s) => s.value)
  const rows = [...document.querySelectorAll('.inbox-row')]
  return {
    url: location.pathname + location.search,
    kindSections: [...document.querySelectorAll('.inbox-kind-head b')].map((b) => b.textContent.trim()),
    rowCount: rows.length,
    allRetag: rows.every((r) => r.textContent.includes('类型细分')),
    firstBrief: rows[0] ? rows[0].querySelector('.inbox-brief')?.textContent.trim().slice(0, 40) : null,
    checkboxes: document.querySelectorAll('.inbox-check input').length,
  }
})()`)
console.log('deepLink:', JSON.stringify(deepLink, null, 1))
await shot('inbox-filter-retag')

// ---- 全选 retag 节 → 批量批准 → 进度 → 完成 ----
await ev(`[...document.querySelectorAll('.inbox-kind-head')].find(h => /类型细分/.test(h.textContent))?.querySelector('button')?.click(); 'sel'`)
await wait2(600)
const selProbe = await ev(`(() => ({
  batchBarText: document.querySelector('.inbox-batch')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120) || null,
  pickedRows: document.querySelectorAll('.inbox-row.inbox-picked').length,
}))()`)
console.log('selected:', JSON.stringify(selProbe))
await shot('inbox-batch-bar')

// 确认弹窗 → 批准
await ev(`[...document.querySelectorAll('.inbox-batch button')].find(b => /批量批准/.test(b.textContent))?.click(); 'go'`)
await wait2(800)
const confirmProbe = await ev(`(() => {
  const modal = document.querySelector('.modal, [class*="confirm"]')
  const btns = [...document.querySelectorAll('button')].map((b) => b.textContent.trim())
  return { modalText: modal ? modal.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200) : null, hasConfirm: btns.some((b) => /批量批准|批准/.test(b)) }
})()`)
console.log('confirm:', JSON.stringify(confirmProbe))
await shot('batch-confirm')
// 点确认弹窗内的 批量批准
await ev(`[...document.querySelectorAll('button')].filter(b => /批量批准/.test(b.textContent)).pop()?.click(); 'ok'`)
await wait2(3500)
const afterBatch = await ev(`(() => ({
  url: location.pathname + location.search,
  toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 80) || null,
  kindSections: [...document.querySelectorAll('.inbox-kind-head b')].map((b) => b.textContent.trim()),
  pendingChips: [...document.querySelectorAll('.tag-chip.mode-open')].map((c) => c.textContent.replace(/\\s+/g, ' ').trim()).slice(0, 6),
  rowCount: document.querySelectorAll('.inbox-row').length,
}))()`)
console.log('afterBatch:', JSON.stringify(afterBatch, null, 1))
await shot('inbox-after-batch')

ws.close()
console.log('PROBE4 DONE')