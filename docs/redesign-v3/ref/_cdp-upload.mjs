// T17 上传页四步向导深扫（双主题）：步进驱动 + 每步 static 全扫 + 关键组件 hover 抽样 + 截图
const CDP = 9333
const BASE = 'http://localhost:5173'
const OUT = 'D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.method + JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable'); await send('Runtime.enable')
const STATIC_SCAN = `(() => {
  const lum = (r,g,b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) }
  const parse = (s) => { const m = s.match(/rgba?\\((([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+))(?:\\s*,\\s*([\\d.]+))?\\)/); return m ? { r:+m[2], g:+m[3], b:+m[4], a: m[5]===undefined?1:+m[5] } : null }
  const out = { flags: [], ok: 0, total: 0 }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
    const txt = (el.childNodes && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) ? el.textContent.trim().slice(0, 28) : ''
    if (!txt) continue
    const b = parse(cs.backgroundColor); if (!b || b.a < 0.85) continue
    const spread = Math.max(b.r,b.g,b.b) - Math.min(b.r,b.g,b.b); if (spread < 40) continue
    const bl = lum(b.r,b.g,b.b); const c = parse(cs.color); if (!c || c.a < 0.4) continue
    const cl = lum(c.r,c.g,c.b)
    const ratio = (Math.max(bl,cl)+0.05)/(Math.min(bl,cl)+0.05)
    out.total++
    if (ratio < 4.5) out.flags.push({ tag: el.tagName, cls: String(el.className).slice(0,44), text: txt, ratio: ratio.toFixed(2), bg: cs.backgroundColor, color: cs.color }); else out.ok++
  }
  return out
})()`
const results = []
const out = {}
for (const theme of ['ink', 'paper']) {
  await send('Page.navigate', { url: `${BASE}/upload` })
  await sleep(2400)
  await ev(`localStorage.setItem('dsh_theme','${theme}'); sessionStorage.clear()`)
  await send('Page.reload')
  await sleep(2600)
  const stepScan = async (label) => {
    const r = await ev(STATIC_SCAN)
    const fs = await import('node:fs')
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(`${OUT}/t17-upload-${label}-${theme}.png`, Buffer.from(shot.data, 'base64'))
    results.push({ theme, step: label, total: r.total, ok: r.ok, flags: r.flags })
    return r
  }
  const hoverProbe = async (sel, label) => {
    const cands = await ev(`(() => { const el = document.querySelector('${sel}'); if (!el) return null; const r = el.getBoundingClientRect(); if (r.width < 4) return null; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 40)) } })()`)
    if (!cands) return
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cands.x, y: cands.y })
    await sleep(280)
    const r = await ev(STATIC_SCAN)
    results.push({ theme, step: label + ':hover', total: r.total, ok: r.ok, flags: r.flags })
  }
  // step1 类型三卡
  await stepScan('s1')
  await hoverProbe('.uw-type', 's1')
  // 进 step2：选第一个类型卡 + 下一步
  await ev(`(() => { const el = document.querySelector('.uw-type'); if (el) el.click() })()`)
  await sleep(420)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('下一步')); if (b) b.click() })()`)
  await sleep(520)
  await stepScan('s2')
  await hoverProbe('.tag-chip', 's2')
  await hoverProbe('.uw-fb', 's2')
  // 进 step3：选模型 chip + 下一步
  await ev(`(() => { const el = [...document.querySelectorAll('.uw-chipgrid .tag-chip')][0]; if (el) el.click() })()`)
  await sleep(420)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('下一步')); if (b) b.click() })()`)
  await sleep(520)
  await stepScan('s3')
  // 填标题进 step4
  await ev(`(() => { const inp = [...document.querySelectorAll('input')].find(i => i.type === 'text' || !i.type); if (inp) { const st = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; st.call(inp, 't17 扫描用标题'); inp.dispatchEvent(new Event('input', { bubbles: true })) } })()`)
  await sleep(300)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('下一步')); if (b) b.click() })()`)
  await sleep(520)
  await stepScan('s4')
  // 仪表盘 hover
  await hoverProbe('.uw-item', 's4')
  out[theme] = 'done'
}
const fs = await import('node:fs')
fs.writeFileSync(`${OUT}/t17-upload-matrix.json`, JSON.stringify(results, null, 1))
const bad = results.filter((r) => r.flags.length)
console.log(`steps=${results.length} flagged=${bad.length}`)
for (const r of bad.slice(0, 8)) console.log(`[${r.theme} ${r.step}] ${r.flags.map((f) => f.tag + '.' + f.cls + ' ' + f.ratio).join(' | ')}`)
ws.close()
process.exit(0)
