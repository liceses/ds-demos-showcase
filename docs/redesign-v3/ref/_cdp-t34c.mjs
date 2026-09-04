// T34-C 收束：弹层 drop 立即抓（enter 类窗口内）+ divider 伪元素/全类扫描
const CDP = 9333
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 250)); return r.result.value }
await send('Page.enable')
const out = {}
await send('Page.navigate', { url: `${BASE}/` })
await sleep(2300)
out.modalDropFast = await ev(`(async () => { const b = document.querySelector("[class*=ann-banner]"); b.click(); await new Promise(r => setTimeout(r, 90)); const m = document.querySelector("[class*=ann-modal]"); if (!m) return { err: "modal not in dom at 90ms" }; const chain = []; let cur = m; let d = 0; while (cur && d < 4) { const cs = getComputedStyle(cur); chain.push({ cls: String(cur.className).slice(0, 30), anim: cs.animationName, dur: cs.animationDuration, clsList: [...cur.classList].filter(c => c.includes("drop") || c.includes("enter") || c.includes("stamp")).join(",") }); cur = cur.parentElement; d++ } const animEls = [...document.querySelectorAll("*")].filter(e => { const c = getComputedStyle(e).animationName; return c.includes("stamp-drop") || c.includes("drop-up") }).map(e => String(e.className).slice(0, 30)); return { chain, animEls } })()`)
await ev(`(() => { const btn = [...document.querySelectorAll("[class*=ann-modal] button")].find(b => /关闭|X|×/.test(b.textContent)); if (btn) btn.click(); return 1 })()`)
// divider 伪元素+全类扫描
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(2200)
await ev(`document.querySelector(".facet-btn").click()`)
await sleep(650)
out.dividerDeep = await ev(`(() => { const p = document.querySelector(".facet-panel--overlay"); if (!p) return { err: "no panel" }; const pseudo = []; for (const el of [p, ...p.querySelectorAll("[class*=fp-group], [class*=fp-head], [class*=fp-group-head]")].slice(0, 6)) { for (const pe of ["::after", "::before"]) { const c = getComputedStyle(el, pe); if (c.borderTopWidth !== "0px" || c.borderBottomWidth !== "0px" || (c.height !== "auto" && c.height !== "0px" && c.backgroundColor !== "rgba(0, 0, 0, 0)")) pseudo.push({ el: String(el.className).slice(0, 26), pe, bt: c.borderTopWidth, h: c.height, bg: c.backgroundColor.slice(0, 18) }) } } const allBorders = [...p.querySelectorAll("*")].map(e => ({ c: e, bt: getComputedStyle(e).borderTopWidth })).filter(x => x.bt !== "0px").slice(0, 5).map(x => String(x.c.className).slice(0, 30) + " bt=" + x.bt); return { pseudo: pseudo.slice(0, 6), allBorders } })()`)
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
