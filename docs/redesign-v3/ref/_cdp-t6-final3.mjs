// M3-B5 终验 v3：每步回显（merge 两步 + inbox 真批量）
import fs from 'fs'
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
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t6-${name}.png`, Buffer.from(s.data, 'base64'))
}
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: BASE + '/login' })
await wait(3200)
await ev(`(async () => {
  const set = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(document.querySelector('input:not([type="password"])'), 'admin'); set(document.querySelector('input[type="password"]'), 'admin123')
  ;[...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录|log ?in/i.test(b.textContent))?.click()
  await new Promise((r) => setTimeout(r, 2400))
  document.querySelector('.user-menu-trigger')?.click(); await new Promise((r) => setTimeout(r, 600))
  document.querySelector('.user-menu-panel a[href="/admin"]')?.click(); await new Promise((r) => setTimeout(r, 3000))
  // 锁 zh
  const lb = [...document.querySelectorAll('.topbar button')].find((x) => x.textContent.trim() === '中文')
  lb?.click(); await new Promise((r) => setTimeout(r, 1200))
  return location.pathname
})()`)

// ---- merge 两步流 ----
await ev(`[...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === '实体总表' || x.textContent.trim() === 'Entities')?.click(); 'go'`)
await wait(2600)
await ev(`[...document.querySelectorAll('.filter-row .btn')].find((b) => b.textContent.trim() === '题目' || b.textContent.trim() === 'Tasks')?.click(); 'facet'`)
await wait(2200)
const rowsNow = await ev(`[...document.querySelectorAll('.ent-row')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 42))`)
console.log('A0 task rows:', JSON.stringify(rowsNow))
// 源=mc-web 详情
await ev(`(async () => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('新建题目') || x.textContent.includes('New task'))?.click()
  await wait(700)
  const form = document.querySelector('.kc-task-form')
  const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(form.querySelector('input'), 'M3-B5 合并靶')
  await wait(220)
  ;[...form.querySelectorAll('button')].find((b) => b.textContent.trim() === '创建题目' || b.textContent.trim() === 'Create task')?.click()
  await new Promise((r) => setTimeout(r, 2600))
  ;[...document.querySelectorAll('.ent-row')].find((r) => r.textContent.includes('mc-web'))?.click()
  await wait(3000)
  return 'ok'
})()`)
await ev(`[...document.querySelectorAll('.ent-row')].find((r) => r.textContent.includes('mc-web'))?.click(); 'row'`)
await wait(3000)
const z = await ev(`(() => ({ zones: [...document.querySelectorAll('.kc-zone-title')].map((x) => x.textContent.trim()).slice(0, 5), mergeBtn: [...document.querySelectorAll('button')].some((b) => /合并向导|Merge wizard/i.test(b.textContent)) }))()`)
console.log('A1 detail:', JSON.stringify(z))
await ev(`[...document.querySelectorAll('.kc-rel-row button, .kc-zone-head button')].find((b) => b.textContent.trim() === '合并向导 →' || b.textContent.trim() === 'Merge wizard →')?.click(); 'open'`)
await wait(500)
const panel = await ev(`(() => ({ panel: !!document.querySelector('.kc-trans'), inputs: document.querySelectorAll('.kc-trans input').length }))()`)
console.log('A2 panel:', JSON.stringify(panel))
await ev(`(() => { const i = document.querySelector('.kc-trans input'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, 'M3-B5 合并靶'); i.dispatchEvent(new Event('input', { bubbles: true })); return i.value })()`)
await wait(200)
const tgtVal = await ev(`document.querySelector('.kc-trans input')?.value`)
console.log('A3 target set:', JSON.stringify(tgtVal))
await ev(`[...document.querySelectorAll('.kc-trans button')].find((b) => /dry_run/i.test(b.textContent))?.click(); 'dry'`)
await wait(2200)
const dry = await ev(`(() => ({ previewMsg: document.querySelector('.kc-trans .hint')?.textContent.trim().slice(0, 130) || null, toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 60) || null }))()`)
console.log('A4 dry_run:', JSON.stringify(dry))
await shot('09-merge-dryrun')
if (dry.previewMsg) {
  await ev(`[...document.querySelectorAll('.kc-trans button')].find((b) => /确认合并|Confirm merge/i.test(b.textContent))?.click(); 'c'`)
  await wait(400)
  await ev(`[...document.querySelectorAll('button')].filter((b) => /执行合并|Run merge/i.test(b.textContent)).pop()?.click(); 'go'`)
  await wait(2800)
  const r5 = await ev(`(() => ({ toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 40) || null, strip: [...document.querySelectorAll('.kc-state')].map((s) => s.textContent.trim() + (s.classList.contains('on') ? '*' : '')), auditTop: document.querySelector('.kc-audit li')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70) || null }))()`)
  console.log('A5 merge done:', JSON.stringify(r5, null, 1))
  await shot('10-merge-done')
}

// ---- inbox 真批量 ----
await ev(`[...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === '知识候选' || x.textContent.trim() === 'Knowledge')?.click(); 'inbox'`)
await wait(2800)
const b0 = await ev(`(() => ({ heads: document.querySelectorAll('.inbox-kind-head').length, rows: document.querySelectorAll('.inbox-row').length }))()`)
console.log('B0 inbox:', JSON.stringify(b0))
await ev(`document.querySelector('.inbox-kind-head button')?.click(); 'select-all'`)
await wait(500)
const b1 = await ev(`(() => ({ barOpen: !!document.querySelector('.inbox-batch'), approveLabel: [...document.querySelectorAll('.inbox-batch button')].find((b) => /批量批准|Approve batch/i.test(b.textContent))?.textContent.trim() || null }))()`)
console.log('B1 bar:', JSON.stringify(b1))
await shot('11-inbox-realbatch')
await ev(`[...document.querySelectorAll('.inbox-batch button')].find((b) => /批量批准|Approve batch/i.test(b.textContent))?.click(); 'go'`)
await wait(500)
const b2 = await ev(`(() => ({ running: document.querySelector('.inbox-batch')?.textContent.includes('批量执行中'), confirm: !!document.body.textContent.match(/批准这条|批量批准 \\d+ 条建议/) }))()`)
console.log('B2 confirm:', JSON.stringify(b2))
await ev(`[...document.querySelectorAll('button')].filter((b) => /批量批准/.test(b.textContent)).pop()?.click(); 'ok'`)
await wait(2600)
const b3 = await ev(`(() => ({ toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 50) || null, pendingChips: [...document.querySelectorAll('.tag-chip.mode-open')].map((c) => c.textContent.replace(/\\s+/g, ' ').trim()).slice(0, 5) }))()`)
console.log('B3 batch done:', JSON.stringify(b3))
ws.close()
console.log('PROBE12 DONE')