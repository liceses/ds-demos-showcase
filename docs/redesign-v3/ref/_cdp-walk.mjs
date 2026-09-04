// t16 P1 验收走查 · CDP 驱动（node24 原生 WebSocket + Edge headless）
// 用法：先起 Edge（--remote-debugging-port=9333），再 node _cdp-walk.mjs <phase>
// phases: theme | ink | fouc | astra | css | all
const CDP = 9333
const BASE = 'http://localhost:5173'
const OUT = 'D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getTarget() {
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')
  return page.webSocketDebuggerUrl
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const handlers = new Map()
    let seq = 0
    const pending = new Map()
    ws.onopen = () => resolve({
      ws,
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = ++seq
          pending.set(id, { res, rej })
          ws.send(JSON.stringify({ id, method, params }))
        })
      },
      on(method, fn) { handlers.set(method, fn) },
      close() { ws.close() },
    })
    ws.onerror = (e) => reject(new Error('ws error'))
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id)
        pending.delete(m.id)
        m.error ? p.rej(new Error(m.method + ' ' + JSON.stringify(m.error))) : p.res(m.result)
      } else if (m.method && handlers.has(m.method)) {
        handlers.get(m.method)(m.params)
      }
    }
  })
}

let cdp
async function evaljs(expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}
async function nav(url, settle = 1200) {
  const done = new Promise((r) => cdp.on('Page.loadEventFired', r))
  await cdp.send('Page.navigate', { url })
  await done
  await sleep(settle)
}
async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync(`${OUT}/${name}`, Buffer.from(r.data, 'base64'))
  return `${OUT}/${name}`
}
const ls = (cmd) => evaljs(`(function(){ try { ${cmd} } catch(e) {} return localStorage.getItem('dsh_theme') })()`)

// ---------- 主题四路径 ----------
async function phaseTheme() {
  const out = {}
  await nav(`${BASE}/?theme=0`, 800)
  await evaljs(`localStorage.setItem('dsh_theme','paper'); sessionStorage.clear()`)
  await nav(`${BASE}`, 900)
  out.p0_default = await evaljs(`document.documentElement.dataset.theme`)

  // 路径① 顶栏循环
  out.p1_cycle = await evaljs(`(function(){
    const btn = [...document.querySelectorAll('header button')].find(b => ['墨','纸'].includes(b.textContent.trim()))
    if (!btn) return { err: 'theme button not found' }
    const before = document.documentElement.dataset.theme
    btn.click()
    const mid = { cls: document.documentElement.className, theme: document.documentElement.dataset.theme }
    return { before, mid, label: btn.textContent.trim() }
  })()`)
  await sleep(350)
  out.p1_after = await evaljs(`({ theme: document.documentElement.dataset.theme, cls: document.documentElement.className, label: ([...document.querySelectorAll('header button')].find(b => ['墨','纸'].includes(b.textContent.trim()))||{}).textContent, ls: localStorage.getItem('dsh_theme') })`)

  // 路径② 移动抽屉 foot
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 740, deviceScaleFactor: 2, mobile: true })
  await nav(`${BASE}`, 1000)
  out.p2_drawer = await evaljs(`(function(){
    const tg = document.querySelector('.mobile-nav-toggle')
    if (!tg) return { err: 'no mobile toggle' }
    tg.click()
    return { clicked: true }
  })()`)
  await sleep(600)
  out.p2_drawer2 = await evaljs(`(function(){
    const drawer = document.querySelector('.mobile-drawer')
    if (!drawer) return { err: 'drawer not open after click' }
    const foot = [...drawer.querySelectorAll('button, a')].map(b => b.textContent.trim()).slice(0, 10)
    const themeBtn = [...drawer.querySelectorAll('button')].find(b => b.textContent.includes('墨') || b.textContent.includes('纸'))
    if (!themeBtn) return { err: 'no drawer theme btn', foot }
    const before = document.documentElement.dataset.theme
    themeBtn.click()
    return { before, footCount: foot.length, foot, themeBtnLabel: themeBtn.textContent.trim() }
  })()`)
  await sleep(350)
  out.p2_after = await evaljs(`document.documentElement.dataset.theme`)
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  // 路径③ ?theme=ink 分享链接
  await evaljs(`localStorage.setItem('dsh_theme','paper'); sessionStorage.clear()`)
  await nav(`${BASE}/demos?theme=ink`, 1000)
  out.p3_urlParam = await evaljs(`({ theme: document.documentElement.dataset.theme, preview: sessionStorage.getItem('dsh_theme_preview'), ls: localStorage.getItem('dsh_theme'), path: location.pathname })`)

  // 路径④ 系统跟随
  await evaljs(`localStorage.setItem('dsh_theme','system'); sessionStorage.clear()`)
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await nav(`${BASE}`, 1000)
  out.p4_sysDark = await evaljs(`document.documentElement.dataset.theme`)
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await nav(`${BASE}`, 1000)
  out.p4_sysLight = await evaljs(`document.documentElement.dataset.theme`)
  await cdp.send('Emulation.setEmulatedMedia', { features: [] })
  await evaljs(`localStorage.setItem('dsh_theme','ink'); sessionStorage.clear()`)
  return out
}

