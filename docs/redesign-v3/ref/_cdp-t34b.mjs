// T34-B 补测：弹层 drop 挂点/strip hover 复核/divider 实现位/未读徽章重置/弹层关闭路径/reduced-motion/375 全程
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
const fs = await import('node:fs')
await send('Page.enable')
const out = {}

// 1. 未读徽章（清水位线重置 → reload → 横幅黄章）
await send('Page.navigate', { url: `${BASE}/` })
await sleep(2200)
await ev(`localStorage.removeItem("dsh_ann_read_max")`)
await send('Page.reload')
await sleep(2200)
out.badgeReset = await ev(`(() => { const b = document.querySelector("[class*=ann-banner]"); const m = b ? b.textContent.match(/\\d+\\s*条未读/) : null; const badgeEl = b ? [...b.querySelectorAll("[class*=unread], [class*=badge], [class*=side-unread], .tag-chip, .eyebrow")].find(e => /未读/.test(e.textContent)) : null; return { text: m ? m[0] : null, badgeCls: badgeEl ? String(badgeEl.className).slice(0, 36) : null, badgeBg: badgeEl ? getComputedStyle(badgeEl).backgroundColor.slice(0, 24) : null } })()`)

// 2. 横幅点击开弹层 → drop 挂点 + 关闭路径三法（btn/Esc/backdrop）
out.modalOpen = await ev(`(async () => { const b = document.querySelector("[class*=ann-banner]"); b.click(); await new Promise(r => setTimeout(r, 450)); const scan = []; let el = document.querySelector("[class*=ann-modal]"); const root = el ? el.parentElement : null; const chain = []; let cur = document.querySelector("[class*=ann-modal]"); while (cur && chain.length < 4) { const cs = getComputedStyle(cur); chain.push({ cls: String(cur.className).slice(0, 28), anim: cs.animationName + "/" + cs.animationDuration }); cur = cur.parentElement } return { chain } })()`)
out.closePath = await ev(`(async () => { const r = {}; const btn = [...document.querySelectorAll("[class*=ann-modal] button")].find(b => /关闭|X|×/.test(b.textContent) || b.getAttribute("aria-label")?.includes("关闭")); if (btn) { btn.click(); await new Promise(r2 => setTimeout(r2, 250)); r.viaBtn = [...document.querySelectorAll("[class*=ann-modal]")].filter(m => m.getBoundingClientRect().width > 0).length === 0 } const b2 = document.querySelector("[class*=ann-banner]"); if (b2) { b2.click(); await new Promise(r2 => setTimeout(r2, 450)); r.reopened2 = true; const bd = [...document.querySelectorAll("[class*=backdrop], [class*=overlay], [class*=mask]")].find(x => x.getBoundingClientRect().width > 0); if (bd) { bd.click(); await new Promise(r3 => setTimeout(r3, 250)); r.viaBackdrop = [...document.querySelectorAll("[class*=ann-modal]")].filter(m => m.getBoundingClientRect().width > 0).length === 0 } else { r.noBackdrop = true; const mm = [...document.querySelectorAll("[class*=ann-modal]")].filter(m => m.getBoundingClientRect().width > 0)[0]; if (mm) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise(r3 => setTimeout(r3, 250)); r.viaEsc = [...document.querySelectorAll("[class*=ann-modal]")].filter(m => m.getBoundingClientRect().width > 0).length === 0 } } } return r })()`)

