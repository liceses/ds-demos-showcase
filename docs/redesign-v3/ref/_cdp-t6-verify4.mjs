// t7 建题复查：当前页态 + 重试创建（带逐步值回显）
const CDP = 9334
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
await send('Page.enable')

const state = await ev(`(() => ({
  at: location.pathname + location.search,
  formOpen: !!document.querySelector('.kc-task-form'),
  titleVal: document.querySelector('.kc-task-form input')?.value ?? null,
  err: document.querySelector('.kc-task-form .notice-error, .notice-error')?.textContent.trim().slice(0, 60) || null,
  rows: [...document.querySelectorAll('.ent-row')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40)),
}))()`)
console.log('state:', JSON.stringify(state, null, 1))

// 若表单还开着：直接用原生 setter 填值（execCommand 之外的双保险），再提交
const attempt = await ev(`(async () => {
  const form = document.querySelector('.kc-task-form')
  if (!form) return { skip: 'form closed' }
  const title = form.querySelector('input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(title, 'T7 直建验证题')
  title.dispatchEvent(new Event('input', { bubbles: true }))
  const ta = form.querySelector('textarea')
  if (ta) { const ts = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; ts.call(ta, '管理员直建验证'); ta.dispatchEvent(new Event('input', { bubbles: true })) }
  const btn = [...form.querySelectorAll('button')].find((b) => /创建题目|Create task/i.test(b.textContent))
  const disabled = btn?.disabled
  btn?.click()
  await new Promise((r) => setTimeout(r, 2600))
  return {
    disabledBeforeClick: disabled,
    toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 60) || null,
    rows: [...document.querySelectorAll('.ent-row')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 50)),
    err: document.querySelector('.notice-error')?.textContent.trim().slice(0, 60) || null,
  }
})()`)
console.log('attempt:', JSON.stringify(attempt, null, 1))
ws.close()
console.log('PROBE8 DONE')