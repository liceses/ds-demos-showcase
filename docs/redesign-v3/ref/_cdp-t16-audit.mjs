// t16 美化审计截图矩阵：页面×主题×宽度 —— 已知线索定点 + 自由扫描
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
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t16-${name}.png`, Buffer.from(s.data, 'base64'))
}
await send('Page.enable')

// 登录（mock admin）
await send('Page.navigate', { url: BASE + '/login' })
await wait(3200)
await ev(`(async () => {
  const set = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(document.querySelector('input:not([type="password"])'), 'admin'); set(document.querySelector('input[type="password"]'), 'admin123')
  ;[...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录|log ?in/i.test(b.textContent))?.click()
  await new Promise((r) => setTimeout(r, 2400))
  return 'ok'
})()`)

// 截图矩阵：page × theme × width
const PAGES = [
  ['home', '/'],
  ['works', '/demos'],
  ['leaderboard', '/leaderboard'],
  ['settings', '/settings'],
  ['admin', '/admin'],
  ['model', '/models'],
]
const WIDTHS = [1440, 375]
const THEMES = ['paper', 'ink']

// 几何量测辅助：右簇盒高残差
const measure = async (w) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 960, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: BASE + '/' })
  await wait(2600)
  const m = await ev(`(() => {
    const btns = [...document.querySelectorAll('.topbar .btn, .topbar .notif-bell, .topbar .user-menu-trigger')]
    const hs = btns.filter((b) => b.getClientRects().length > 0).map((b) => ({ t: b.textContent.trim().slice(0, 8), h: Math.round(b.getBoundingClientRect().height * 10) / 10, w: Math.round(b.getBoundingClientRect().width) }))
    const hero = document.querySelector('.hero, .page-hero, section')
    return { btns: hs }
  })()`)
  return m
}

for (const theme of THEMES) {
  for (const w of [1440, 375]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w === 375 ? 812 : 960, deviceScaleFactor: 1, mobile: false })
    for (const [name, path] of PAGES) {
      if (name === 'admin' && w === 375) continue
      if (name === 'model' && w === 375) continue
      await send('Page.navigate', { url: BASE + path })
      await wait(2400)
      // 主题切换：点主题钮（纸↔墨）
      if (theme === 'ink') {
        await ev(`(() => { const b = [...document.querySelectorAll('.topbar button')].find((x) => x.textContent.trim() === '墨' || x.textContent.trim() === '纸'); b?.click(); return 't' })()`)
        await wait(600)
      }
      await shot(`${name}-${w}-${theme}`)
    }
  }
}
console.log('MATRIX DONE')

// 右簇盒高残差定点量测（t9 线索）
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: BASE + '/' })
await wait(2600)
const gap1440 = await ev(`(() => {
  const btns = [...document.querySelectorAll('.topbar .btn, .topbar .notif-bell, .topbar .user-menu-trigger')]
  const vis = btns.filter((b) => b.getClientRects().length > 0).map((b) => ({ t: b.textContent.trim().slice(0, 6) || b.getAttribute('aria-label'), h: Math.round(b.getBoundingClientRect().height * 10) / 10 }))
  return vis
})()`)
console.log('右簇盒高 @1440:', JSON.stringify(gap1440))
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 960, deviceScaleFactor: 1, mobile: false })
await wait(600)
const gap375 = await ev(`(() => {
  const btns = [...document.querySelectorAll('.topbar .btn')]
  return btns.filter((b) => b.getClientRects().length > 0).map((b) => ({ t: b.textContent.trim().slice(0, 6), h: Math.round(b.getBoundingClientRect().height * 10) / 10 }))
})()`)
console.log('右簇盒高 @375:', JSON.stringify(gap375))
ws.close()
console.log('AUDIT SWEEP DONE')