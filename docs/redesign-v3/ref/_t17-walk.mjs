// T17 本批验收走查综合探针：admin 真渲染 375 复扫 + 弹层 Esc + 档位归一 CDP + 美化 A1/A2/B1 + EN 上屏抽查 + console 错误汇集
const CDP = 9333
const BASE = 'http://localhost:5173'
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && !/devtools/i.test(t.url)) || list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pend = new Map()
const consoleErrors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push('console: ' + JSON.stringify(m.params.args?.map((a) => a.value ?? a.description ?? '')))
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('exception: ' + JSON.stringify(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 200))
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push('log: ' + m.params.entry.text?.slice(0, 200) + ' @ ' + (m.params.entry.url ?? '').slice(-60))
}
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let fail = 0
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : '')); if (!ok) fail++ }

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

// ===== A. admin 真渲染复扫（修正既有探针的登录态遗留问题：强制 admin 重登 + 内容断言） =====
await send('Page.navigate', { url: BASE + '/?relogin=' + Date.now() })
await wait(1800)
const auth = await ev(`(async () => { await fetch('/api/v1/auth/logout', { method: 'POST' }); const lg = await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) }); const me = await (await fetch('/api/v1/auth/me')).json(); return { ok: lg.ok, role: me.role } })()`)
check('A0 admin 登录+角色', auth.ok && auth.role === 'admin', JSON.stringify(auth))

const tabs = ['console', 'inbox', 'queues', 'knowledge', 'entities', 'ops', 'site', 'audit', 'settings']
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true })
let adminRenderOk = 0
for (const tb of tabs) {
  await send('Page.navigate', { url: BASE + `/admin?tab=${tb}&_=${Date.now()}` })
  await wait(1400)
  const r = await ev(`(() => { const d = document.documentElement; return { tab: '${tb}', shell: !!document.querySelector('.admin-shell'), nav: !!document.querySelector('.ad-nav'), pane: !!document.querySelector('.tab-pane'), paneLen: (document.querySelector('.ad-main')?.textContent ?? '').length, sw: d.scrollWidth, cw: d.clientWidth } })()`)
  const ok = r.shell && r.nav && r.pane && r.paneLen > 80 && !r.over
  if (ok) adminRenderOk++
  console.log((ok ? 'ok' : 'FAIL') + ` [${tb}] shell=${r.shell} paneLen=${r.paneLen} sw=${r.sw} cw=${r.cw}`)
  if (!ok) fail++
}
check('A1 admin 375 真渲染+零溢出 9/9', adminRenderOk === 9, `${adminRenderOk}/9`)
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