// ---------- 墨黑三页走查 ----------
const SCAN = `(() => {
  const lum = (r,g,b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b) }
  const parse = (s) => { const m = s.match(/rgba?\\((([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+))(?:\\s*,\\s*([\\d.]+))?\\)/); return m ? { r:+m[2], g:+m[3], b:+m[4], a: m[5]===undefined?1:+m[5] } : null }
  const out = { flags: [], warmShadow: 0, darkShadow: 0, scanned: 0 }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.textContent.trim() === '') continue
    const c = parse(cs.color); if (!c || c.a < 0.4) continue
    out.scanned++
    const cl = lum(c.r, c.g, c.b)
    if (cl < 0.18) {
      let node = el, hops = 0, light = false
      while (node && hops < 14) {
        const b = parse(getComputedStyle(node).backgroundColor)
        if (b && b.a > 0.85 && lum(b.r, b.g, b.b) >= 0.18) { light = true; break }
        node = node.parentElement; hops++
      }
      if (!light) out.flags.push({ tag: el.tagName, cls: String(el.className).slice(0, 70), color: cs.color, text: el.textContent.trim().slice(0, 50) })
    }
    const sh = cs.boxShadow
    if (sh && sh !== 'none') {
      if (sh.includes('245, 242, 234') || sh.includes('245,242,234')) out.warmShadow++
      else if (sh.includes('rgba(0, 0, 0') || sh.includes('rgba(0,0,0')) out.darkShadow++
    }
  }
  const pair = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const c = parse(cs.color); let node = el; let bg = null; while (node) { const b = parse(getComputedStyle(node).backgroundColor); if (b && b.a > 0.85) { bg = b; break } node = node.parentElement } if (!c || !bg) return null; const l1 = lum(c.r,c.g,c.b), l2 = lum(bg.r,bg.g,bg.b); return sel + ' ' + ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2) + ':1 ' + cs.color + ' on ' + (bg ? 'rgb('+bg.r+','+bg.g+','+bg.b+')' : '?') }
  out.pairs = ['.demo-card .dc-title', '.demo-card .dc-meta', '.muted', '.mono-xs', '.tag-chip', '.btn', '.btn-primary', '.stat', '.entry-capsule .entry-capsule-title', 'h1.huge', '.sub', '.section-title'].map(pair).filter(Boolean)
  return out
})()`

async function phaseInk() {
  const out = {}
  await nav(`${BASE}/`, 800)
  await evaljs(`localStorage.setItem('dsh_theme','ink'); sessionStorage.clear()`)
  for (const [key, url] of [['home', `${BASE}/`], ['demos', `${BASE}/demos`], ['demo', `${BASE}/demo/demo-c004ab51`]]) {
    await nav(url, 1800)
    const r = await evaljs(SCAN)
    out[key] = { theme: await evaljs(`document.documentElement.dataset.theme`), ...r }
    out[key].shot = await shot(`t16-${key}-ink.png`)
  }
  return out
}

