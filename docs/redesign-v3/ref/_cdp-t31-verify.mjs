// t31/M1-fix-8 验证（05 §3.3 验收清单）：
// ①滚动全程 preview-shell 与 dv-story 零重叠（elementFromPoint 证实）②sticky 释放=预览不再钉 78 越过 row1
// ③facts 0ms 硬切/快捷键 I/localStorage 回归 ④讨论常开+可收起+刷新回常开、时间线仍折叠
// ⑤500px 摘要条+动作条讨论键 ⑥ink 主题视觉
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const nav = async (url, ms = 3000) => { await send('Page.navigate', { url }); await wait(ms) }
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t31-${name}.png`, Buffer.from(s.data, 'base64'))
}
await send('Page.enable')

// —— 腿 1：桌面 1360 滚动重叠复测（对照 05 §3.1 实况复验口径）——
await send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 960, deviceScaleFactor: 1, mobile: false })
await ev(`(() => { localStorage.clear(); return 1 })()`)
await nav('http://localhost:5173/demo/demo-c004ab51')
// 等预览挂载稳定
await wait(1500)
const overlapScan = await ev(`(async () => {
  const out = []
  for (const y of [0, 200, 400, 600, 800, 1000, 1200]) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 260))
    const ps = document.querySelector('.preview-shell') || document.querySelector('.dv-stage')
    const story = document.querySelector('.dv-story')
    const desc = document.querySelector('.dv-desc-card')
    if (!ps || !story) { out.push({ y, missing: !ps ? 'preview' : 'story' }); continue }
    const pr = ps.getBoundingClientRect(), sr = story.getBoundingClientRect()
    const overlap = Math.max(0, Math.min(pr.bottom, sr.bottom) - Math.max(pr.top, sr.top))
    // 重叠区采样：预览底部向上 8px 处，谁在最上层
    const probeX = Math.round(pr.left + pr.width / 2), probeY = Math.round(pr.bottom - 8)
    const hit = document.elementFromPoint(probeX, probeY)
    out.push({
      y, overlapPx: Math.round(overlap),
      stageTopInVP: Math.round(pr.top), stageBottom: Math.round(pr.bottom),
      hitTag: hit ? hit.tagName + '.' + (hit.className || '').toString().split(' ').slice(0, 2).join('.') : null,
      hitInsidePreview: hit ? ps.contains(hit) : null,
    })
  }
  window.scrollTo(0, 0)
  return out
})()`)
console.log('OVERLAP-SCAN ' + JSON.stringify(overlapScan))
await shot('desktop-top')

// sticky 语义：滚动后 stage 是否仍钉在 78（旧 bug=一直钉；新语义=随 row1 滚走）
console.log('STICKY-RELEASE ' + JSON.stringify(await ev(`(async () => {
  window.scrollTo(0, 600); await new Promise((r) => setTimeout(r, 300))
  const stage = document.querySelector('.dv-stage')
  const cs = getComputedStyle(stage)
  return { stageTopAt600: Math.round(stage.getBoundingClientRect().top), position: cs.position, expect: '随流滚走（top 应显著小于 78 或为负）' }
})()`)))

// ③ facts 0ms 硬切 + 快捷键 I + localStorage（t23 语义回归）
console.log('KEY_I ' + JSON.stringify(await ev(`(async () => {
  const before = !!document.querySelector('.dv-facts')
  const w0 = Math.round(document.querySelector('.dv-stage').getBoundingClientRect().width)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))
  await new Promise((r) => setTimeout(r, 150))
  const w1 = Math.round(document.querySelector('.dv-stage').getBoundingClientRect().width)
  await new Promise((r) => setTimeout(r, 400))
  const after = !!document.querySelector('.dv-facts')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))
  await new Promise((r) => setTimeout(r, 500))
  return { before, after, w0, w1, hardCutNoTween: w0 !== w1, ls: localStorage.getItem('demo.factsOpen') }
})()`)))
console.log('MEMORY ' + JSON.stringify(await ev(`(async () => {
  location.reload(); return 'reloading'
})()`)))
await wait(3200)
console.log('MEM-AFTER ' + JSON.stringify(await ev(`(() => ({ factsNow: !!document.querySelector('.dv-facts'), ls: localStorage.getItem('demo.factsOpen') }))()`)))

// —— 腿 2：④讨论常开 / 可收起 / 刷新回常开；时间线仍折叠 ——
console.log('DISCLOSE ' + JSON.stringify(await ev(`(() => ({
  commentsOpen: document.getElementById('dv-comments')?.hasAttribute('open') ?? null,
  commentsHint: document.querySelector('#dv-comments .dv-disclose-hint')?.textContent.trim(),
  timelineOpen: document.getElementById('dv-timeline')?.hasAttribute('open') ?? null,
  sessionOpen: document.getElementById('dv-session')?.hasAttribute('open') ?? null,
  qcEmpty: !!document.querySelector('.qc-empty'),
  grabBtn: document.querySelector('.qc-empty .btn')?.textContent.trim() ?? null,
  grabTo: document.querySelector('.qc-empty .btn')?.getAttribute('href') ?? null,
  inputVisible: !!document.querySelector('.quick-comment-input .input'),
}))()`)))
console.log('DISCLOSE-TOGGLE ' + JSON.stringify(await ev(`(async () => {
  document.querySelector('#dv-comments summary').click()
  await new Promise((r) => setTimeout(r, 300))
  const collapsed = !document.getElementById('dv-comments').hasAttribute('open')
  document.querySelector('#dv-comments summary').click()
  await new Promise((r) => setTimeout(r, 300))
  const reopened = document.getElementById('dv-comments').hasAttribute('open')
  return { collapsed, reopened }
})()`)))
await shot('desktop-comments')

// —— 腿 3：ink 主题视觉 ——
console.log('INK ' + JSON.stringify(await ev(`(() => { document.documentElement.setAttribute('data-theme', 'ink'); return getComputedStyle(document.documentElement).getPropertyValue('--paper').slice(0, 12) })()`)))
await wait(400)
await shot('desktop-ink')
await ev(`(() => { document.documentElement.setAttribute('data-theme', 'paper'); return 'back' })()`)

// —— 腿 4：500px 移动（摘要条 + 动作条讨论键 + 讨论展开高度）——
await send('Emulation.setDeviceMetricsOverride', { width: 500, height: 900, deviceScaleFactor: 2, mobile: true })
await nav('http://localhost:5173/demo/demo-c004ab51')
console.log('MOBILE ' + JSON.stringify(await ev(`(() => ({
  commentsOpen: document.getElementById('dv-comments')?.hasAttribute('open') ?? null,
  factsVisible: !!document.querySelector('.dv-facts'),
  bar: !!document.querySelector('.dv-mbar'),
  qcHeight: (() => { const el = document.querySelector('#dv-comments .dv-disclose-body'); return el ? Math.round(el.getBoundingClientRect().height) : null })(),
}))()`)))
console.log('MOBILE-DISCUSS-KEY ' + JSON.stringify(await ev(`(async () => {
  const y0 = window.scrollY
  ;[...document.querySelectorAll('.dv-mbar-btn')].find((b) => b.textContent.includes('讨论'))?.click()
  await new Promise((r) => setTimeout(r, 900))
  const el = document.getElementById('dv-comments')
  const rr = el?.getBoundingClientRect()
  return { open: el?.hasAttribute('open') ?? null, inVP: rr ? rr.top >= -50 && rr.top < window.innerHeight : null, scrolled: window.scrollY !== y0 }
})()`)))
await shot('mobile-comments')
ws.close()
