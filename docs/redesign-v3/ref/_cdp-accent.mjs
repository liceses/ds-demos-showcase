// t16 P1-fix-2 复测：墨黑全站 accent 填充字色扫描（视觉定义：饱和彩底+对比<4.5 的文字 = 残留）
// 判据：bg 有色相（max-min>40）且 bg 亮（lum>0.18）且元素含文字且对比 <4.5 → flag
const CDP = 9333
const BASE = 'http://localhost:5173'
const OUT = 'D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref'
const PAGES = [
  ['home', '/'],
  ['demos', '/demos'],
  ['demo', '/demo/demo-c004ab51'],
  ['about', '/about'],
  ['leaderboard', '/leaderboard'],
  ['login', '/login'],
  ['explore', '/explore'],
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable')
await send('Runtime.enable')

await send('Page.navigate', { url: `${BASE}/` })
await sleep(1200)
await ev(`localStorage.setItem('dsh_theme','ink'); sessionStorage.clear()`)
const SCAN = `(() => {
  const lum = (r,g,b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) }
  const parse = (s) => { const m = s.match(/rgba?\\((([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+))(?:\\s*,\\s*([\\d.]+))?\\)/); return m ? { r:+m[2], g:+m[3], b:+m[4], a: m[5]===undefined?1:+m[5] } : null }
  const out = { flags: [], ok: 0, flaggedOk: 0, total: 0 }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
    const txt = (el.childNodes && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) ? el.textContent.trim().slice(0, 30) : ''
    if (!txt) continue
    const bgRaw = cs.backgroundColor
    const b = parse(bgRaw)
    if (!b || b.a < 0.85) continue
    const spread = Math.max(b.r, b.g, b.b) - Math.min(b.r, b.g, b.b)
    if (spread < 40) continue // 非彩（中性/黑白灰）跳过
    const bl = lum(b.r, b.g, b.b)
    const c = parse(cs.color)
    if (!c || c.a < 0.4) continue
    const cl = lum(c.r, c.g, c.b)
    const ratio = (Math.max(bl, cl) + 0.05) / (Math.min(bl, cl) + 0.05)
    out.total++
    if (ratio < 4.5) out.flags.push({ cls: String(el.className).slice(0, 50), tag: el.tagName, text: txt, ratio: ratio.toFixed(2), bg: bgRaw, color: cs.color })
    else out.ok++
  }
  out.theme = document.documentElement.dataset.theme
  return out
})()`
const results = {}
for (const [name, path] of PAGES) {
  await send('Page.navigate', { url: BASE + path })
  await sleep(2200)
  const r = await ev(SCAN)
  results[name] = r
  if (['home', 'demo', 'about'].includes(name)) {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    const fs = await import('node:fs')
    fs.writeFileSync(`${OUT}/t16b-${name}-ink.png`, Buffer.from(s.data, 'base64'))
    results[name].shot = `t16b-${name}-ink.png`
  }
}
console.log(JSON.stringify(results, null, 1))
ws.close()
process.exit(0)
