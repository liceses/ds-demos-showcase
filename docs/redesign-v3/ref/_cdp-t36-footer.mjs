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
await send('Page.enable')
await send('Page.navigate', { url: `${BASE}/` })
await sleep(2000)
const r = await ev(`(() => {
  const f = document.querySelector('footer.footer')
  const gh = [...document.querySelectorAll('footer a[href*=github]')]
  const about = [...document.querySelectorAll('footer a[href="/about"]')]
  const headerGh = !!document.querySelector('header a[href*=github]')
  const headerAbout = !!document.querySelector('header nav a[href="/about"]')
  const headerHome = !!document.querySelector('header nav a[href="/"]')
  const navItems = [...document.querySelectorAll('header nav.topnav a')].map((a) => a.textContent.trim()).filter((x) => x && x !== '登录' && x !== '注册')
  return { footerFound: !!f, footerGh: gh.length, ghTarget: gh[0]?.target, footerAbout: about.length, headerGh, headerAbout, headerHome, navItems, footerText: f ? f.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120) : null }
})()`)
console.log(JSON.stringify(r, null, 2))
await send('Page.navigate', { url: `${BASE}/definitely-not-a-page-xyz` })
await sleep(1500)
const nf = await ev(`(() => { const a = [...document.querySelectorAll('a[href="/about"]')]; return { aboutLinks: a.length, mapText: (document.querySelector('.nf-map') || document.body).textContent.includes('关于本站') } })()`)
console.log('404:', JSON.stringify(nf))
process.exit(0)