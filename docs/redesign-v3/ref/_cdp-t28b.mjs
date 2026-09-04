// T28-A2/B：水位线精测 + 分面精测（桌面）+ 移动段（bottom-sheet/动作条/抽屉同步）
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
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/t28-${n}.png`, Buffer.from(s.data, 'base64')) }

// ① 水位线精测（点贴纸墙公告卡→弹层→全读+emit open→HomeView 侧未读清零）
await send('Page.navigate', { url: `${BASE}/` })
await sleep(2200)
out.watermark = await ev(`(async () => {
  const before = (document.body.textContent.match(/(\\d+)\\s*条未读/) || [])[1] || null
  const lsBefore = localStorage.getItem('dsh_ann_read_max')
  // AnnouncementBlock 内的第一张公告卡（button/a）
  const card = [...document.querySelectorAll('aside button, aside a, [class*=announce] button, [class*=announce] a')].find(b => /公告|demo|发布|前|更新/.test(b.textContent) && b.getBoundingClientRect().width > 40)
  if (!card) return { err: 'no announce card', before }
  card.click()
  await new Promise(r => setTimeout(r, 900))
  const after = (document.body.textContent.match(/(\\d+)\\s*条未读/) || [])[1] || null
  const lsAfter = localStorage.getItem('dsh_ann_read_max')
  const modal = !!document.querySelector('[class*=modal], [class*=dialog], [class*=detail], [class*=drawer]')
  return { before, after, lsBefore, lsAfter, modalOpen: modal }
})()`)
// ② 分面精测（fp-grammar/fp-pin/tag-chip.active 摘要条）
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(2000)
out.facet = await ev(`(async () => {
  const r = {}
  const btn = document.querySelector('.facet-btn')
  btn.click()
  await new Promise(r2 => setTimeout(r2, 500))
  r.grammarTop = (document.body.textContent.match(/跨组叠加[^<]*=\\s*且|跨组叠加\\s*=\\s*且/) || [])[0] || null
  r.grammarOr = (document.body.textContent.match(/同组任选\\s*=\\s*或/) || [])[0] || null
  // 选一个值 → chips 摘要条
  const val = [...document.querySelectorAll('.facet-body .tag-chip')].find(c => !c.className.includes('active'))
  if (val) { const v = val.textContent.trim().slice(0, 20); val.click(); await new Promise(r2 => setTimeout(r2, 600)); r.pickedVal = v }
  r.summaryChips = [...document.querySelectorAll('.tag-chip.active')].map(c => c.textContent.trim().slice(0, 22)).slice(0, 5)
  r.facetCount = (document.querySelector('.facet-btn') || {}).textContent?.trim()
  // 钉住
  const pin = document.querySelector('.fp-pin')
  if (pin) { pin.click(); await new Promise(r2 => setTimeout(r2, 500)); r.pinned = document.querySelector('.facet-body--pinned') !== null; r.pinBtnText = pin.textContent.trim() }
  // 取消钉住还原
  const pin2 = document.querySelector('.fp-pin')
  if (pin2 && r.pinned) { pin2.click(); await new Promise(r2 => setTimeout(r2, 400)) }
  // 抽屉关闭（Esc 或按钮）
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await new Promise(r2 => setTimeout(r2, 400))
  r.closedByEsc = !document.querySelector('.facet-body:not(.facet-body--pinned)') || !getComputedStyle(document.querySelector('.facet-body')).position
  return r
})()`)
out.facetShot = await shot('facet2')
// ③ 移动段：375——抽屉 bottom-sheet 单组 + 移动抽屉导航同步 + Demo 动作条
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 740, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(2200)
out.mobileSheet = await ev(`(async () => {
  const r = {}
  // 抽屉导航（移动汉堡）同步：开抽屉看 6 项
  const tg = document.querySelector('.mobile-nav-toggle')
  if (tg) { tg.click(); await new Promise(r2 => setTimeout(r2, 500)) }
  const drawerLinks = [...document.querySelectorAll('.mobile-drawer a, [class*=mobile-drawer] a')].map(a => a.textContent.trim().slice(0, 8)).slice(0, 10)
  r.drawerLinks = drawerLinks
  const closeBtn = [...document.querySelectorAll('.mobile-drawer button, [class*=mobile-drawer] button, [class*=mobile-close]')][0]
  if (closeBtn) closeBtn.click()
  await new Promise(r2 => setTimeout(r2, 400))
  // 分面 bottom-sheet
  const fbtn = document.querySelector('.facet-btn')
  if (fbtn) { fbtn.click(); await new Promise(r2 => setTimeout(r2, 600)) }
  r.sheetMode = (() => { const b = document.querySelector('.facet-body'); if (!b) return null; const cs = getComputedStyle(b); return { pos: cs.position, bottom: cs.bottom, cls: String(b.className).slice(0, 60) } })()
  // 单组展开：点第二个组头看第一个是否收起
  const heads = [...document.querySelectorAll('.facet-body [class*=group-head], .facet-body details summary, .facet-body button[class*=fp-group]')]
  r.groupHeads = heads.length
  if (heads.length >= 2) {
    heads[0].click(); await new Promise(r2 => setTimeout(r2, 400))
    const s1Open = !!heads[0].closest('[class*=group]')?.querySelector('[class*=group-body]:not([style*="none"])') || heads[0].getAttribute('aria-expanded') === 'true'
    heads[1].click(); await new Promise(r2 => setTimeout(r2, 400))
    const s1After = heads[0].getAttribute('aria-expanded')
    r.singleGroupOpen = { s1Was: s1Open, s1AfterClickS2: s1After }
  }
  return r
})()`)
out.mobileShot = await shot('m-sheet')
// ④ Demo 动作条（375）
await send('Page.navigate', { url: `${BASE}/demo/demo-c004ab51` })
await sleep(2400)
out.actionBar = await ev(`(() => {
  const bar = [...document.querySelectorAll('[class*=action-bar], [class*=mob-act], [class*=uw], footer[class*=fixed]')].find(e => e.getBoundingClientRect().bottom >= innerHeight - 2 && e.getBoundingClientRect().height > 40)
  if (!bar) return { err: 'no action bar', fixed: [...document.querySelectorAll('body > div, body > nav, body > footer')].map(d => ({ cls: String(d.className).slice(0, 40), bottom: Math.round(d.getBoundingClientRect().bottom) })).slice(0, 6) }
  const cs = getComputedStyle(bar)
  const keys = [...bar.querySelectorAll('button, a')].map(b => ({ t: b.textContent.trim().slice(0, 8), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }))
  return { cls: String(bar.className).slice(0, 50), pos: cs.position, bottom: cs.bottom, safeArea: cs.paddingBottom || cs.bottom, keys, allGE44: keys.every(k => k.w >= 40 && k.h >= 44) }
})()`)
out.actionShot = await shot('actionbar')
// ⑤ web 型条件：动作条 DOM 存在性（web demo）——zip/link 型用 API 找一个验证无动作条（抽 3 页外 demo 若有）
const webKind = await ev(`(() => document.body.textContent.includes('重开') || document.body.textContent.includes('全屏'))()`)
out.actionBarWebKind = webKind
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
