// t12 补验：4 项未 CDP 化路径（merge happy/收件箱真批量/Tag desc 保存/跃迁理由）——全部修正技术
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
const setNative = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

// 登录 + 锁 zh + 进 admin
await send('Page.navigate', { url: BASE + '/login' })
await wait(3200)
await ev(`(async () => {
  const set = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(document.querySelector('input:not([type="password"])'), 'admin'); set(document.querySelector('input[type="password"]'), 'admin123')
  ;[...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录|log ?in/i.test(b.textContent))?.click()
  await new Promise((r) => setTimeout(r, 2400))
  document.querySelector('.user-menu-trigger')?.click(); await new Promise((r) => setTimeout(r, 600))
  document.querySelector('.user-menu-panel a[href="/admin"]')?.click(); await new Promise((r) => setTimeout(r, 3000))
  return location.pathname
})()`)

// ===== A. 建 1 件带挂载的题（源）+ 1 件靶题 =====
await ev(`[...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === '实体总表' || x.textContent.trim() === 'Entities')?.click(); 'go'`)
await wait(2800)
const mk = async (title, attachSlug) => {
  await ev(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('新建题目') || x.textContent.includes('New task'))?.click(); 'open'`)
  await wait(800)
  const r = await ev(`(async (title, attachSlug) => {
    const form = document.querySelector('.kc-task-form')
    const set = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(form.querySelector('input'), title)
    await new Promise((r) => setTimeout(r, 200))
    if (attachSlug) {
      const draft = form.querySelector('input[list]')
      if (draft) { set(draft, attachSlug); await new Promise((r) => setTimeout(r, 200)); [...form.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加' || b.textContent.trim() === 'Attach')?.click(); await new Promise((r) => setTimeout(r, 400)) }
    }
    ;[...form.querySelectorAll('button')].find((b) => b.textContent.trim() === '创建题目' || b.textContent.trim() === 'Create task')?.click()
    await new Promise((r) => setTimeout(r, 2600))
    return {
      chip: form.querySelector('.tag-chip')?.textContent.trim() || null,
      formStillOpen: !!document.querySelector('.kc-task-form'),
      toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 44) || null,
    }
  })(title, attachSlug)`)
  return r
}
const srcCreate = await mk('T12 复验-源题', 'demo_粒子星空')
console.log('A-源题:', JSON.stringify(srcCreate))
await wait(400)
const tgtCreate = await mk('T12 复验-靶题', null)
console.log('A-靶题:', JSON.stringify(tgtCreate))

// ===== B. 源题详情 → 合并两步流（dry_run 预览 → 确认执行）=====
await ev(`[...document.querySelectorAll('.ent-row')].find((r) => r.textContent.includes('T12 复验-源题'))?.click(); 'row'`)
await wait(3000)
await ev(`[...document.querySelectorAll('.kc-rel-row button, .kc-zone button')].find((b) => b.textContent.trim() === '合并向导 →' || b.textContent.trim() === 'Merge wizard →')?.click(); 'open'`)
await wait(600)
await ev(`(() => { const i = document.querySelector('.kc-trans input'); const p = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(i, 'T12 复验-靶题'); i.dispatchEvent(new Event('input', { bubbles: true })); return i.value })()`)
await wait(250)
await ev(`[...document.querySelectorAll('.kc-trans button')].find((b) => /dry_run/i.test(b.textContent))?.click(); 'dry'`)
await wait(2400)
const dry = await ev(`(() => ({ previewMsg: document.querySelector('.kc-trans .hint')?.textContent.trim().slice(0, 140) || null, confirmOn: ![...document.querySelectorAll('.kc-trans button')].find((b) => /确认合并|Confirm merge/i.test(b.textContent))?.disabled }))()`)
console.log('B-dry_run:', JSON.stringify(dry))
await shot('12-merge-dryrun-ok')
await ev(`[...document.querySelectorAll('.kc-trans button')].find((b) => /确认合并|Confirm merge/i.test(b.textContent))?.click(); 'c'`)
await wait(500)
await ev(`[...document.querySelectorAll('button')].filter((b) => /执行合并|Run merge/i.test(b.textContent)).pop()?.click(); 'do'`)
await wait(2800)
const merged = await ev(`(() => ({
  toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 40) || null,
  strip: [...document.querySelectorAll('.kc-state')].map((s) => s.textContent.trim() + (s.classList.contains('on') ? '*' : '')),
  auditTop: document.querySelector('.kc-audit li')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80) || null,
}))()`)
console.log('B-merged:', JSON.stringify(merged, null, 1))
await shot('13-merge-executed')

// ===== C. 跃迁理由（merged→hidden? pattern 限 candidate/active/merged/hidden——hidden 合法）=====
await ev(`[...document.querySelectorAll('button')].find((b) => /状态跃迁|Transition/i.test(b.textContent))?.click(); 'open-trans'`)
await wait(500)
const trans = await ev(`(async () => {
  const panel = document.querySelector('.kc-trans')
  const sel = panel.querySelector('select')
  const opts = [...sel.options].filter((o) => !o.disabled && o.value !== sel.value)
  if (!opts.length) return { skip: 'no legal transition' }
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  setter.call(sel, opts[0].value); sel.dispatchEvent(new Event('change', { bubbles: true }))
  const ta = panel.querySelector('textarea')
  if (ta) { const ts = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; ts.call(ta, 'T12 理由审计验证'); ta.dispatchEvent(new Event('input', { bubbles: true })) }
  ;[...panel.querySelectorAll('button')].find((b) => /执行跃迁|Run transition/i.test(b.textContent))?.click()
  await new Promise((r) => setTimeout(r, 600))
  ;[...document.querySelectorAll('button')].filter((b) => /确认跃迁|Confirm transition/i.test(b.textContent)).pop()?.click()
  await new Promise((r) => setTimeout(r, 2600))
  return {
    to: opts[0].value,
    strip: [...document.querySelectorAll('.kc-state')].map((s) => s.textContent.trim() + (s.classList.contains('on') ? '*' : '')),
    auditTop: document.querySelector('.kc-audit li')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90) || null,
  }
})()`)
console.log('C-跃迁理由:', JSON.stringify(trans, null, 1))
await shot('14-transition-reason')

// ===== D. Tag description 保存（PATCH）=====
await ev(`(() => { history.back(); return 'b' })()`)
await wait(1500)
await ev(`[...document.querySelectorAll('.filter-row .btn')].find((b) => /标签值|Tag values/i.test(b.textContent))?.click(); 'facet'`)
await wait(2400)
await ev(`[...document.querySelectorAll('.ent-row')].find((r) => r.textContent.includes('dsv4-flash'))?.click(); 'row'`)
await wait(3000)
const tagEdit = await ev(`(async () => {
  // Tag 描述区：编辑钮（概要区内、非 tag 禁用——tag 的描述字段可编辑版本）
  const descField = [...document.querySelectorAll('.kc-field')].find((f) => f.textContent.includes('描述') && f.querySelector('.btn'))
  const editBtn = descField?.querySelector('.btn')
  if (!editBtn) return { fail: 'no edit btn', fields: [...document.querySelectorAll('.kc-field')].map((f) => f.textContent.trim().slice(0, 26)).slice(0, 8) }
  editBtn.click()
  await new Promise((r) => setTimeout(r, 400))
  const input = descField.querySelector('input')
  const set = (el, v) => { const p = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(input, 'dsv4-flash——V4 Flash 快速推理（直改验证）')
  ;[...descField.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存' || b.textContent.trim() === 'Save')?.click()
  await new Promise((r) => setTimeout(r, 2600))
  return {
    toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 40) || null,
    descNow: [...document.querySelectorAll('.kc-field')].find((f) => f.textContent.includes('描述'))?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70) || null,
    auditTop: document.querySelector('.kc-audit li')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80) || null,
  }
})()`)
console.log('D-tagdesc:', JSON.stringify(tagEdit, null, 1))
await shot('15-tagdesc-saved')

// ===== E. 收件箱真批量 =====
await ev(`[...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === '知识候选' || x.textContent.trim() === 'Knowledge')?.click(); 'inbox'`)
await wait(2800)
const inbox = await ev(`(async () => {
  const heads = document.querySelectorAll('.inbox-kind-head')
  const head0 = heads[0]?.querySelector('button')
  head0?.click()
  await new Promise((r) => setTimeout(r, 600))
  const bar = document.querySelector('.inbox-batch')
  const approve = [...(bar?.querySelectorAll('button') || [])].find((b) => /批量批准|Approve batch/i.test(b.textContent))
  approve?.click()
  await new Promise((r) => setTimeout(r, 600))
  ;[...document.querySelectorAll('button')].filter((b) => /批量批准|Approve batch/i.test(b.textContent)).pop()?.click()
  await new Promise((r) => setTimeout(r, 2800))
  return {
    heads: heads.length,
    barOpen: !!bar,
    approveLabel: approve?.textContent.trim() || null,
    toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 50) || null,
    chips: [...document.querySelectorAll('.tag-chip.mode-open')].map((c) => c.textContent.replace(/\\s+/g, ' ').trim()).slice(0, 5),
  }
})()`)
console.log('E-收件箱真批量:', JSON.stringify(inbox, null, 1))
await shot('16-inbox-realbatch')
ws.close()
console.log('VERIFY-FINAL DONE')