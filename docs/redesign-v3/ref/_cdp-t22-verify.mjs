// t22 三视角验证：游客 / 普通用户(alice) / admin(=作者)——APPROVED 可见性 + 双区栅格几何 + 收起展开零位移
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

const MEASURE = `(() => {
  const g = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const stage = g('.dv-stage'), facts = g('.dv-facts'), desc = g('.dv-desc-card'), rail = g('.dv-rail'), iframe = g('.preview-shell .preview-frame') || g('.dv-stage iframe')
  return {
    stage: stage, desc: desc, facts: facts, rail: rail,
    sameWidth: stage && desc ? stage.w === desc.w : null,
    gapDescFromStage: stage && desc ? Math.round(desc.y - (stage.y + stage.h)) : null,
    factsOverlapIframe: facts && iframe ? Math.max(0, Math.min(facts.x + facts.w, iframe.x + iframe.w) - Math.max(facts.x, iframe.x)) : 0,
    chip: (() => { const e = document.querySelector('.dv-facts-head .eyebrow'); return e ? e.textContent.trim() : '(hidden)' })(),
    slotW: (() => { const f = g('.dv-facts') || g('.dv-rail'); return f ? f.w : null })(),
    who: (() => { try { return JSON.parse(localStorage.getItem('dsh_user') || localStorage.getItem('user') || 'null')?.username || 'guest' } catch { return 'guest' } })()
  }
})()`

async function gotoAs(label, cred) {
  // 登录/登出 → 进页 → 等 mock 加载
  await send('Page.navigate', { url: 'http://localhost:5173/' })
  await new Promise((r) => setTimeout(r, 1800))
  await ev(`(() => { localStorage.clear(); return 'cleared' })()`)
  if (cred) {
    const res = await ev(`fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(cred)}) }).then(r => r.json()).then(j => JSON.stringify({ ok: !!j.token || !!j.access_token, keys: Object.keys(j) })).catch(e => 'ERR:' + e.message)`)
    console.log(label + ' login → ' + res)
  }
  await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
  await new Promise((r) => setTimeout(r, 2500))
  // 硬重置：再清一次 + 二次 reload（杀同标签页跨导航的 auth 缓存竞态）
  await ev(`(() => { localStorage.clear(); location.reload(); return 'reset' })()`)
  await new Promise((r) => setTimeout(r, 2500))
  const m1 = await ev(MEASURE)
  console.log(label + ' EXPANDED ' + JSON.stringify(m1, null, 1))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t22-${label}.png`, Buffer.from(shot.data, 'base64'))
  // 收起 → 再量（零位移验收）
  await ev(`(() => { const b = [...document.querySelectorAll('.dv-collapse')][0]; if (b) b.click(); return 'ok' })()`)
  await new Promise((r) => setTimeout(r, 500))
  const m2 = await ev(MEASURE)
  const push = m1.stage && m2.stage ? { wDelta: m2.stage.w - m1.stage.w, xDelta: m2.stage.x - m1.stage.x, descYDelta: (m2.desc?.y ?? 0) - (m1.desc?.y ?? 0) } : null
  console.log(label + ' COLLAPSED rail=' + JSON.stringify(m2.rail) + ' PUSH ' + JSON.stringify(push))
  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t22-${label}-collapsed.png`, Buffer.from(shot2.data, 'base64'))
  return { m1, push }
}

const guest = await gotoAs('guest', null)
const alice = await gotoAs('alice', { username: 'alice', password: 'password' })
const admin = await gotoAs('admin', { username: 'admin', password: 'admin123' })
console.log('SUMMARY ' + JSON.stringify({
  guestChip: guest.m1.chip, aliceChip: alice.m1.chip, adminChip: admin.m1.chip,
  sameWidth: [guest.m1.sameWidth, alice.m1.sameWidth, admin.m1.sameWidth],
  overlap: [guest.m1.factsOverlapIframe, alice.m1.factsOverlapIframe, admin.m1.factsOverlapIframe],
  pushAll: [guest.push, alice.push, admin.push],
}, null, 1))
ws.close()
