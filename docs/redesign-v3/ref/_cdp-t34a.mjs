// T34-A 桌面总验收：横幅/弹层回归（open 门控）/header 静默化/CTA 三档/条带/抽屉三律/Demo 重叠与常开
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
const out = {}
const errs = []
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 100)) })
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false })

// ── 1. home：横幅/弹层 open 门控回归/水位线 ──
await send('Page.navigate', { url: `${BASE}/` })
await sleep(2400)
out.banner = await ev(`(() => {
  const b = document.querySelector("[class*=ann-banner]") || [...document.querySelectorAll("section, div")].find(e => e.className && String(e.className).includes("banner") && /公告|announc/i.test(e.textContent))
  const strip = document.querySelector("[class*=site-strip]")
  return {
    bannerFound: !!b, bannerText: b ? b.textContent.trim().slice(0, 60) : null,
    unreadBadge: b ? (b.textContent.match(/\\d+\\s*条未读/) || [])[0] || null : null,
    allBtn: b ? /全部/.test(b.textContent) : false,
    headerGH: !!document.querySelector("header a[href*=github]"),
    ghTarget: (document.querySelector("header a[href*=github]") || {}).target,
    navLinks: [...document.querySelectorAll("header nav a, header .nav-link")].map(a => a.textContent.trim().slice(0, 6)).slice(0, 8),
    numstrip: (() => { const n = document.querySelector("[class*=numstrip], [class*=hero-num]"); return n ? n.textContent.trim().replace(/\\s+/g, "|").slice(0, 60) : null })(),
    wallGone: !document.querySelector("aside [class*=ann-block], .side-card [class*=ann-block]"),
    sideBlocks: [...document.querySelectorAll("[class*=side-block]")].length,
  }
})()`)
// 点击横幅 → 弹层 list 形态
out.bannerClick = await ev(`(async () => { const b = document.querySelector("[class*=ann-banner]") || [...document.querySelectorAll("section, div")].find(e => e.className && String(e.className).includes("banner") && /公告|announc/i.test(e.textContent)); if (!b) return "no-banner"; b.click(); await new Promise(r => setTimeout(r, 600)); return "clicked" })()`)
out.modalList = await ev(`(() => {
  const m = document.querySelector("[class*=modal], [class*=ann-modal], [class*=dialog]")
  if (!m) return { err: "modal not open" }
  const cs = getComputedStyle(m)
  return {
    open: true, cls: String(m.className).slice(0, 40),
    anim: cs.animationName + "/" + cs.animationDuration,
    borderW: cs.borderTopWidth, shadow: cs.boxShadow !== "none",
    groups: /置顶/.test(m.textContent) ? "top+ann" : /公告/.test(m.textContent) ? "ann" : "none",
    items: (m.textContent.match(/\\d{4}[-/]\\d{2}/g) || []).length,
  }
})()`)
// 关闭路径复验（builder 修的 open 门控泄漏）
out.close1 = await ev(`(async () => { const btn = [...document.querySelectorAll("[class*=modal] button, [class*=modal] [class*=close]")].find(b => /关闭|X|×|close/i.test(b.textContent + b.className) || b.getAttribute("aria-label")?.includes("关闭")); if (btn) { btn.click(); await new Promise(r => setTimeout(r, 300)); return { via: "btn", stillOpen: !!document.querySelector("[class*=modal][class*=open], .modal-backdrop") } } const m = document.querySelector("[class*=modal]"); if (m) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 300)); return { via: "esc", stillOpen: false } } return { via: "none" } })()`)
await sleep(200)
out.closed100 = await ev(`(() => ({ modalInDom: [...document.querySelectorAll("[class*=modal]")].filter(m => m.getBoundingClientRect().width > 0).length }))()`)
// 再开（门控双向）→ 再关
out.reopen = await ev(`(async () => { const b = document.querySelector("[class*=ann-banner]"); if (!b) return "no-banner"; b.click(); await new Promise(r => setTimeout(r, 500)); const open = !!document.querySelector("[class*=modal]"); return { reopened: open } })()`)
out.reclose = await ev(`(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 300)); const open = [...document.querySelectorAll("[class*=modal]")].filter(m => m.getBoundingClientRect().width > 0).length; return { reclosed: open === 0, ls: localStorage.getItem("dsh_ann_read_max") } })()`)
out.unreadAfter = await ev(`(() => ({ bannerUnread: (document.querySelector("[class*=ann-banner]") || document.body).textContent.match(/\\d+\\s*条未读/)?.[0] || "clean" }))()`)

