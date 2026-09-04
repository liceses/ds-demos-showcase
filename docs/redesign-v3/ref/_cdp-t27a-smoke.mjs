// t27/M1-A 冒烟 v2：修复 v1 的两个测量错误——①click 后必须等 Vue 渲染 tick 再量 ②导航走 Page.navigate
const CDP = 9333
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && !/devtools/i.test(t.url)) || list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
const errors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) }
  if (m.method === 'Runtime.consoleAPICalled' && ['error'].includes(m.params.type)) {
    errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300))
  }
}
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: false })).result.value
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const nav = async (url, ms = 2600) => { await send('Page.navigate', { url }); await wait(ms) }
const clickWait = async (expr, ms = 400) => { await ev(expr); await wait(ms) }
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  await (await import('fs/promises')).writeFile(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t27a-${name}.png`, Buffer.from(s.data, 'base64'))
}
await send('Runtime.enable')
await send('Page.enable')

// ---------- 桌面 1440 ----------
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await ev(`(() => { localStorage.clear(); return 1 })()`)
await nav('http://localhost:5173/demos', 3000)
console.log('DESKTOP-INIT ' + JSON.stringify(await ev(`(() => {
  const q = (s) => document.querySelector(s)
  return {
    facetBtn: q('.facet-btn')?.textContent.trim() ?? null,
    casualTab: [...document.querySelectorAll('.tabs .tab')].map((b) => b.textContent.trim()),
    stripLegacy: !!q('.tag-strips'),
  }
})()`)))

// 开抽屉（overlay）—— click 后等渲染再量
await clickWait(`document.querySelector('.facet-btn')?.click()`, 500)
console.log('OPEN-OVERLAY ' + JSON.stringify(await ev(`(() => {
  const p = document.querySelector('.facet-panel')
  const cs = p ? getComputedStyle(p) : null
  return {
    open: !!p, pos: cs?.position, z: cs?.zIndex, anim: cs?.animationName,
    head: document.querySelector('.fp-head')?.textContent.replace(/\\s+/g, ' ').trim(),
    grammarLine: document.querySelector('.fp-grammar')?.textContent.trim(),
    groups: [...document.querySelectorAll('.fp-group-head .fp-group-name')].map((x) => x.textContent.trim()),
    orNotes: [...document.querySelectorAll('.fp-grammar-or')].map((x) => x.textContent.trim()).slice(0, 3),
    sliders: document.querySelectorAll('.range-slider').length,
    presets: [...document.querySelectorAll('.fp-group-body .mode-int')].map((b) => b.textContent.trim()).slice(0, 6),
    searches: document.querySelectorAll('.fp-search').length,
    backdrop: !!document.querySelector('.facet-backdrop'),
  }
})()`)))
await shot('overlay')

// 点一个值 → chips 摘要行出现 + 计数更新
await clickWait(`(() => { const chip = [...document.querySelectorAll('.facet-panel .tag-chip')].find((b) => !b.classList.contains('tag-strip-toggle') && !b.classList.contains('mode-int')); window.__chip = chip?.textContent.trim(); chip?.click(); return 1 })()`, 1500)
console.log('PICK ' + JSON.stringify(await ev(`(() => ({
  picked: window.__chip ?? null,
  chipsRow: document.querySelector('.tag-selected-row')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90) ?? null,
  facetBtn: document.querySelector('.facet-btn')?.textContent.trim() ?? null,
  headCount: document.querySelector('.fp-count')?.textContent.trim() ?? null,
}))()`)))

// 模型组搜索
await clickWait(`(() => { const i = document.querySelector('.fp-search'); if (i) { i.value = 'dsv'; i.dispatchEvent(new Event('input', { bubbles: true })) } return 1 })()`, 400)
console.log('MODEL-SEARCH ' + JSON.stringify(await ev(`(() => {
  const chips = [...document.querySelectorAll('.facet-panel .vendor-strip .tag-chip')].map((b) => b.textContent.trim())
  return { hits: chips.length, sample: chips.slice(0, 4) }
})()`)))
await clickWait(`(() => { const i = document.querySelector('.fp-search'); if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) } return 1 })()`, 300)

// 钉住 → 常驻侧栏（两列栅格 + sticky + 按钮隐藏 + localStorage）
await clickWait(`document.querySelector('.fp-pin')?.click()`, 500)
console.log('PIN ' + JSON.stringify(await ev(`(() => {
  const p = document.querySelector('.facet-panel')
  const cs = p ? getComputedStyle(p) : null
  return {
    pos: cs?.position, top: cs?.top, sticky: cs?.position === 'sticky',
    bodyCols: getComputedStyle(document.querySelector('.facet-body')).gridTemplateColumns.split(' ').length + ' tracks',
    btnGone: !document.querySelector('.facet-btn'),
    pinBtnText: document.querySelector('.fp-pin')?.textContent.trim() ?? null,
    backdrop: !!document.querySelector('.facet-backdrop'),
    ls: localStorage.getItem('dsh_demos_facet_pin'),
  }
})()`)))
await shot('pinned')
// 取消钉住
await clickWait(`document.querySelector('.fp-pin')?.click()`, 500)
console.log('UNPIN ' + JSON.stringify(await ev(`(() => ({
  btnBack: !!document.querySelector('.facet-btn'), panelGone: !document.querySelector('.facet-panel'), ls: localStorage.getItem('dsh_demos_facet_pin'),
}))()`)))
// Esc 关浮层
await clickWait(`document.querySelector('.facet-btn')?.click()`, 400)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await wait(400)
console.log('ESC ' + JSON.stringify(await ev(`(() => ({ panelGone: !document.querySelector('.facet-panel') }))()`)))

// ---------- 空态三出口 ----------
await nav('http://localhost:5173/demos?tag=rounds:999-999', 3000)
console.log('EMPTY ' + JSON.stringify(await ev(`(() => ({
  what: document.querySelector('.dv-empty-what')?.textContent.trim() ?? null,
  why: document.querySelector('.dv-empty-why')?.textContent.trim() ?? null,
  exits: [...document.querySelectorAll('.dv-empty-exits .btn')].map((b) => b.textContent.trim()),
}))()`)))
await shot('empty')
// 放宽条件 = 去掉最后一个筛选重查
await clickWait(`(() => { const b = [...document.querySelectorAll('.dv-empty-exits .btn')].find((x) => x.textContent.includes('放宽')); b?.click(); return 1 })()`, 2000)
console.log('RELAX ' + JSON.stringify(await ev(`(() => ({ emptyGone: !document.querySelector('.dv-empty'), url: location.search, cards: document.querySelectorAll('.masonry-item').length }))()`)))

// ---------- 移动 375 bottom-sheet ----------
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
await nav('http://localhost:5173/demos', 3000)
console.log('MOBILE-INIT ' + JSON.stringify(await ev(`(() => ({
  facetBtn: document.querySelector('.facet-btn')?.textContent.trim() ?? null,
  panelClosed: !document.querySelector('.facet-panel'),
  casualTab: [...document.querySelectorAll('.tabs .tab')].map((b) => b.textContent.trim()),
}))()`)))
await clickWait(`document.querySelector('.facet-btn')?.click()`, 500)
console.log('SHEET-OPEN ' + JSON.stringify(await ev(`(() => {
  const p = document.querySelector('.facet-panel')
  const cs = p ? getComputedStyle(p) : null
  return {
    pos: cs?.position, z: cs?.zIndex, maxH: cs?.maxHeight, safePad: cs?.paddingBottom,
    openGroups: [...document.querySelectorAll('.fp-caret.open')].length,
    head: document.querySelector('.fp-head')?.textContent.replace(/\\s+/g, ' ').trim(),
    orNoteDisplay: (() => { const n = document.querySelector('.fp-grammar-or'); return n ? getComputedStyle(n).display : '(none-el)' })(),
    backdrop: !!document.querySelector('.facet-backdrop'),
    bodyH: Math.round(p.getBoundingClientRect().height),
  }
})()`)))
await shot('sheet')
// 单组展开：点第二个组头 → 开着的组恰一个
await clickWait(`(() => { const heads = [...document.querySelectorAll('button.fp-group-head')]; heads[1]?.click(); return 1 })()`, 400)
console.log('SHEET-ACCORDION ' + JSON.stringify(await ev(`(() => ({
  openKeys: [...document.querySelectorAll('.fp-caret.open')].map((c) => c.closest('.fp-group-head')?.querySelector('.fp-group-name')?.textContent.trim()),
}))()`)))
// 点值 → 应用即收
await clickWait(`(() => { const chip = [...document.querySelectorAll('.facet-panel .tag-chip')].find((b) => !b.classList.contains('tag-strip-toggle') && !b.classList.contains('mode-int')); window.__mchip = chip?.textContent.trim(); chip?.click(); return 1 })()`, 1200)
console.log('SHEET-APPLY-CLOSE ' + JSON.stringify(await ev(`(() => ({
  picked: window.__mchip ?? null,
  panelClosed: !document.querySelector('.facet-panel'),
  chips: document.querySelector('.tag-selected-row')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90) ?? null,
}))()`)))
await shot('sheet-after')
// 取消勾选不收起（整理动作留在抽屉）
await clickWait(`document.querySelector('.facet-btn')?.click()`, 500)
await clickWait(`(() => { const chip = document.querySelector('.facet-panel .tag-chip.active'); chip?.click(); return 1 })()`, 1000)
console.log('SHEET-REMOVE-STAYS ' + JSON.stringify(await ev(`(() => ({ panelStillOpen: !!document.querySelector('.facet-panel') }))()`)))
console.log('CONSOLE-ERRORS ' + JSON.stringify(errors.slice(0, 8)))
ws.close()
