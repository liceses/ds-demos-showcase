// t7 追加验证：管理员直建题目（mock 5180 / CDP 9334）——入口/表单/置灰标注/创建落表
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

await send('Page.navigate', { url: BASE + '/login' })
await wait(3200)
const d1 = await ev(`(async () => {
  const u = document.querySelector('input:not([type="password"])')
  const p = document.querySelector('input[type="password"]')
  const set = (el, v) => { el.focus(); el.value = ''; document.execCommand('insertText', false, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(u, 'admin'); set(p, 'admin123')
  ;[...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录|log ?in/i.test(b.textContent))?.click()
  await new Promise((r) => setTimeout(r, 2400))
  document.querySelector('.user-menu-trigger')?.click()
  await new Promise((r) => setTimeout(r, 600))
  document.querySelector('.user-menu-panel a[href="/admin"]')?.click()
  await new Promise((r) => setTimeout(r, 3000))
  return { at: location.pathname }
})()`)
console.log('login+admin:', JSON.stringify(d1))

await ev(`[...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === '实体总表' || x.textContent.trim() === 'Entities')?.click(); 'go'`)
await wait(2800)

// 切题目 facet（双语）→ 点新建题目
await ev(`[...document.querySelectorAll('.filter-row .btn')].find((b) => /题目|Tasks/i.test(b.textContent))?.click(); 'facet'`)
await wait(2400)
const entry = await ev(`(() => { const b = [...document.querySelectorAll('.filter-row .btn')].find((x) => /新建题目|New task/i.test(x.textContent)); b?.click(); return { found: !!b } })()`)
await wait(600)
const form = await ev(`(() => ({
  formOpen: !!document.querySelector('.kc-task-form'),
  pendingNote: document.querySelector('.kc-task-form .kc-pending')?.textContent.trim().slice(0, 60) || null,
  inputs: document.querySelectorAll('.kc-task-form input').length,
  note: document.querySelector('.kc-task-form .hint')?.textContent.trim().slice(0, 70) || null,
}))()`)
console.log('form:', JSON.stringify(form, null, 1))
await shot('06-new-task-form')

// 填表创建
const created = await ev(`(async () => {
  const inputs = [...document.querySelectorAll('.kc-task-form input')]
  const set = (el, v) => { el.focus(); el.value = ''; document.execCommand('insertText', false, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(inputs[0], 'T7 直建验证题')
  const ta = document.querySelector('.kc-task-form textarea')
  if (ta) set(ta, '管理员直建验证（不经候选队列）')
  ;[...document.querySelectorAll('.kc-task-form button')].find((b) => /创建题目|Create task/i.test(b.textContent))?.click()
  await new Promise((r) => setTimeout(r, 2400))
  return {
    toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 50) || null,
    facetNow: [...document.querySelectorAll('.filter-row .btn')].find((b) => b.classList.contains('btn-primary'))?.textContent.trim(),
    rows: document.querySelectorAll('.ent-row').length,
    createdRow: [...document.querySelectorAll('.ent-row')].find((r) => /T7 直建验证题/.test(r.textContent))?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) || null,
  }
})()`)
console.log('created:', JSON.stringify(created, null, 1))
await shot('07-task-created')
ws.close()
console.log('PROBE7 DONE')