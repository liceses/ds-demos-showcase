// t22 三视角终版验证：走应用内 mock 登录（表单），SPA popstate 导航保内存登录态
// 视角：guest（游客）/ alice（普通用户·非作者）/ admin（admin=本文作者 + isAdmin）
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
  const g = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const stage = g('.dv-stage'), facts = g('.dv-facts'), desc = g('.dv-desc-card'), iframe = g('.preview-shell .preview-frame') || g('.dv-stage iframe')
  const chip = document.querySelector('.dv-facts-head .eyebrow')
  return {
    chip: chip ? chip.textContent.trim() : '(hidden)',
    stageW: stage?.w, descW: desc?.w, sameWidth: stage && desc ? stage.w === desc.w : null,
    gapDescFromStage: stage && desc ? Math.round(desc.y - (stage.y + stage.h)) : null,
    factsOverlapIframe: facts && iframe ? Math.max(0, Math.min(facts.x + facts.w, iframe.x + iframe.w) - Math.max(facts.x, iframe.x)) : 0,
    slotX: (facts || g('.dv-rail'))?.x, slotW: (facts || g('.dv-rail'))?.w,
  }
})()`

async function leg(label, cred) {
  await ev(`(() => { localStorage.clear(); return 'ls' })()`)
  await send('Network.clearBrowserCookies')
  await send('Page.navigate', { url: 'http://localhost:5173/login' })
  await new Promise((r) => setTimeout(r, 2200))
  if (cred) {
    const r = await ev(`(() => {
      const user = document.querySelector('input[type=text], input:not([type=password]):not([type=hidden])')
      const pass = document.querySelector('input[type=password]')
      if (!user || !pass) return 'no-form'
      user.value = ${JSON.stringify(cred.username)}; user.dispatchEvent(new Event('input', { bubbles: true }))
      pass.value = ${JSON.stringify(cred.password)}; pass.dispatchEvent(new Event('input', { bubbles: true }))
      const btn = [...document.querySelectorAll('button')].find((b) => b.type === 'submit') || document.querySelector('button')
      btn.click()
      return 'submitted'
    })()`)
    console.log(label + ' form-login → ' + r)
    await new Promise((r2) => setTimeout(r2, 1400))
  }
  // SPA 导航到 demo（保内存登录态）：pushState + popstate
  await ev(`(() => { localStorage.setItem('demo.factsOpen', '1'); history.pushState({}, '', '/demo/demo-c004ab51'); window.dispatchEvent(new PopStateEvent('popstate')); return 'nav' })()`)
  await new Promise((r) => setTimeout(r, 2600))
  const m1 = await ev(MEASURE)
  console.log(label + ' EXPANDED ' + JSON.stringify(m1, null, 1))
  const s1 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t22-${label}.png`, Buffer.from(s1.data, 'base64'))
  await ev(`(() => { const b = [...document.querySelectorAll('.dv-collapse')][0]; if (b) b.click(); return 'ok' })()`)
  await new Promise((r) => setTimeout(r, 500))
  const m2 = await ev(MEASURE)
  const push = m1.stageW != null ? { wDelta: m2.stageW - m1.stageW, sameWidthAfter: m2.sameWidth, railInSlot: m2.slotW } : null
  console.log(label + ' PUSH ' + JSON.stringify(push))
  const s2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t22-${label}-collapsed.png`, Buffer.from(s2.data, 'base64'))
  return { chip: m1.chip, sameWidth: m1.sameWidth, overlap: m1.factsOverlapIframe, gap: m1.gapDescFromStage, push }
}

const out = {}
out.guest = await leg('guest', null)
out.alice = await leg('alice', { username: 'alice', password: 'password' })
out.admin = await leg('admin', { username: 'admin', password: 'admin123' })
console.log('SUMMARY ' + JSON.stringify(out, null, 1))
ws.close()
