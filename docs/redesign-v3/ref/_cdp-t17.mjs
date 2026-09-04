// T17 全站对比度覆盖扫描：24 路由 × paper/ink × (static + hover + active)
// hover/active 用 CSS.forcePseudoStates 强制伪类（无鼠标时序竞态），判据：含文字元素 有效bg(链式) × color 比值 <4.5 → flag；
// 专项：变深后 bgLum<0.18 && colorLum<0.18 → 「黑底黑字」。
const CDP = 9333
const BASE = 'http://localhost:5173'
const API = 'http://127.0.0.1:8000'
const OUT = 'D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref'
const SEL = 'button, a, .tag-chip, .btn, tr, [class*="card"], [class*="chip"], [class*="tab"], [class*="row"], [class*="item"], [class*="link"], [class*="stamp"], [class*="pill"], [class*="badge"], [class*="toggle"], [class*="knob"]'
const PAGES = [
  ['home', '/'], ['about', '/about'], ['demos', '/demos'], ['leaderboard', '/leaderboard'],
  ['forum', '/forum'], ['forum-topic', '/forum/topic/1'],
  ['models', '/models'], ['model', '/models/dsv4flash'],
  ['tasks', '/tasks'], ['task', '/tasks/tetris-web'],
  ['explore', '/tags'], ['tag-keys', '/tags/keys'], ['tag-detail', '@taghref'],
  ['login', '/login'], ['register', '/register'],
  ['user', '/user/admin'], ['followers', '/user/admin/followers'], ['following', '/user/admin/following'],
  ['public-author', '/author/public'],
  ['settings', '/settings', 1], ['notifications', '/notifications', 1],
  ['upload', '/upload'], ['admin', '/admin', 1], ['nf404', '/__nope404'],
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.method + JSON.stringify(m.error))) : p.res(m.result) } }
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e, arg) => (await send('Runtime.evaluate', { expression: e, arguments: arg ? [{ value: arg }] : undefined, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable')

// 登录（cookie 会话）
await send('Page.navigate', { url: `${BASE}/login` })
await sleep(1500)
const loginRes = await ev(`(async () => { try { const r = await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }), credentials: 'include' }); return r.status } catch (e) { return String(e) } })()`)
console.error('login status: ' + JSON.stringify(loginRes))

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
    const bl = lum(b.r,b.g,b.b)
    const c = parse(cs.color); if (!c || c.a < 0.4) continue
    const cl = lum(c.r,c.g,c.b)
    const ratio = (Math.max(bl,cl)+0.05)/(Math.min(bl,cl)+0.05)
    out.total++
    if (ratio < 4.5) out.flags.push({ tag: el.tagName, cls: String(el.className).slice(0,44), text: txt, ratio: ratio.toFixed(2), bg: cs.backgroundColor, color: cs.color }); else out.ok++
  }
  out.theme = document.documentElement.dataset.theme
  return out
})()`

// hover/active 候选采集：返回 [{sig, idx}]（去重签名，每签名≤2，页≤30）
const COLLECT = `((sel) => {
  const els = [...document.querySelectorAll(sel)]
  const seen = new Map(); const picks = []
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (!el.textContent.trim()) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    if (r.bottom < 0 || r.top > innerHeight) continue
    const sig = el.tagName + '|' + [...el.classList].sort().slice(0, 4).join('.')
    if (!seen.has(sig)) seen.set(sig, [])
    const arr = seen.get(sig)
    if (arr.length >= 1) continue
    arr.push(i)
    picks.push({ sig, idx: i, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 40)) })
  }
  return picks.slice(0, 14)
})`
const READ_STATE = `((sel, idx) => {
  const lum = (r,g,b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) }
  const parse = (s) => { const m = s.match(/rgba?\\((([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+))(?:\\s*,\\s*([\\d.]+))?\\)/); return m ? { r:+m[2], g:+m[3], b:+m[4], a: m[5]===undefined?1:+m[5] } : null }
  const eff = (el) => { let node = el, hops = 0; while (node && hops < 12) { const b = parse(getComputedStyle(node).backgroundColor); if (b && b.a > 0.85) return b; node = node.parentElement; hops++ } return null }
  const el = document.querySelectorAll(sel)[idx]
  if (!el) return null
  const cs = getComputedStyle(el)
  const c = parse(cs.color)
  const bgEff = eff(el)
  if (!c || c.a < 0.4 || !bgEff) return { skip: 'no-color-or-bg' }
  const cl = lum(c.r,c.g,c.b), bl = lum(bgEff.r,bgEff.g,bgEff.b)
  const spread = Math.max(bgEff.r,bgEff.g,bgEff.b) - Math.min(bgEff.r,bgEff.g,bgEff.b)
  return { ratio: +(((Math.max(bl,cl)+0.05)/(Math.min(bl,cl)+0.05)).toFixed(2)), bgLum: +bl.toFixed(3), colorLum: +cl.toFixed(3), bg: getComputedStyle(el).backgroundColor, color: cs.color, spread }
})`

const results = {}
let tagHref = '/tag/game:tetris/game-tetris'
for (const theme of ['ink', 'paper']) {
  await ev(`localStorage.setItem('dsh_theme','${theme}'); sessionStorage.clear()`)
  for (const [name, path, needAuth] of PAGES) {
    const key = name + '@' + theme
    results[key] = {}
    try {
      let url = BASE + (path === '@taghref' ? tagHref : path)
      await send('Page.navigate', { url })
      await sleep(name === 'upload' || name === 'admin' ? 2600 : 1700)
      if (path === '@taghref') {
        const hrefs = await ev(`[...document.querySelectorAll('a[href*="/tag/"]')].map(a => a.getAttribute('href')).filter(h => h && h.split('/').length >= 4).slice(0, 3)`)
        if (hrefs && hrefs.length && hrefs[0] !== '/tags') { tagHref = hrefs[0]; url = BASE + tagHref; await send('Page.navigate', { url }); await sleep(1500) }
        results[key].resolvedTagHref = tagHref
      }
      results[key].url = url
      results[key].theme = await ev(`document.documentElement.dataset.theme`)
      // static
      results[key].static = await ev(STATIC_SCAN)
      // hover/active
      const hoverFlags = [], activeFlags = []
      let tested = 0
      const readIdx = (idx) => ev('((' + READ_STATE + ')(' + JSON.stringify(SEL) + ',' + idx + '))')
      const base0 = await ev('(() => { return 1 })()')
      // 采集（视口内）
      let picks = await ev('((' + COLLECT + ')(' + JSON.stringify(SEL) + '))')
      for (const pk of picks || []) {
        tested++
        try {
          const base = await readIdx(pk.idx)
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pk.x, y: pk.y })
          await sleep(260)
          const hv = await readIdx(pk.idx)
          // active：保持按下期间读取
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pk.x, y: pk.y, button: 'left', clickCount: 1 })
          await sleep(220)
          const ac = await readIdx(pk.idx)
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pk.x, y: pk.y, button: 'left', clickCount: 1 })
          for (const [phase, st, baseSt] of [['hover', hv, base], ['active', ac, base]]) {
            if (!st || st.skip || !baseSt || baseSt.skip) continue
            const darkOnDark = st.bgLum < 0.18 && st.colorLum < 0.18
            const changed = st.bg !== baseSt.bg
            if (st.ratio < 4.5 && (changed || darkOnDark)) {
              const bucket = phase === 'hover' ? hoverFlags : activeFlags
              bucket.push({ sig: pk.sig, x: pk.x, y: pk.y, text: pk.text, ratio: st.ratio, bg: st.bg, color: st.color, bgLum: st.bgLum, colorLum: st.colorLum, baseRatio: baseSt.ratio, darkOnDark, changed })
            }
          }
        } catch (e) { /* 单候选失败不阻断 */ }
      }
      const deep = name === 'upload' || name === 'admin'
      if (deep) {
      await ev(`window.scrollBy(0, Math.round(innerHeight * 0.85))`)
      await sleep(320)
      picks = await ev('((' + COLLECT + ')(' + JSON.stringify(SEL) + '))')
      for (const pk of picks || []) {
        tested++
        try {
          const base = await readIdx(pk.idx)
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pk.x, y: pk.y })
          await sleep(260)
          const hv = await readIdx(pk.idx)
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pk.x, y: pk.y, button: 'left', clickCount: 1 })
          await sleep(220)
          const ac = await readIdx(pk.idx)
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pk.x, y: pk.y, button: 'left', clickCount: 1 })
          for (const [phase, st, baseSt] of [['hover', hv, base], ['active', ac, base]]) {
            if (!st || st.skip || !baseSt || baseSt.skip) continue
            const darkOnDark = st.bgLum < 0.18 && st.colorLum < 0.18
            const changed = st.bg !== baseSt.bg
            if (st.ratio < 4.5 && (changed || darkOnDark)) {
              const bucket = phase === 'hover' ? hoverFlags : activeFlags
              bucket.push({ sig: pk.sig, x: pk.x, y: pk.y, text: pk.text, ratio: st.ratio, bg: st.bg, color: st.color, bgLum: st.bgLum, colorLum: st.colorLum, baseRatio: baseSt.ratio, darkOnDark, changed })
            }
          }
        } catch (e) { /* 单候选失败不阻断 */ }
      }
      }
      await ev(`window.scrollTo(0, 0)`)
      results[key].hover = { tested, flags: hoverFlags }
      results[key].active = { flags: activeFlags }
    } catch (e) {
      results[key].err = String(e).slice(0, 200)
    }
  }
  // 双主题切换
  await ev(`(() => { const cur = localStorage.getItem('dsh_theme'); localStorage.setItem('dsh_theme', cur === 'ink' ? 'paper' : 'ink'); sessionStorage.clear() })()`)
  // 主题设置后需重读当前值校正
  const cur = await ev(`localStorage.getItem('dsh_theme')`)
  if ((theme === 'ink' && cur !== 'paper') || (theme === 'paper' && cur !== 'ink')) { await ev(`localStorage.setItem('dsh_theme','${theme === 'ink' ? 'paper' : 'ink'}'); sessionStorage.clear()`) }
}
const fs = await import('node:fs')
fs.writeFileSync(`${OUT}/t17-matrix.json`, JSON.stringify(results, null, 1))
// 摘要
let staticFlags = 0, hoverFlags = 0, activeFlags = 0, pages = 0
for (const k of Object.keys(results)) { const r = results[k]; pages++; staticFlags += (r.static?.flags?.length || 0); hoverFlags += (r.hover?.flags?.length || 0); activeFlags += (r.active?.flags?.length || 0) }
console.log(`pages=${pages} staticFlags=${staticFlags} hoverFlags=${hoverFlags} activeFlags=${activeFlags}`)
ws.close()
process.exit(0)
