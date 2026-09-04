// t16 补查：彩底按钮字色之谜 / pv-poster / dist css 资产
const CDP = 9333
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

// 主题置墨
await send('Page.navigate', { url: 'http://localhost:5173/demos' })
await new Promise((r) => setTimeout(r, 2500))
const probe1 = await ev(`(() => {
  const pick = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { cls: String(el.className).slice(0, 70), color: cs.color, bg: cs.backgroundColor } }
  const themeBtn = [...document.querySelectorAll('header button')].find(b => ['墨', '纸'].includes(b.textContent.trim()))
  const expand = [...document.querySelectorAll('button')].find(b => b.textContent.includes('展开'))
  const btns = [...document.querySelectorAll('.btn')].slice(0, 8).map(b => ({ t: b.textContent.trim().slice(0, 12), ...pick(b) }))
  const stats = [...document.querySelectorAll('.stat')].slice(0, 4).map(s => ({ t: s.textContent.trim().slice(0, 14), color: getComputedStyle(s).color, bg: getComputedStyle(s).backgroundColor }))
  return { theme: document.documentElement.dataset.theme, themeBtn: pick(themeBtn), expand: pick(expand), btns, stats }
})()`)
console.log('PROBE1 ' + JSON.stringify(probe1, null, 1))

// 访问 /demo 后再查 scoped 规则
await send('Page.navigate', { url: 'http://localhost:5173/demo/demo-c004ab51' })
await new Promise((r) => setTimeout(r, 3000))
const probe2 = await ev(`(() => {
  const sheets = [...document.styleSheets]
  let rules = 0; for (const s of sheets) { try { rules += s.cssRules.length } catch(e) {} }
  const want = ['.pv-poster', '.pv-overlay', '.dv-shell', '.rate-pair']
  const found = {}
  for (const w of want) found[w] = sheets.some(s => { try { return [...s.cssRules].some(r => r.selectorText && r.selectorText.includes(w)) } catch(e) { return false } })
  const cs = getComputedStyle(document.documentElement)
  return { ruleCount: rules, found, tokens: { err: cs.getPropertyValue('--err').trim(), onAccent: cs.getPropertyValue('--on-accent').trim(), pErr: cs.getPropertyValue('--p-err').trim(), kErr: cs.getPropertyValue('--k-err').trim() } }
})()`)
console.log('PROBE2 ' + JSON.stringify(probe2, null, 1))
ws.close()
process.exit(0)