// ---------- FOUC + 硬切闸 ----------
async function phaseFouc() {
  const out = {}
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__t16 = { set: null }; try { new MutationObserver((ms) => { for (const m of ms) if (m.attributeName === 'data-theme' && window.__t16.set === null) window.__t16.set = performance.now() }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }) } catch(e) { window.__t16.err = String(e) }` })
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await nav(`${BASE}/?cachebust=${Date.now()}`, 1500)
  out.fouc = await evaljs(`({ set: window.__t16 && window.__t16.set, fcp: (performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime ?? null, theme: document.documentElement.dataset.theme })`)
  if (typeof out.fouc.set === 'number' && typeof out.fouc.fcp === 'number') out.fouc.verdict = out.fouc.set <= out.fouc.fcp ? 'PASS: data-theme 先于 FCP' : 'FAIL: FCP 早于 data-theme'
  else out.fouc.verdict = 'probe inconclusive'
  // 静态序：内联脚本在样式表之前
  const html = await (await fetch(`${BASE}/`)).text()
  const iScript = html.indexOf("dsh_theme")
  const iLink = html.indexOf('<link')
  const iModule = html.indexOf('type="module"')
  out.htmlOrder = { scriptAt: iScript, linkAt: iLink, moduleAt: iModule, ok: iScript > -1 && iScript < iLink && iScript < iModule }
  // 硬切闸
  out.gate = await evaljs(`(function(){ const b=[...document.querySelectorAll('header button')].find(x=>['墨','纸'].includes(x.textContent.trim())); if(!b) return {err:'no btn'}; b.click(); return { mid: document.documentElement.className.includes('theme-switching'), theme: document.documentElement.dataset.theme } })()`)
  await sleep(400)
  out.gateAfter = await evaljs(`({ switching: document.documentElement.className.includes('theme-switching'), theme: document.documentElement.dataset.theme })`)
  await evaljs(`localStorage.setItem('dsh_theme','ink'); sessionStorage.clear()`)
  return out
}

// ---------- astra 回归 ----------
async function phaseAstra() {
  const out = {}
  // node:http Host 冒烟（fetch 改不了 Host 头——文档 §五·五）
  const http = await import('node:http')
  const req = (host, path) => new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: 8000, path, headers: { Host: host } }, (rs) => {
      let b = ''; rs.on('data', (c) => (b += c)); rs.on('end', () => res({ status: rs.statusCode, body: b.slice(0, 400) }))
    })
    r.on('error', rej); r.end()
  })
  out.apiSmoke = {}
  try {
    const si = await req('astrademos.top', '/api/v1/meta/site-info')
    out.apiSmoke.siteInfo = { status: si.status, fun: si.body.includes('"fun_mode":true') || si.body.includes('"fun_mode": true'), snippet: si.body.slice(0, 160) }
    const docs = await req('astrademos.top', '/docs')
    out.apiSmoke.docs404 = docs.status === 404
    const deep = await req('localhost', '/api/v1/meta/site-info')
    out.apiSmoke.deepOk = deep.status === 200
  } catch (e) { out.apiSmoke.err = String(e) }
  // 皮肤 ?astra=1（sessionStorage 持久——测完 ?astra=0 恢复）
  await nav(`${BASE}/?astra=1`, 1800)
  out.works = await evaljs(`({ url: location.href, text: document.body.innerText.slice(0, 160), hasAstra: /astra/i.test(document.body.innerText) })`)
  out.works.shot = await shot('t16-astra-works.png')
  await nav(`${BASE}/about`, 1500)
  out.about = await evaljs(`({ text: document.body.innerText.slice(0, 140) })`)
  out.about.shot = await shot('t16-astra-about.png')
  await nav(`${BASE}/demo/demo-c004ab51`, 1800)
  out.work = await evaljs(`({ text: document.body.innerText.slice(0, 140) })`)
  out.work.shot = await shot('t16-astra-work.png')
  // 恢复主站
  await nav(`${BASE}/?astra=0`, 1200)
  out.restored = await evaljs(`({ text: document.body.innerText.slice(0, 80), isMain: !/astra lab/i.test(document.body.innerText.slice(0, 400)) })`)
  await evaljs(`sessionStorage.clear()`)
  return out
}

// ---------- CSS 回归抽查 ----------
async function phaseCss() {
  return evaljs(`(() => {
    const sheets = [...document.styleSheets]
    let rules = 0
    for (const s of sheets) { try { rules += s.cssRules.length } catch(e) {} }
    const want = ['.entry-capsule', '.dv-shell', '.fl-row', '.stat-mint', '.tag-chip', '.btn-primary', '.demo-card', '.pv-poster', '.uw-err', '.brief-caveat', '.mobile-nav-toggle', '.topbar']
    const found = {}
    for (const w of want) {
      found[w] = sheets.some((s) => { try { return [...s.cssRules].some((r) => r.selectorText && r.selectorText.includes(w)) } catch(e) { return false } })
    }
    const cs = getComputedStyle(document.documentElement)
    return { ruleCount: rules, found, tokens: { bDurPage: cs.getPropertyValue('--b-dur-page').trim(), ink: cs.getPropertyValue('--ink').trim(), paper: cs.getPropertyValue('--paper').trim(), err: cs.getPropertyValue('--err').trim(), tiltRest: cs.getPropertyValue('--tilt-rest').trim() } }
  })()`)
}

// ---------- main ----------
const phase = process.argv[2] || 'all'
const wsUrl = await getTarget()
cdp = await connect(wsUrl)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
const results = {}
try {
  if (phase === 'theme' || phase === 'all') results.theme = await phaseTheme()
  if (phase === 'ink' || phase === 'all') results.ink = await phaseInk()
  if (phase === 'fouc' || phase === 'all') results.fouc = await phaseFouc()
  if (phase === 'css' || phase === 'all') results.css = await phaseCss()
  if (phase === 'astra' || phase === 'all') results.astra = await phaseAstra()
} catch (e) {
  results.FATAL = String(e && e.stack || e)
}
console.log(JSON.stringify(results, null, 1))
cdp.close()
process.exit(0)