// ── 2. header 静默化/exact-active/CTA 三档 ──
out.header = await ev(`(() => {
  const links = [...document.querySelectorAll("header nav a, header .nav-link")].slice(0, 6)
  const first = links[0]
  const cs = first ? getComputedStyle(first) : null
  const cta = [...document.querySelectorAll("header a")].find(a => /上传/.test(a.textContent))
  const support = [...document.querySelectorAll("a, button")].find(e => /支持维护/.test(e.textContent) && e.getBoundingClientRect().width > 0)
  const agent = [...document.querySelectorAll("a")].find(a => a.getAttribute("href")?.includes("agent-guide"))
  return {
    navSilent: cs ? { borderW: cs.borderTopWidth, bg: cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "transparent" : cs.backgroundColor.slice(0, 24) } : null,
    activeUnderline: (() => { const cur = links.find(a => a.className.includes("exact") || a.classList.contains("router-link-exact-active")); return cur ? getComputedStyle(cur).borderBottomWidth + "/" + getComputedStyle(cur).textDecorationLine : null })(),
    otherActive: links.filter(a => a !== first && (a.className.includes("active"))).length,
    ctaClass: cta ? String(cta.className).slice(0, 30) : null,
    supportHref: support ? support.getAttribute("href") : null,
    agentFound: !!agent,
  }
})()`)
// 条带 hover 反色（Input 真悬停）
out.stripHover = await ev(`(() => { const s = document.querySelector("[class*=site-strip]"); if (!s) return { err: "no strip" }; const item = [...s.querySelectorAll("a, button")][0]; if (!item) return { err: "no item" }; const r = item.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), baseBg: getComputedStyle(item).backgroundColor.slice(0, 24) } })()`)
if (out.stripHover && out.stripHover.x) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: out.stripHover.x, y: out.stripHover.y })
  await sleep(350)
  out.stripHover.hoverBg = await ev(`(() => { const s = document.querySelector("[class*=site-strip]"); const item = [...s.querySelectorAll("a, button")][0]; const c = getComputedStyle(item); return { bg: c.backgroundColor.slice(0, 24), color: c.color.slice(0, 20) } })()`)
}

// ── 3. demos 抽屉三律+drop+关闭再开+钉住 0ms ──
await send('Page.navigate', { url: `${BASE}/demos` })
await sleep(2200)
out.drawer = await ev(`(async () => { const b = document.querySelector(".facet-btn"); if (!b) return { err: "no facet-btn", pinned: localStorage.getItem("dsh_demos_facet_pin") }; b.click(); await new Promise(r => setTimeout(r, 700)); const p = document.querySelector(".facet-panel--overlay"); if (!p) return { err: "no overlay panel" }; const cs = getComputedStyle(p); return { cls: "overlay", anim: cs.animationName + "/" + cs.animationDuration, borderW: cs.borderTopWidth, shadow: cs.boxShadow.slice(0, 40), divider: (() => { const g = p.querySelector("[class*=fp-group]"); return g ? getComputedStyle(g).borderBottomWidth + " " + getComputedStyle(g).borderBottomStyle : null })() } })()`)
out.drawerCloseReopen = await ev(`(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 300)); const closed = !document.querySelector(".facet-panel--overlay"); const b = document.querySelector(".facet-btn"); if (b) b.click(); await new Promise(r => setTimeout(r, 600)); return { closedByEsc: closed, reopened: !!document.querySelector(".facet-panel--overlay") } })()`)

// ── 4. demo 页：滚动重叠/讨论常开 ──
await send('Page.navigate', { url: `${BASE}/demo/demo-c004ab51` })
await sleep(3200)
out.scrollOverlap = []
for (const y of [0, 300, 600, 900, 1200]) {
  await ev(`window.scrollTo(0, ${y})`)
  await sleep(300)
  out.scrollOverlap.push(await ev(`(() => { const ps = document.querySelector(".preview-shell"); const story = document.querySelector(".dv-story"); if (!ps || !story) return { stage: "gone" }; const pr = ps.getBoundingClientRect(); const sr = story.getBoundingClientRect(); const ov = Math.round(Math.min(pr.bottom, sr.bottom) - Math.max(pr.top, sr.top)); return { y: Math.round(scrollY), overlapPx: ov > 0 ? ov : 0 } })()`))
}
out.qc = await ev(`(() => { const ds = [...document.querySelectorAll(".dv-disclose")].map(d => ({ s: d.querySelector("summary")?.textContent.trim().slice(0, 14), open: d.open })); const hint = document.body.textContent.match(/常开[^。]{0,20}/); return { discloses: ds, hint: hint ? hint[0] : null } })()`)

out.consoleErrs = errs.filter(e => !e.includes("favicon")).slice(0, 5)
out.errCount = out.consoleErrs.length
console.log(JSON.stringify(out, null, 1))
ws.close()
process.exit(0)
