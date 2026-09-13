import axios from 'axios'

// 请求级开关：`silent401` = 这个请求的 401 **不跳登录页**。
// 为什么需要它（2026-09 线上事故）：作品详情页进页时会给"登录用户"记一条浏览历史，
// 而匿名访客没有身份 → 服务端 401 → 全局拦截器把**正在看 demo 的读者直接弹去登录页**。
// 根因是"全局 401 跳转" + "后台可选调用" 两类东西碰在一起：**背景请求失败不该改变用户的浏览位置**。
// 现在：记浏览这类可选调用一律标 silent401；用户主动动作（上传/评论/收藏切换）保持默认跳转。
declare module 'axios' {
  export interface AxiosRequestConfig {
    /** true = 此请求的 401 静默处理（不跳登录页）。仅用于后台/可选调用。 */
    silent401?: boolean
  }
}

export const http = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 15000,
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const cfg = error?.config as { url?: string; silent401?: boolean } | undefined
    // 登录态探测 /auth/me 返回 401 属正常（未登录），静默处理，不强制跳登录；
    // 标记了 silent401 的后台/可选调用同理（见上）；
    // 其他需要身份的接口（上传/评论/管理后台等）仍按 401 跳转到登录页。
    const isAuthProbe = cfg?.url?.includes('auth/me')
    const isSilent = cfg?.silent401 === true
    if (status === 401 && !isAuthProbe && !isSilent) {
      import('../router').then(({ default: router }) => {
        if (router.currentRoute.value.path !== '/login') {
          router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
        }
      })
    }
    const detail = error?.response?.data?.detail || error?.message || '请求失败'
    const code = error?.response?.data?.code || 'unknown'
    return Promise.reject(new Error(typeof detail === 'string' ? detail : JSON.stringify(detail), { cause: code }))
  },
)
