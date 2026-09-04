// t7 补充探针 v2：Tag 详情（置灰待后端标注）+ EN 抽查（mock 5180 / CDP 9334）——逐步诊断版
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
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t6-${name}.png`, Buffer.from(s.data, 'base64'))
}
await send('Page.enable')
await send('Runtime.enable')
const consoleErrs = []
ws.onmessage = (() => { const orig = ws.onmessage; return (ev) => { orig(ev); try { const m = JSON.parse(ev.data); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200)) } catch {} } })()
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__vueErrs = []; window.addEventListener("error", function (e) { var m = String(e.message).slice(0, 100); var loc = e.filename && e.lineno ? e.filename.split("/").pop() + ":" + e.lineno : `; window.__vueErrs.push(loc + ` " + m) }); window.addEventListener("unhandledrejection", function (e) { window.__vueErrs.push(String(e.reason && e.reason.message || e.reason).slice(0, 120)) })' })
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

await send('Page.navigate', { url: BASE + '/login' })
await wait(3200)
const d1 = await ev(`({ at: location.pathname, hasUser: !!document.querySelector('input:not([type="password"])'), hasPass: !!document.querySelector('input[type="password"]') })`)
console.log('step0 login-page:', JSON.stringify(d1))

const d2 = await ev(`(async () => {
  const u = document.querySelector('input:not([type="password"])')
  const p = document.querySelector('input[type="password"]')
  const set = (el, v) => { el.focus(); el.value = ''; document.execCommand('insertText', false, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  try { set(u, 'admin'); set(p, 'admin123') } catch (e1) { return { caughtSet: String(e1 && e1.message || e1) } }
  const btn = [...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录|log ?in/i.test(b.textContent))
  if (!btn) return { caughtBtn: 'no submit btn' }
  btn.click()
  await new Promise((r) => setTimeout(r, 2400))
  return { at: location.pathname, loggedIn: !!document.querySelector('.user-menu-trigger'), err: document.querySelector('.notice-error')?.textContent.trim().slice(0, 60) || null }
})()`)
console.log('step1 login:', JSON.stringify(d2))
if (!d2.loggedIn) { console.log('LOGIN FAILED — abort'); ws.close(); process.exit(0) }

// SPA: 用户菜单 → 管理工作台
const d3 = await ev(`(async () => {
  document.querySelector('.user-menu-trigger')?.click()
  await new Promise((r) => setTimeout(r, 600))
  const link = document.querySelector('.user-menu-panel a[href="/admin"]')
  if (!link) return { panel: false, at: location.pathname }
  link.click()
  await new Promise((r) => setTimeout(r, 3000))
  return { panel: true, at: location.pathname + location.search }
})()`)
console.log('step2 to-admin:', JSON.stringify(d3))

const d4 = await ev(`(() => { const t = [...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === '实体总表'); t?.click(); return { found: !!t } })()`)
await wait(2800)
console.log('step3 entities-tab:', JSON.stringify(d4), 'at', await ev('location.pathname + location.search'))

await ev(`[...document.querySelectorAll('.filter-row .btn')].find((b) => /标签值|Tag values/i.test(b.textContent))?.click(); 'facet'`)
await wait(2800)
const d5 = await ev(`(() => ({ rows: document.querySelectorAll('.ent-row').length, first: document.querySelector('.ent-row')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) || null }))()`)
console.log('step4 tag-list:', JSON.stringify(d5))
await shot('05a-tag-list')

await ev(`document.querySelector('.ent-row')?.click(); 'row'`)
await wait(3200)
const d6 = await ev(`(() => ({
  url: location.pathname + location.search,
  zones: [...document.querySelectorAll('.kc-zone-title')].map((z) => z.textContent.trim()),
  pendingMarks: [...document.querySelectorAll('.kc-pending')].map((p) => p.textContent.trim().slice(0, 46)),
  editBtn: [...document.querySelectorAll('.kc-zone-head .btn')].map((b) => b.textContent.trim()),
  stateStrip: document.querySelectorAll('.kc-state').length,
  groupInput: !!document.querySelector('.kc-field input.input'),
  err: document.querySelector('.notice-error')?.textContent.trim().slice(0, 80) || null,
  listRowsStill: document.querySelectorAll('.ent-row').length,
  loadingRow: !!document.querySelector('.loading-row, [class*="loading"'),
  detailRoot: !!document.querySelector('.kc-zone, .kc-zone-head'),
  vueErrs: (window.__vueErrs || []).slice(-2),
  stamp: document.querySelector('.kc-summary')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) || null,
}))()`)
console.log('step5 tag-detail:', JSON.stringify(d6, null, 1));
console.log('console-errs:', JSON.stringify(consoleErrs.slice(-4)))
await shot('05-detail-tag-pending')

await ev(`(() => { const b = [...document.querySelectorAll('.topbar button')].find((x) => x.textContent.trim() === 'EN'); b?.click(); return 'en' })()`)
await wait(1600)
const d7 = await ev(`(() => ({
  facet: [...document.querySelectorAll('.filter-row .btn')].map((b) => b.textContent.trim()).slice(0, 3),
  zones: [...document.querySelectorAll('.kc-zone-title')].map((z) => z.textContent.trim()).slice(0, 5),
}))()`)
console.log('step6 en:', JSON.stringify(d7))
ws.close()
console.log('PROBE6B DONE')