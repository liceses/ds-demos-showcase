// T36 topnav 间距实测：1440/1360/1280/1200/1100/1024 六档，量 gap/padding/换行/剩余空间
const CDP = 9333
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const l = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(l.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 250)); return r.result.value }
await send('Page.enable'); await send('Runtime.enable')

await send('Page.navigate', { url: `${BASE}/` })
await sleep(2200)

const MEASURE = `(() => {
  const bar = document.querySelector('header.topbar')
  if (!bar) return { err: 'no topbar' }
  const cs = getComputedStyle(bar)
  const barR = bar.getBoundingClientRect()
  const brand = bar.querySelector('.brand')
  const nav = [...bar.querySelectorAll('nav.topnav .nav-link')]
  const right = bar.querySelectorAll('.topnav.topnav-desktop')[1]
  const rightKids = right ? [...right.children] : []
  const item = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return { t: (el.textContent || el.getAttribute('title') || el.className).trim().slice(0, 10), x: +r.left.toFixed(1), w: +r.width.toFixed(1), pad: c.paddingLeft + '/' + c.paddingRight, fs: c.fontSize, gap: c.gap } }
  const gaps = (arr) => arr.slice(1).map((el, i) => +(el.getBoundingClientRect().left - arr[i].getBoundingClientRect().right).toFixed(1))
  const navItems = nav.map(item)
  const rightItems = rightKids.map(item)
  const navTops = [...new Set(nav.filter((a) => a.getBoundingClientRect().width > 0).map((a) => Math.round(a.getBoundingClientRect().top)))]
  const rightTops = [...new Set(rightKids.filter((a) => a.getBoundingClientRect().width > 0).map((a) => Math.round(a.getBoundingClientRect().top)))]
  const all = nav.filter((a) => a.getBoundingClientRect().width > 0).concat(rightKids.filter((a) => a.getBoundingClientRect().width > 0))
  const contentRight = Math.max(...all.map((a) => a.getBoundingClientRect().right))
  const brandW = brand ? +brand.getBoundingClientRect().width.toFixed(1) : 0
  return {
    vw: innerWidth,
    barW: +barR.width.toFixed(1), barPad: cs.paddingTop + '/' + cs.paddingBottom,
    brandW,
    navGap: nav[0] ? getComputedStyle(nav[0].parentElement).gap : null,
    navItems, navGaps: gaps(nav), navRows: navTops.length,
    rightGap: right ? getComputedStyle(right).gap : null,
    rightItems, rightGaps: gaps(rightKids), rightRows: rightTops.length,
    freeRight: +(barR.right - contentRight).toFixed(1),
    overflow: contentRight > barR.right + 1,\n    navCount: nav.filter((a) => a.getBoundingClientRect().width > 0).length,
  }
})()`

const out = {}
for (const w of [1440, 1360, 1280, 1200, 1100, 1024]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(350)
  out[w] = await ev(MEASURE)
  console.log(`\n===== ${w}px =====`)
  const m = out[w]
  if (m.err) { console.log(m.err); continue }
  console.log(`bar ${m.barW} pad(${m.barPad}) brand=${m.brandW} navGap=${m.navGap} rightGap=${m.rightGap} freeRight=${m.freeRight} overflow=${m.overflow} navRows=${m.navRows} rightRows=${m.rightRows}`)
  console.log('nav : ' + m.navItems.map((i) => `${i.t}(${i.w})`).join(' '))
  console.log('nav gaps: ' + JSON.stringify(m.navGaps))
  console.log('right: ' + m.rightItems.map((i) => `${i.t}(${i.w})`).join(' '))
  console.log('right gaps: ' + JSON.stringify(m.rightGaps))
}
const fs = await import('node:fs')
fs.writeFileSync(new URL('./_t36-before.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('\nsaved _t36-before.json')
process.exit(0)