// 3. strip hover 复核（容器级+条带第 2 项）
out.stripHover2 = await ev(`(() => { const s = document.querySelector("[class*=site-strip]"); const items = [...s.querySelectorAll("a, button")]; const it = items[1] || items[0]; const r = it.getBoundingClientRect(); const cs = getComputedStyle(it); return { cls: String(it.className).slice(0, 34), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), base: cs.backgroundColor.slice(0, 22), hoverRule: (() => { const sheets = [...document.styleSheets]; let hit = 0; for (const sh of sheets) { try { for (const rule of sh.cssRules) { if (rule.selectorText && rule.selectorText.includes("site-strip") && rule.selectorText.includes("hover")) hit++ } } catch (e) {} } return hit })() } })()`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: out.stripHover2.x, y: out.stripHover2.y })
await sleep(380)
out.stripHoverAfter = await ev(`(() => { const s = document.querySelector("[class*=site-strip]"); const items = [...s.querySelectorAll("a, button")]; const it = items[1] || items[0]; const c = getComputedStyle(it); const c2 = getComputedStyle(s); return { itemBg: c.backgroundColor.slice(0, 22), itemColor: c.color.slice(0, 18), stripBg: c2.backgroundColor.slice(0, 22) } })()`)

// 4. divider 实现位（抽屉组间分隔）
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(2200)
await ev(`document.querySelector(".facet-btn").click()`)
await sleep(600)
out.dividerProbe = await ev(`(() => { const p = document.querySelector(".facet-panel--overlay"); if (!p) return { err: "no panel" }; const gs = [...p.querySelectorAll("[class*=fp-group]")]; const probe = gs.slice(0, 4).map(g => { const c = getComputedStyle(g); return { cls: String(g.className).slice(0, 30), bb: c.borderBottomWidth + "/" + c.borderBottomStyle, bt: c.borderTopWidth + "/" + c.borderTopStyle } }); const seps = [...p.querySelectorAll("[class*=divider], hr")].length; const heads = [...p.querySelectorAll("[class*=fp-group-head]")].slice(0, 2).map(h => { const c = getComputedStyle(h); return { bt: c.borderTopWidth + "/" + c.borderTopStyle, bb: c.borderBottomWidth + "/" + c.borderBottomStyle } }); return { groups: probe, seps, heads } })()`)
await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`)

// 5. reduced-motion：drop 退场
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await send('Page.reload')
await sleep(2400)
out.rmDrawer = await ev(`(async () => { const b = document.querySelector(".facet-btn"); if (!b) return "no btn"; b.click(); await new Promise(r => setTimeout(r, 500)); const p = document.querySelector(".facet-panel--overlay"); return p ? { anim: getComputedStyle(p).animationName, dur: getComputedStyle(p).animationDuration } : "no panel" })()`)
await send('Emulation.setEmulatedMedia', { features: [] })
await send('Page.reload')
await sleep(2200)

// 6. 375 全程（home/demos/demo：溢出+横幅+条带横滚+bottom-sheet 镜像+动作条）
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 740, deviceScaleFactor: 2, mobile: true })
const m375 = {}
for (const [n, p] of [['home', '/'], ['demos', '/demos'], ['demo', '/demo/demo-c004ab51']]) {
  await send('Page.navigate', { url: BASE + p })
  await sleep(2400)
  m375[n] = await ev(`(() => ({ w: document.documentElement.scrollWidth, vw: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 2, banner: (document.querySelector("[class*=ann-banner]") || {}).textContent ? String(document.querySelector("[class*=ann-banner]").textContent).trim().slice(0, 30) : null, strip: document.querySelector("[class*=site-strip]") ? "on" : null, ctaFull: (() => { const a = [...document.querySelectorAll("a, button")].find(x => /投稿|上传/.test(x.textContent) && x.getBoundingClientRect().width > 100); return a ? Math.round(a.getBoundingClientRect().width) : null })() }))()`)
}
out.m375 = m375
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(2200)
out.sheet375 = await ev(`(async () => { const b = document.querySelector(".facet-btn"); b.click(); await new Promise(r => setTimeout(r, 700)); const p = document.querySelector(".facet-panel--sheet"); if (!p) return { err: "no sheet" }; const cs = getComputedStyle(p); return { pos: cs.position, bottom: cs.bottom, anim: cs.animationName + "/" + cs.animationDuration, borderW: cs.borderTopWidth, shadow: cs.boxShadow.slice(0, 36) } })()`)
const s = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref/t34-m375-demos.png', Buffer.from(s.data, 'base64'))
await send('Emulation.clearDeviceMetricsOverride')
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
