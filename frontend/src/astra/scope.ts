// astra 橱窗前端视区判定（域名驱动，docs/astra橱窗分离.md）
//
// 生产：仅按 hostname 命中 astrademos.top（与后端 Host→scope 判定同一事实源，前端无法伪造数据面）。
// 本地开发：?astra=1 强制橱窗皮（sessionStorage 持久，?astra=0 关闭）——只影响 skin，
// 数据视区仍由后端按 Host 决定：想在本地拿真 astra 数据，给 backend .env 配 ASTRA_HOSTS=localhost。

const SS_KEY = 'astra_dev_preview'

export function isAstraSite(): boolean {
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search).get('astra')
    if (q === '1') sessionStorage.setItem(SS_KEY, '1')
    if (q === '0') sessionStorage.removeItem(SS_KEY)
    if (sessionStorage.getItem(SS_KEY) === '1') return true
  }
  const host = location.hostname.toLowerCase()
  return host === 'astrademos.top' || host.endsWith('.astrademos.top')
}
