import axios from 'axios'

export const http = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 15000,
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    // 登录态探测 /auth/me 返回 401 属正常（未登录），静默处理，不强制跳登录；
    // 其他需要身份的接口（上传/评论/管理后台等）仍按 401 跳转到登录页。
    const isAuthProbe = error?.config?.url?.includes('auth/me')
    if (status === 401 && !isAuthProbe) {
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
