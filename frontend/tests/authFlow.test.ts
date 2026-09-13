// 身份/权限流的护栏：把「匿名访客不该被弹去登录页」钉成测试
//
// 背景（2026-09 线上事故，用户报「为啥现在看 demo 也需要先登录了」）：
//   · `api/recordView()`（记服务端浏览历史）要身份，匿名发过去是 401；
//   · 而 `api/http.ts` 有个**全局 401 → 跳 /login** 的拦截器；
//   · DemoView 进页时**无条件**调了它（注释写的是"登录时服务端也记一份"，守卫漏了）
//     ⇒ 匿名读者一进作品页就被弹去登录页。
//   · 更糟的是：我此前所有验收都用"已登录管理员"会话（SHOT_LOGIN=1），匿名路径从未被走过。
//
// 本文件钉三件事：
//   ① 拦截器必须尊重 silent401（后台/可选调用的 401 不许改用户位置）；
//   ② 不带 silent401 的 401 仍要跳登录（用户主动动作遇过期会话，跳转才是对的）；
//   ③ 源码层：views/components 里调 recordView 必须带登录守卫，且 api 层必须标 silent401。
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('../src/router', () => ({
  default: {
    currentRoute: { value: { path: '/demo/demo-8d4d500d', fullPath: '/demo/demo-8d4d500d' } },
    push,
  },
}))

const { http } = await import('../src/api/http')

/** 让 axios 走一个"必定 401"的假适配器，真实地穿过拦截器 */
function force401() {
  http.defaults.adapter = async (config) => {
    const err = Object.assign(new Error('Request failed with status code 401'), {
      config,
      response: { status: 401, data: { detail: '未登录或登录已过期', code: 'http_401' }, headers: {}, statusText: 'Unauthorized' },
      isAxiosError: true,
    })
    throw err
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('① 拦截器：silent401 的 401 不许跳登录页', () => {
  beforeEach(() => {
    push.mockClear()
    force401()
  })

  it('带 silent401 → 不跳转（后台/可选调用失败要静默）', async () => {
    await http.get('/me/history/demo-x', { silent401: true }).catch(() => undefined)
    await tick()
    expect(push, 'silent401 的请求把用户弹去了登录页').not.toHaveBeenCalled()
  })

  it('不带 silent401 → 仍跳登录（用户主动动作遇过期会话，跳转才是对的）', async () => {
    await http.post('/me/favorites/toggle', { slug: 'demo-x' }).catch(() => undefined)
    await tick()
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0].path).toBe('/login')
  })

  it('/auth/me 是登录态探测：401 属正常，也不许跳转', async () => {
    await http.get('/auth/me').catch(() => undefined)
    await tick()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('② 源码层：可选调用必须同时有"登录守卫"和"静默标记"', () => {
  const SRC = path.resolve(import.meta.dirname, '../src')

  function* walk(dir: string): Generator<string> {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) yield* walk(p)
      else if (/\.(vue|ts)$/.test(e.name)) yield p
    }
  }

  it('api 层的 recordView 必须带 silent401（双保险之一）', () => {
    const t = readFileSync(path.join(SRC, 'api/index.ts'), 'utf8')
    const i = t.indexOf('async recordView')
    expect(i).toBeGreaterThan(-1)
    const body = t.slice(i, t.indexOf('},', i))
    expect(body, 'recordView 没标 silent401：匿名 401 会把人弹去登录页').toMatch(/silent401:\s*true/)
  })

  it('views/components 里调 api.recordView 必须带 auth.isLoggedIn() 守卫（双保险之二）', () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      if (f.includes(`${path.sep}api${path.sep}`)) continue
      const src = readFileSync(f, 'utf8')
      let i = -1
      while ((i = src.indexOf('api.recordView(', i + 1)) !== -1) {
        const lineStart = src.lastIndexOf('\n', i) + 1
        const sameLine = src.slice(lineStart, src.indexOf('\n', i))
        const before = src.slice(Math.max(0, i - 300), i)
        if (!/isLoggedIn\(\)/.test(sameLine) && !/isLoggedIn\(\)/.test(before)) {
          const line = src.slice(0, i).split('\n').length
          offenders.push(f.replace(SRC, 'src') + ':' + line)
        }
      }
    }
    expect(offenders, '这些 recordView 调用没做登录判断：' + offenders.join(' ')).toEqual([])
  })
})
