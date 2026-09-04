// t27/M1-C 冒烟：404 相似 slug 猜测 + 四入口卡；探索页尾部词表入口
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
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200))
  }
}
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const nav = async (url, ms = 2600) => { await send('Page.navigate', { url }); await wait(ms) }
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  await (await import('fs/promises')).writeFile(`D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/_t27c-${name}.png`, Buffer.from(s.data, 'base64'))
}
await send('Runtime.enable')
await send('Page.enable')

const probe = `(() => ({
  huge: document.querySelector('.huge')?.textContent.trim(),
  guessLinks: [...document.querySelectorAll('.nf-guess-link')].map((a) => ({ title: a.querySelector('.nf-guess-title')?.textContent.trim(), slug: a.querySelector('.nf-guess-slug')?.textContent.trim(), to: a.getAttribute('href') })),
  mapCards: [...document.querySelectorAll('.nf-card')].map((a) => ({ label: a.querySelector('b')?.textContent.trim(), to: a.getAttribute('href') })),
}))()`

// ① 相似 slug：catch-all 路径（/demo/xxx 会命中 demo 路由走 DemoView 错误态，不进 NotFoundView）
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await nav('http://localhost:5173/demo-c004ab5', 3200)
console.log('GUESS-TYPO ' + JSON.stringify(await ev(probe)))
await shot('404-guess')
// 点击猜测卡跳转（SPA 内链可达）
console.log('GUESS-NAV ' + JSON.stringify(await ev(`(async () => {
  const a = document.querySelector('.nf-guess-link')
  if (!a) return { skipped: true }
  a.click()
  await new Promise((r) => setTimeout(r, 1800))
  return { path: location.pathname, demoLoaded: !!document.querySelector('.dv-shell') || !!document.querySelector('.loading-row') }
})()`)))

// ② 无匹配 → 只给站点地图
await nav('http://localhost:5173/qqzz-xx11', 2600)
console.log('GUESS-NONE ' + JSON.stringify(await ev(`(() => ({
  guessBlock: !!document.querySelector('.nf-guess'),
  mapCards: document.querySelectorAll('.nf-card').length,
}))()`)))
await shot('404-map')

// ③ 短段（<4）不猜
await nav('http://localhost:5173/abc', 2600)
console.log('GUESS-SHORT ' + JSON.stringify(await ev(`(() => ({ guessBlock: !!document.querySelector('.nf-guess'), mapCards: document.querySelectorAll('.nf-card').length }))()`)))

// ④ 探索页尾部词表入口
await nav('http://localhost:5173/tags', 3000)
console.log('EXPLORE-TAIL ' + JSON.stringify(await ev(`(() => {
  const a = document.querySelector('.explore-tail-link')
  return { link: a?.textContent.trim() ?? null, to: a?.getAttribute('href') ?? null }
})()`)))
await ev(`(() => { document.querySelector('.explore-tail-link')?.click(); return 1 })()`)
await wait(2000)
console.log('TAIL-NAV ' + JSON.stringify(await ev(`(() => ({ path: location.pathname, tagKeysPage: !!document.querySelector('.route-page') }))()`)))
console.log('CONSOLE-ERRORS ' + JSON.stringify(errors.slice(0, 8)))
ws.close()
