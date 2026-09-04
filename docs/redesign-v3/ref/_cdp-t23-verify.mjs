// t23 验证：①收起=竖轨悬浮右缘+预览全宽=顶栏同宽 ②展开=380 槽+内容列同步收窄+三者同宽
// ③列宽变化 0ms 硬切（无补间中间帧）④sticky/快捷键 I/localStorage/移动端/APPROVED 保留
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
await send('Page.enable')
await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

const MEASURE = `(() => {
  const g = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position } }
  const stage = g('.dv-stage'), desc = g('.dv-desc-card'), facts = g('.dv-facts'), rail = g('.dv-rail'), iframe = g('.preview-shell .preview-frame') || g('.dv-stage iframe')
  const chip = document.querySelector('.dv-facts-head .eyebrow')
  const shell = document.querySelector('.dv-shell')
  return {
    collapsed: String(!!rail && !facts),
    rail: rail, facts: facts,
    stageW: stage?.w, descW: desc?.w, sameWidth: stage && desc ? stage.w === desc.w : null,
    topbarW: (() => { const t = document.querySelector('.topbar'); return t ? Math.round(t.getBoundingClientRect().width) : null })(),
    gapDesc: stage && desc ? Math.round(desc.y - (stage.y + stage.h)) : null,
    chip: chip ? chip.textContent.trim() : '(hidden)',
    shellTransition: shell ? getComputedStyle(shell).transitionProperty + '/' + getComputedStyle(shell).transitionDuration : null,
    iframeWidthTransition: (() => { const f = document.querySelector('.preview-shell .preview-frame'); return f ? getComputedStyle(f).transitionProperty : null })(),
  }
})()`

// —— 腿 1：游客（布局四点 + 0ms 硬切 + sticky + 快捷键 + localStorage）——
await ev(`(() => { localStorage.clear(); return 'ls' })()`)
await send('Network.clearBrowserCookies')
await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
await new Promise((r) => setTimeout(r, 3200))
await ev(`(() => { localStorage.setItem('demo.factsOpen', '1'); location.reload(); return 'r' })()`)
await new Promise((r) => setTimeout(r, 3000))
const exp = await ev(MEASURE)
console.log('EXPANDED ' + JSON.stringify(exp, null, 1))
const s1 = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t23-expanded.png', Buffer.from(s1.data, 'base64'))

// 收起 + **立即帧宽测量**（0ms 硬切：下一帧即终值，无补间）
const t0 = await ev(`(() => { const b = [...document.querySelectorAll('.dv-collapse')][0]; if (b) b.click(); const s = document.querySelector('.dv-stage').getBoundingClientRect().width; return Math.round(s) })()`)
const t1 = await ev(`(() => Math.round(document.querySelector('.dv-stage').getBoundingClientRect().width))()`)
console.log('HARDCUT firstFrameW=' + t0 + ' nextW=' + t1 + ' (相等=0ms 硬切，无补间中间帧)')
const col = await ev(MEASURE)
console.log('COLLAPSED ' + JSON.stringify(col, null, 1))
const s2 = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t23-collapsed.png', Buffer.from(s2.data, 'base64'))

// sticky 跟随：滚 400 → 轨与预览仍在视口（fixed/sticky 生效）
const stick = await ev(`(async () => { window.scrollTo(0, 400); await new Promise(r => setTimeout(r, 300)); const rail = document.querySelector('.dv-rail'), stage = document.querySelector('.dv-stage'); return { scrollY: window.scrollY, railY: rail ? Math.round(rail.getBoundingClientRect().y) : null, stageY: stage ? Math.round(stage.getBoundingClientRect().y) : null } })()`)
console.log('STICKY ' + JSON.stringify(stick))
window0: {
  await ev(`(() => { window.scrollTo(0, 0); return 'top' })()`)
}
// 快捷键 I：收起↔展开
const k1 = await ev(`(() => { const before = !!document.querySelector('.dv-facts'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true })); return { before, dispatched: true } })()`)
await new Promise((r) => setTimeout(r, 400))
const k2 = await ev(`(() => ({ factsNow: !!document.querySelector('.dv-facts'), ls: localStorage.getItem('demo.factsOpen') }))()`)
console.log('KEY_I ' + JSON.stringify({ ...k1, ...k2 }))
// localStorage 记忆：刷新后保持
await ev(`(() => location.reload(); 'r')()`)
await new Promise((r) => setTimeout(r, 3000))
const mem = await ev(`(() => ({ factsNow: !!document.querySelector('.dv-facts'), ls: localStorage.getItem('demo.factsOpen') }))()`)
console.log('MEMORY ' + JSON.stringify(mem))

// —— 腿 2/3：APPROVED 三视角（应用内表单登录）——
async function leg(label, cred) {
  await ev(`(() => { localStorage.clear(); return 'ls' })()`)
  await send('Network.clearBrowserCookies')
  await send('Page.navigate', { url: 'http://localhost:5173/login' })
  await new Promise((r) => setTimeout(r, 2200))
  if (cred) {
    await ev(`(() => { const u = document.querySelector('input[type=text], input:not([type=password]):not([type=hidden])'); const p = document.querySelector('input[type=password]'); u.value = ${JSON.stringify(cred.username)}; u.dispatchEvent(new Event('input', { bubbles: true })); p.value = ${JSON.stringify(cred.password)}; p.dispatchEvent(new Event('input', { bubbles: true })); const b = [...document.querySelectorAll('button')].find((x) => x.type === 'submit') || document.querySelector('button'); b.click(); return 'ok' })()`)
    await new Promise((r) => setTimeout(r, 1400))
  }
  await ev(`(() => { localStorage.setItem('demo.factsOpen', '1'); history.pushState({}, '', '/demo/demo-c004ab51'); window.dispatchEvent(new PopStateEvent('popstate')); return 'nav' })()`)
  await new Promise((r) => setTimeout(r, 2600))
  const m = await ev(MEASURE)
  console.log(label + ' chip=' + m.chip + ' sameWidth=' + m.sameWidth)
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t23-${label}.png`, Buffer.from(s.data, 'base64'))
  return m.chip
}
const aliceChip = await leg('alice', { username: 'alice', password: 'password' })
const adminChip = await leg('admin', { username: 'admin', password: 'admin123' })
console.log('T23-RESULT ' + JSON.stringify({ expSameWidth: exp.sameWidth, expSlot: exp.facts?.w, colFullW: col.stageW, colRail: col.rail, aliceChip, adminChip }, null, 1))
ws.close()
