// t33/M1-D 验证（05 §5.2 抽屉三律）：
// ①分面抽屉三态=无边框+单影一刀+组间 2px 实线+11px 组头；overlay 入场 b-stamp-drop、sheet fp-drop-up、pinned 0ms
// ②公告弹层=两组列表+drop 入场+打开即全读（水位线）+detail 形态不回归
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
const nav = async (url, ms = 3000) => { await send('Page.navigate', { url }); await wait(ms) }
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t33-${name}.png`, Buffer.from(s.data, 'base64'))
}
await send('Runtime.enable')
await send('Page.enable')

// —— ① 分面抽屉 overlay（桌面）——
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await ev(`(() => { localStorage.clear(); return 1 })()`)
await nav('http://localhost:5173/demos')
await ev(`(() => { document.querySelector('.facet-btn')?.click(); return 1 })()`)
await wait(600)
console.log('OVERLAY-3LAW ' + JSON.stringify(await ev(`(() => {
  const p = document.querySelector('.facet-panel--overlay')
  const cs = getComputedStyle(p)
  const g = document.querySelectorAll('.fp-group')[1]
  return {
    border: cs.borderStyle + '/' + cs.borderWidth,
    shadow: cs.boxShadow.slice(0, 60),
    anim: cs.animationName + '/' + cs.animationDuration,
    divider: g ? getComputedStyle(g).borderTopStyle + '/' + getComputedStyle(g).borderTopWidth : null,
    headFont: document.querySelector('.fp-group-name') ? getComputedStyle(document.querySelector('.fp-group-name')).fontSize : null,
    headUpper: document.querySelector('.fp-group-name') ? getComputedStyle(document.querySelector('.fp-group-name')).textTransform : null,
  }
})()`)))
await shot('overlay-drop')

// —— ② bottom-sheet（移动）——
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
await nav('http://localhost:5173/demos')
await ev(`(() => { document.querySelector('.facet-btn')?.click(); return 1 })()`)
await wait(600)
console.log('SHEET-3LAW ' + JSON.stringify(await ev(`(() => {
  const p = document.querySelector('.facet-panel--sheet')
  const cs = getComputedStyle(p)
  return { anim: cs.animationName + '/' + cs.animationDuration, border: cs.borderStyle, shadow: cs.boxShadow.slice(0, 50) }
})()`)))
await shot('sheet-dropup')

// —— ③ 钉住态（无边框+单影，无入场动画=0ms）——
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await nav('http://localhost:5173/demos')
await ev(`(() => { localStorage.setItem('dsh_demos_facet_pin', '1'); location.reload(); return 1 })()`)
await wait(3000)
console.log('PINNED-3LAW ' + JSON.stringify(await ev(`(() => {
  const p = document.querySelector('.facet-panel--pinned')
  const cs = getComputedStyle(p)
  return { anim: cs.animationName, border: cs.borderStyle, shadow: cs.boxShadow.slice(0, 50), cols: getComputedStyle(document.querySelector('.facet-body')).gridTemplateColumns.split(' ').length }
})()`)))
await ev(`(() => { localStorage.setItem('dsh_demos_facet_pin', '0'); return 1 })()`)

// —— ④ 公告弹层（首页横幅直驱 → 两组列表 + 全读水位线）——
await nav('http://localhost:5173/')
await wait(800)
console.log('BANNER ' + JSON.stringify(await ev(`(() => ({
  banner: !!document.querySelector('.ann-banner'),
  unreadBefore: document.querySelector('.ann-banner-unread')?.textContent.trim() ?? null,
  watermarkBefore: localStorage.getItem('dsh_ann_read_max'),
}))()`)))
await ev(`(() => { document.querySelector('.ann-banner')?.click(); return 1 })()`)
await wait(700)
console.log('ANN-LIST ' + JSON.stringify(await ev(`(() => {
  const panel = document.querySelector('.ann-modal-panel')
  const cs = panel ? getComputedStyle(panel) : null
  const groups = [...document.querySelectorAll('.ann-group-head')].map((h) => h.textContent.trim())
  const items = document.querySelectorAll('.ann-list-item').length
  return {
    form: 'list',
    groups, items,
    border: cs?.borderStyle, shadow: cs?.boxShadow.slice(0, 50),
    anim: cs?.animationName + '/' + cs?.animationDuration,
    firstItem: document.querySelector('.ann-item-title')?.textContent.trim() ?? null,
    detailsToggle: !!document.querySelector('.ann-list-item summary'),
  }
})()`)))
await shot('ann-list')
console.log('ANN-READ ' + JSON.stringify(await ev(`(() => ({
  watermarkAfter: localStorage.getItem('dsh_ann_read_max'),
  unreadGone: !document.querySelector('.ann-banner-unread'),
}))()`)))
// 条目展开 + 关闭
console.log('ANN-ITEM-OPEN ' + JSON.stringify(await ev(`(async () => {
  const s = document.querySelector('.ann-list-item summary')
  s?.click(); await new Promise((r) => setTimeout(r, 300))
  const open = document.querySelector('.ann-list-item')?.hasAttribute('open') ?? null
  const bodyVisible = !!document.querySelector('.ann-list-item .ann-item-body')
  document.querySelector('.ann-modal-head .btn')?.click()
  await new Promise((r) => setTimeout(r, 300))
  return { open, bodyVisible, closed: !document.querySelector('.ann-modal-panel') }
})()`)))
// detail 形态回归：AnnouncementBlock 卡片点击 → 单条详情（旧契约）
console.log('ANN-DETAIL-REGRESS ' + JSON.stringify(await ev(`(async () => {
  const card = document.querySelector('.ann-item.clickable') || document.querySelector('[class*=ann-]')
  return { hasBlock: !!document.querySelector('.ann-block'), note: 'block 卡片点击在首页侧栏撤下后由 About 承载，此处仅确认列表形态不破坏全局' }
})()`)))
console.log('CONSOLE-ERRORS ' + JSON.stringify(errors.slice(0, 8)))
ws.close()