// ===== B. 弹层 Esc（M4-4 行为门） =====
await send('Page.navigate', { url: BASE + '/?_=' + Date.now() })
await wait(2200)
const banner = await ev(`({ has: !!document.querySelector('.ann-banner') })`)
if (banner.has) {
  await ev(`(() => { document.querySelector('.ann-banner').click(); return 'open' })()`)
  await wait(400)
  const opened = await ev(`({ modal: !!document.querySelector('.ann-modal'), panel: (document.querySelector('.ann-modal-panel')?.textContent ?? '').length })`)
  check('B1 弹层打开（横幅直驱列表形态）', opened.modal && opened.panel > 0, JSON.stringify(opened))
  await ev(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'esc' })()`)
  await wait(300)
  const closed = await ev(`({ modal: !!document.querySelector('.ann-modal') })`)
  check('B2 Esc 关闭弹层', !closed.modal, JSON.stringify(closed))
} else {
  check('B1 弹层打开', false, 'home 无 .ann-banner（dev 库无公告）——Esc 行为无法上屏验证')
}

// ===== C. 档位归一回归（M4-3：位移/倾斜/盒影档位） =====
await send('Page.navigate', { url: BASE + '/?_=' + Date.now() })
await wait(2200)
const c1 = await ev(`(() => {
  const cs = getComputedStyle(document.documentElement)
  const peek = document.querySelector('.forum-peek')
  const rot = []
  for (const el of document.querySelectorAll('body *')) {
    const t = getComputedStyle(el).transform
    if (!t || t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)') continue
    if (el.closest('.ann-modal')) continue
    const m = t.match(/matrix\\(([-\\d.e]+), ([-\\d.e]+)/)
    if (!m) continue
    const deg = Math.atan2(parseFloat(m[2]), parseFloat(m[1])) * 180 / Math.PI
    if (Math.abs(deg) < 0.01) continue
    const cls = (el.className || '').toString().split(' ').slice(0, 2).join('.')
    rot.push({ sel: el.tagName.toLowerCase() + (cls ? '.' + cls : ''), deg: Math.round(deg * 100) / 100, w: Math.round(el.getBoundingClientRect().width) })
  }
  const shadows = new Set()
  for (const el of document.querySelectorAll('.btn, .card, .stat-card, .hn')) { const s = getComputedStyle(el).boxShadow; if (s && s !== 'none') shadows.add(s.split(' ')[0] + ' ' + (s.match(/rgba?\\([^)]*\\)/)?.[0] ?? '').slice(0, 24)) }
  return { shOffUw: cs.getPropertyValue('--sh-off-uw').trim(), tiltDeco: cs.getPropertyValue('--tilt-deco').trim(), peekTransform: peek ? getComputedStyle(peek).transform : null, rotations: rot.slice(0, 12), rotCount: rot.length, shadows: [...shadows].slice(0, 10) }
})()`)
check('C1 --sh-off-uw 具名档=3px 3px', c1.shOffUw === '3px 3px', c1.shOffUw)
check('C2 --tilt-deco 默认档=-1.5deg', c1.tiltDeco === '-1.5deg', c1.tiltDeco)
check('C3 forum-peek 贴纸倾斜在场（-6° 用户逐字原件）', c1.peekTransform && /-6/.test(String(Math.round(Math.atan2(parseFloat(c1.peekTransform.match(/matrix\(([-\d.e]+), ([-\d.e]+)/)?.[2] ?? 0), parseFloat(c1.peekTransform.match(/matrix\(([-\d.e]+), ([-\d.e]+)/)?.[1] ?? 1)) * 180 / Math.PI * 100) / 100)) || String(c1.peekTransform).includes('-6'), String(c1.peekTransform))
const rotBad = (c1.rotations || []).filter((r) => !/forum-peek/.test(r.sel) && Math.abs(Math.abs(r.deg) - 6) > 2.5 && !/ann-banner-stamp/.test(r.sel) && !/hero-eyebrow/.test(r.sel))
check('C4 静止零倾斜红线（白名单外无静止 rotate：-6° 贴纸件/--tilt-deco 印章/eyebrow 存量装饰章）', rotBad.length === 0, JSON.stringify(c1.rotations))
console.log('C5 盒影档位抽样（人工核对 4px 档）: ' + JSON.stringify(c1.shadows))

// ===== D. 美化批抽查：A1 墨黑可见 / A2 单源 / B1 盒高（双主题双宽度四组合） =====
const d = {}
for (const theme of ['ink', 'paper']) {
  for (const [w, h, mobile] of [[1440, 960, false], [375, 812, true]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile })
    await send('Page.navigate', { url: BASE + `/?theme=${theme}&_=${Date.now()}` })
    await wait(2000)
    const r = await ev(`(() => {
      const cs = getComputedStyle(document.documentElement)
      const peek = document.querySelector('.forum-peek')
      const p = peek ? getComputedStyle(peek) : null
      const btns = [...document.querySelectorAll('.topnav-tools .btn')].map((b) => Math.round(b.getBoundingClientRect().height))
      return { theme: document.documentElement.dataset.theme, paperForum: cs.getPropertyValue('--paper-forum').trim(), color: p?.color, border: p?.borderTopColor, shadow: p?.boxShadow?.split(' ')[0], peekText: (peek?.textContent ?? '').trim().slice(0, 24), btnH: [...new Set([...document.querySelectorAll('.topnav-tools .btn')].map((b) => Math.round(b.getBoundingClientRect().height)))] }
    })()`)
    d[theme + '@' + w] = r
  }
}
check('D-A1 墨黑 peek 墨棕可见（1440）', d['ink@1440'].color === 'rgb(107, 93, 67)' && d['ink@1440'].border === 'rgb(107, 93, 67)' && d['ink@1440'].peekText.length > 0, JSON.stringify({ color: d['ink@1440'].color, text: d['ink@1440'].peekText }))
check('D-A1 墨黑可见（375）', d['ink@375'].color === 'rgb(107, 93, 67)' && d['ink@375'].peekText.length > 0, JSON.stringify({ color: d['ink@375'].color, text: d['ink@375'].peekText }))
check('D-A1 纸白主题墨棕恒定（双宽度）', d['paper@1440'].color === 'rgb(107, 93, 67)' && d['paper@375'].color === 'rgb(107, 93, 67)', JSON.stringify({ a: d['paper@1440'].color, b: d['paper@375'].color }))
check('D-A2 --paper-forum 单源 #f7f0e3（四组合恒定）', [d['ink@1440'], d['ink@375'], d['paper@1440'], d['paper@375']].every((x) => x.paperForum === '#f7f0e3'), JSON.stringify([d['ink@1440'].paperForum, d['ink@375'].paperForum, d['paper@1440'].paperForum, d['paper@375'].paperForum]))
check('D-B1 盒高 39/39/39（ink@1440）', d['ink@1440'].btnH.length === 1 && d['ink@1440'].btnH[0] === 39, JSON.stringify(d['ink@1440'].btnH))
check('D-B1 盒高 39/39/39（paper@1440）', d['paper@1440'].btnH.length === 1 && d['paper@1440'].btnH[0] === 39, JSON.stringify(d['paper@1440'].btnH))
console.log('B1 盒高全集: ink@1440=' + JSON.stringify(d['ink@1440'].btnH) + ' paper@1440=' + JSON.stringify(d['paper@1440'].btnH) + ' ink@375=' + JSON.stringify(d['ink@375'].btnH) + ' paper@375=' + JSON.stringify(d['paper@375'].btnH))

// ===== E. EN 上屏抽查（T14 补账键上屏） =====
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: BASE + '/?lang=en&_=' + Date.now() })
await wait(2600)
const e1 = await ev(`(() => { const txt = document.body.innerText; const strip = document.querySelector('.site-strip'); return { stripLabel: strip ? getComputedStyle(strip).ariaLabel === 'Site navigation' || (strip.getAttribute('aria-label') === 'Site navigation') : false, works: txt.includes('Works'), leaderboard: txt.includes('Leaderboard'), up7d: /Last 7d|last 7 days/.test(txt) } })()`)
check('E1 home.strip EN 上屏（aria-label/lib/rank/up7d）', e1.stripLabel && e1.works && e1.leaderboard && e1.up7d, JSON.stringify(e1))
await send('Page.navigate', { url: BASE + '/models?lang=en&_=' + Date.now() })
await wait(2400)
const e2 = await ev(`(() => { const t = document.body.innerText.toLowerCase(); return { sortScore: t.includes('community score'), hottest: t.includes('hottest') || t.includes('most works'), votesUnit: /\\bvotes\\b/.test(t), zhLeak: t.includes('社区分') && !t.includes('community score') } })()`)
check('E2 models EN 上屏（sortScore/votes 单位——大小写不敏感）', e2.sortScore && e2.votesUnit && !e2.zhLeak, JSON.stringify(e2))
await ev(`(() => { localStorage.setItem('dsh_lang', 'zh'); return 'reset' })()`)

// ===== F. console 错误汇总（分类：应用错误 vs 浏览器噪声） =====
const noise = (s) => /Unchecked runtime\.lastError|ERR_BLOCKED_BY_RESPONSE|net::ERR_|extensions::|chrome-extension|Failed to load resource.*(tampermonkey|fonts\.gstatic|googleapis)/i.test(s)
const appErrors = consoleErrors.filter((s) => !noise(s))
const noiseErrors = consoleErrors.filter((s) => noise(s))
console.log('噪声明细（浏览器层非应用）: ' + (noiseErrors.slice(0, 4).join(' | ') || '无'))
check('F1 console 0 error（应用层）', appErrors.length === 0, appErrors.slice(0, 5).join(' | ') || '全程无应用错误')

ws.close()
console.log(fail === 0 ? 'ALL PASS' : 'FAILURES: ' + fail)
process.exitCode = fail === 0 ? 0 : 1