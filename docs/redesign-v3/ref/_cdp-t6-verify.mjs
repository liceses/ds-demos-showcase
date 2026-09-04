// t7 验证探针（mock 5180 / CDP 9334，admin 登录态全 SPA）：侧栏 4 组/实体总表/详情五区/直改权诚实落地
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

// 登录
await send('Page.navigate', { url: BASE + '/login' })
await wait(3000)
await ev(`(async () => {
  const u = document.querySelector('input[type="text"], input:not([type="password"])')
  const p = document.querySelector('input[type="password"]')
  const set = (el, v) => { el.focus(); el.value = ''; document.execCommand('insertText', false, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(u, 'admin'); set(p, 'admin123')
  ;[...document.querySelectorAll('button[type="submit"], form button')].find((b) => /登录/.test(b.textContent))?.click()
  await new Promise((r) => setTimeout(r, 2200))
  return 'logged'
})()`)

// SPA 进工作台
await ev(`document.querySelector('.user-menu-trigger')?.click(); 'menu'`)
await wait(500)
await ev(`document.querySelector('.user-menu-panel a[href="/admin"]')?.click(); 'go'`)
await wait(3000)
console.log('at:', await ev('location.pathname + location.search'))

// ① 侧栏 4 组 + 实体总表在知识中心
const side = await ev(`(() => {
  const groups = [...document.querySelectorAll('.ad-nav-group, [class*="ad-nav"] [class*="group"]')]
  const labels = [...document.querySelectorAll('.ad-side b, .ad-nav b, aside b')].map((b) => b.textContent.trim()).slice(0, 8)
  const entTab = [...document.querySelectorAll('a, button')].find((x) => x.textContent.trim() === '实体总表')
  return { groupLabels: labels, entitiesTabPresent: !!entTab, entitiesInKnowledge: (() => { let el = entTab; const names = []; while (el && el.parentElement) { el = el.parentElement; names.push(el.className) } return names.length > 0 })() }
})()`)
console.log('sidebar:', JSON.stringify(side))
await shot('01-sidebar')

// ② 实体总表：进 entities，模型 facet 列表
await ev(`[...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === '实体总表')?.click(); 'go'`)
await wait(2800)
const listProbe = await ev(`(() => ({
  url: location.pathname + location.search,
  facetBtns: [...document.querySelectorAll('.filter-row .btn')].map((b) => b.textContent.trim()).slice(0, 4),
  rows: document.querySelectorAll('.ent-row').length,
  firstRow: document.querySelector('.ent-row')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80),
  cols: [...document.querySelectorAll('.ent-table th')].map((t) => t.textContent.trim()),
}))()`)
console.log('list:', JSON.stringify(listProbe, null, 1))
await shot('02-entities-list')

// ③ 行点击 → 详情五区（Model）
await ev(`document.querySelector('.ent-row')?.click(); 'row'`)
await wait(3000)
const detail = await ev(`(() => ({
  url: location.pathname + location.search,
  zones: [...document.querySelectorAll('.kc-zone-title')].map((z) => z.textContent.trim()),
  editBtn: !!document.querySelector('.kc-zone-head .btn'),
  statusStrip: [...document.querySelectorAll('.kc-state')].map((s) => s.textContent.trim() + (s.classList.contains('on') ? '*' : '')),
  aliases: document.querySelectorAll('.kc-rel-row .tag-chip').length,
  auditRows: document.querySelectorAll('.kc-audit li').length,
  workRows: document.querySelectorAll('.kc-works li').length,
}))()`)
console.log('detail-model:', JSON.stringify(detail, null, 1))
await shot('03-detail-model')

// ④ 直改：编辑名称 → 保存
await ev(`document.querySelector('.kc-zone-head .btn')?.click(); 'edit'`)
await wait(500)
const nameBefore = await ev(`document.querySelector('.kc-fields input')?.value`)
await ev(`(() => { const i = document.querySelector('.kc-fields input'); i.focus(); i.value = ''; document.execCommand('insertText', false, i.value + 'X'); i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed' })()`)
await ev(`[...document.querySelectorAll('.kc-fields button')].find((b) => b.textContent.trim() === '保存')?.click(); 'save'`)
await wait(2600)
const afterSave = await ev(`(() => ({
  toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 40) || null,
  nameNow: document.querySelector('.kc-summary b')?.textContent.trim(),
  auditTop: document.querySelector('.kc-audit li')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70) || null,
}))()`)
console.log('edit-save:', JSON.stringify({ nameBefore, ...afterSave }))

// ⑤ 状态跃迁：open → reason → confirm → strip 更新
await ev(`[...document.querySelectorAll('button')].find((b) => /状态跃迁/.test(b.textContent))?.click(); 'open'`)
await wait(400)
await ev(`(() => { const t = document.querySelector('.kc-trans textarea'); t.focus(); t.value = ''; document.execCommand('insertText', false, 't7 探针演示跃迁'); t.dispatchEvent(new Event('input', { bubbles: true })); return 'reason' })()`)
await ev(`(() => { const sel = document.querySelector('.kc-trans select'); const opts = [...sel.options].filter((o) => !o.disabled); sel.value = opts[0]?.value || sel.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return 'picked' })()`)
await ev(`[...document.querySelectorAll('.kc-trans button')].find((b) => /执行跃迁/.test(b.textContent))?.click(); 'go'`)
await wait(700)
await ev(`[...document.querySelectorAll('button')].filter((b) => /确认跃迁/.test(b.textContent)).pop()?.click(); 'confirm'`)
await wait(2600)
const afterTrans = await ev(`(() => ({
  toast: document.querySelector('.toast, [class*="toast"]')?.textContent.trim().slice(0, 40) || null,
  strip: [...document.querySelectorAll('.kc-state')].map((s) => s.textContent.trim() + (s.classList.contains('on') ? '*' : '')),
  auditTop: document.querySelector('.kc-audit li')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70) || null,
}))()`)
console.log('transition:', JSON.stringify(afterTrans, null, 1))
await shot('04-after-transition')

// ⑥ Tag facet：置灰待后端标注
await ev(`(() => { history.back(); return 'back' })()`)
await wait(1200)
await ev(`[...document.querySelectorAll('.filter-row .btn')].find((b) => /标签值/.test(b.textContent))?.click(); 'facet'`)
await wait(2600)
await ev(`document.querySelector('.ent-row')?.click(); 'row'`)
await wait(2800)
const tagProbe = await ev(`(() => ({
  zones: [...document.querySelectorAll('.kc-zone-title')].map((z) => z.textContent.trim()),
  pendingMarks: [...document.querySelectorAll('.kc-pending')].map((p) => p.textContent.trim().slice(0, 50)),
  noTransFake: !document.querySelector('.kc-trans'),
}))()`)
console.log('tag-detail:', JSON.stringify(tagProbe, null, 1))
await shot('05-detail-tag-pending')

// ⑦ EN 抽查
await ev(`(() => { const b = [...document.querySelectorAll('.topbar button')].find((x) => x.textContent.trim() === 'EN' || x.textContent.trim() === '中文'); if (b && b.textContent.trim() === 'EN') b.click(); return 'lang' })()`)
await wait(1500)
const enProbe = await ev(`(() => ({
  facetModel: [...document.querySelectorAll('.filter-row .btn')].map((b) => b.textContent.trim()).slice(0, 3),
  zoneTitle: document.querySelector('.kc-zone-title')?.textContent.trim(),
}))()`)
console.log('en:', JSON.stringify(enProbe))
ws.close()
console.log('PROBE5 DONE')