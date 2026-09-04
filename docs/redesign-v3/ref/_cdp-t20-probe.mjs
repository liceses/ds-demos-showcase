// T20 探针：路由切换瞬间的 page-* 类逐帧采样
const CDP = 9333
const BASE = 'http://localhost:5173'
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
await send('Page.navigate', { url: `${BASE}/` })
await sleep(1800)
// 页内 SPA 导航到 /demos：用 router push（通过 history API 不可靠——直接点导航链接）
const res = await ev(`(async () => {
  const log = []
  const a = [...document.querySelectorAll('a')].find(x => x.getAttribute('href') === '/demos')
  if (!a) return { err: 'no /demos link' }
  a.click()
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 60))
    const els = [...document.querySelectorAll('[class*="page-enter"], [class*="page-leave"], [class*="page-cut"]')]
    log.push({ t: i * 60, classes: els.map(e => e.className.split(' ').filter(c => c.startsWith('page-')).join(' ')).slice(0, 3) })
  }
  return { path: location.pathname, log }
})()`)
console.log(JSON.stringify(res, null, 1))
// Transition/KeepAlive 存在性：查 main 布局的 router view 结构
const probe = await ev(`(() => { const main = document.querySelector('main'); return { mainChildren: main ? [...main.children].map(c => c.tagName + '.' + String(c.className).split(' ').slice(0,2).join('.')) : null } })()`)
console.log(JSON.stringify(probe))
ws.close()
process.exit(0)
