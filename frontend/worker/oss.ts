/**
 * 阿里云 OSS 适配层（Cloudflare Worker 内使用）
 * 通过 OSS REST API + HMAC-SHA1 签名访问，无需 R2/信用卡。
 *
 * 环境变量：
 *  - OSS_ENDPOINT          例如 oss-cn-hangzhou.aliyuncs.com
 *  - OSS_BUCKET            存储桶名
 *  - OSS_ACCESS_KEY_ID     AccessKey ID
 *  - OSS_ACCESS_KEY_SECRET AccessKey Secret（建议用 wrangler secret 存）
 */

export interface OssEnv {
  OSS_ENDPOINT: string
  OSS_BUCKET: string
  OSS_ACCESS_KEY_ID: string
  OSS_ACCESS_KEY_SECRET: string
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function hmacSha1(secret: string, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, enc.encode(data))
}

async function sign(
  env: OssEnv,
  method: string,
  contentType: string,
  date: string,
  resource: string,
  query?: string,
): Promise<string> {
  const canonicalizedResource = `/${env.OSS_BUCKET}${resource}${query ? `?${query}` : ''}`
  const stringToSign = `${method}\n\n${contentType}\n${date}\n${canonicalizedResource}`
  const signature = b64(await hmacSha1(env.OSS_ACCESS_KEY_SECRET, stringToSign))
  return `OSS ${env.OSS_ACCESS_KEY_ID}:${signature}`
}

function objectUrl(env: OssEnv, key: string): string {
  return `https://${env.OSS_BUCKET}.${env.OSS_ENDPOINT}/${key}`
}

export async function ossPut(env: OssEnv, key: string, data: Uint8Array | string, contentType = 'application/octet-stream'): Promise<void> {
  const date = new Date().toUTCString()
  const auth = await sign(env, 'PUT', contentType, date, `/${key}`)
  const res = await fetch(objectUrl(env, key), {
    method: 'PUT',
    headers: { Authorization: auth, Date: date, 'Content-Type': contentType },
    body: data as any,
  })
  if (!res.ok) throw new Error(`OSS put failed: ${res.status} ${await res.text()}`)
}

export async function ossGet(env: OssEnv, key: string): Promise<ArrayBuffer | null> {
  const date = new Date().toUTCString()
  const auth = await sign(env, 'GET', '', date, `/${key}`)
  const res = await fetch(objectUrl(env, key), {
    method: 'GET',
    headers: { Authorization: auth, Date: date },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`OSS get failed: ${res.status} ${await res.text()}`)
  return res.arrayBuffer()
}

export async function ossDelete(env: OssEnv, key: string): Promise<void> {
  const date = new Date().toUTCString()
  const auth = await sign(env, 'DELETE', '', date, `/${key}`)
  const res = await fetch(objectUrl(env, key), {
    method: 'DELETE',
    headers: { Authorization: auth, Date: date },
  })
  if (!res.ok && res.status !== 404) throw new Error(`OSS delete failed: ${res.status} ${await res.text()}`)
}

export async function ossList(env: OssEnv, prefix: string): Promise<string[]> {
  const date = new Date().toUTCString()
  const query = `prefix=${encodeURIComponent(prefix)}`
  const auth = await sign(env, 'GET', '', date, '/', query)
  const url = `https://${env.OSS_BUCKET}.${env.OSS_ENDPOINT}/?${query}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: auth, Date: date },
  })
  if (!res.ok) throw new Error(`OSS list failed: ${res.status} ${await res.text()}`)
  const xml = await res.text()
  const keys: string[] = []
  const re = /<Key>([^<]+)<\/Key>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    if (m[1].startsWith(prefix)) keys.push(m[1])
  }
  return keys
}
