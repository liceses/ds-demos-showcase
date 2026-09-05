// 建题+初始挂载逐步诊断
const CDP = 9334
const BASE = 'http://localhost:5180'
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
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: BASE + '/login' })
await wait(3200)
await ev(`(async () => {
  const set = (el, v) => { el.focus(); el.value = ''; document.execCommand('insertText', false, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(document.querySelector('input:not([type="password"])'), 'admin'); set(document.querySelector('input[type="password"]'), 'admin123')
  ;[...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录|log ?in/i.test(b.textContent))?.click()
  await new Promise((r) => setTimeout(r, 2400))
  document.querySelector('.user-menu-trigger')?.click(); await new Promise((r) => setTimeout(r, 600))
  document.querySelector('.user-menu-panel a[href="/admin"]')?.click(); await new Promise((r) => setTimeout(r, 3000))
  return 'ok'
})()`)
await ev(`[...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === '实体总表' || x.textContent.trim() === 'Entities')?.click(); 'go'`)
await wait(2600)
// 语言置 zh（消 EN 干扰）
await ev(`(() => { const b = [...document.querySelectorAll('.topbar button')].find((x) => x.textContent.trim() === '中文'); if (b) b.click(); return 'zh' })()`)
await wait(1200)
await ev(`[...document.querySelectorAll('.filter-row .btn')].find((b) => b.textContent.trim() === '新建题目')?.click(); 'open'`)
await wait(800)
const s1 = await ev(`(() => ({ formOpen: !!document.querySelector('.kc-task-form'), inputs: document.querySelectorAll('.kc-task-form input').length, datalist: !!document.querySelector('#t7-demo-slugs'), attachBtn: [...document.querySelectorAll('.kc-task-form button')].map((b) => b.textContent.trim()) }))()`)
console.log('s1 form:', JSON.stringify(s1))
// 填 title + slug → 添加
const s2 = await ev(`(async () => {
  const form = document.querySelector('.kc-task-form')
  const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(form.querySelector('input'), 'T12 诊断题')
  set(form.querySelector('input[list]'), 'demo_粒子星空')
  const addBtn = [...form.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加')
  addBtn.click()
  await new Promise((r) => setTimeout(r, 900))
  return {
    chipCount: form.querySelectorAll('.tag-chip').length,
    chipText: form.querySelector('.tag-chip')?.textContent.trim() || null,
    draftVal: form.querySelector('input[list]')?.value || null,
  }
})()`)
console.log('s2 add:', JSON.stringify(s2))
// 提交
const s3 = await ev(`(async () => {
  ;[...document.querySelectorAll('.kc-task-form button')].find((b) => b.textContent.trim() === '创建题目')?.click()
  await new Promise((r) => setTimeout(r, 2600))
  return {
    toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 50) || null,
    at: location.pathname + location.search,
    rows: [...document.querySelectorAll('.ent-row')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 46)).slice(0, 2),
  }
})()`)
console.log('s3 submit:', JSON.stringify(s3))
// 进详情看 works
await ev(`[...document.querySelectorAll('.ent-row')].find((r) => /T12 诊断题/.test(r.textContent))?.click(); 'row'`)
await wait(3000)
const s4 = await ev(`(() => ({ workRows: [...document.querySelectorAll('.kc-works li')].map((l) => l.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40)), attachInput: !!document.querySelector('input[list="kc-demo-slugs"]') }))()`)
console.log('s4 detail-works:', JSON.stringify(s4))
ws.close()
console.log('DIAG DONE')