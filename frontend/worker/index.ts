/**
 * DS 民间科研成果展示 —— Cloudflare Worker 全栈后端
 * 一个 Worker 同时服务：静态前端(assets) + /api/v1 API + /preview + /media
 *
 * 存储：D1(DB 绑定) + 阿里云 OSS(文件绑定) —— 不需要 Cloudflare 信用卡/R2
 */
import { Hono } from 'hono'
import { unzipSync } from 'fflate'
import { ossDelete, ossGet, ossList, ossPut } from './oss'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  AUTO_APPROVE?: string
  OSS_ENDPOINT: string
  OSS_BUCKET: string
  OSS_ACCESS_KEY_ID: string
  OSS_ACCESS_KEY_SECRET: string
}

type Bindings = { Bindings: Env }

const app = new Hono<Bindings>()

// ---------------------------------------------------------------- utils
const now = () => new Date().toISOString()

const json = (c: any, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

const err = (c: any, status: number, detail: string, code = `http_${status}`) =>
  json(c, { detail, code }, status)

function sanitizePath(p: string): string | null {
  const parts = p.replace(/\\/g, '/').split('/').filter((x) => x !== '' && x !== '.')
  if (parts.some((x) => x === '..')) return null
  return parts.join('/')
}

// ---------------------------------------------------------------- password / token
async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const imported = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as any, iterations: 100000, hash: 'SHA-256' },
    imported,
    256,
  )
  const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
  return `pbkdf2$${b64(salt.buffer as ArrayBuffer)}$${b64(bits)}`
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    const [scheme, saltB64, hashB64] = encoded.split('$')
    if (scheme !== 'pbkdf2') return false
    const enc = new TextEncoder()
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
    const expected = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0))
    const imported = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as any, iterations: 100000, hash: 'SHA-256' },
      imported,
      256,
    )
    const got = new Uint8Array(bits)
    if (got.length !== expected.length) return false
    return expected.every((v, i) => v === got[i])
  } catch {
    return false
  }
}

async function sha256hex(data: Uint8Array | string): Promise<string> {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', input)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function createSession(env: Env, userId: number): Promise<string> {
  const token = randomToken()
  const tokenHash = await sha256hex(token)
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .bind(tokenHash, userId, now(), expiresAt)
    .run()
  return token
}

interface SessionUser { id: number; username: string; role: string; status: string; bio: string; created_at?: string }

async function currentUser(c: any): Promise<SessionUser | null> {
  const env: Env = c.env
  let token = c.req.header('authorization')?.startsWith('Bearer ')
    ? c.req.header('authorization')!.slice(7).trim()
    : c.req.header('cookie')?.match(/(?:^|;\s*)demo_token=([^;]+)/)?.[1]
  if (!token) return null
  const tokenHash = await sha256hex(token)
  const row = await env.DB.prepare(
    `SELECT s.expires_at as expires_at, u.id as id, u.username as username, u.role as role, u.status as status, u.bio as bio, u.created_at as created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<any>()
  if (!row || row.status !== 'active') return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null
  return { id: row.id, username: row.username, role: row.role, status: row.status, bio: row.bio, created_at: row.created_at }
}

async function requireUser(c: any): Promise<SessionUser> {
  const u = await currentUser(c)
  if (!u) throw { status: 401, detail: '未登录或登录已过期', code: 'http_401' }
  return u
}

async function requireAdmin(c: any): Promise<SessionUser> {
  const u = await requireUser(c)
  if (u.role !== 'admin') throw { status: 403, detail: '需要管理员权限', code: 'http_403' }
  return u
}

// ---------------------------------------------------------------- D1 init
let inited = false
async function initDb(env: Env) {
  if (inited) return
  inited = true
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      bio TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      parent_id INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE(key, value)
    );
    CREATE TABLE IF NOT EXISTS demos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      view_count INTEGER NOT NULL DEFAULT 0,
      download_count INTEGER NOT NULL DEFAULT 0,
      author_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_tags (
      demo_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (demo_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      demo_id INTEGER NOT NULL,
      user_id INTEGER,
      parent_id INTEGER,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      demo_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      demo_id INTEGER NOT NULL,
      hash TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL,
      author_email TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      snapshot_key TEXT NOT NULL,
      parent_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `
  // D1 exec 不支持一次执行多语句，改为 batch 逐条执行
  const statements = sql.split(';').map((s) => s.trim()).filter(Boolean)
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)))

  // seed 初始标签
  const tagCount = await env.DB.prepare('SELECT COUNT(*) as n FROM tags').first<{ n: number }>()
  if (!tagCount || tagCount.n === 0) {
    await env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)')
      .bind('model', 'dsv4', '模型版本总类', null, now())
      .run()
    const root = await env.DB.prepare('SELECT id FROM tags WHERE key=? AND value=?').bind('model', 'dsv4').first<{ id: number }>()
    const pid = root ? root.id : null
    await env.DB.batch([
      env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind('model', 'dsv4-flash', 'DeepSeek V4 Flash —— 快速推理', pid, now()),
      env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind('model', 'dsv4-pro', 'DeepSeek V4 Pro —— 强推理', pid, now()),
      env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind('plugin', 'routing-suite', '路由套件插件', null, now()),
      env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind('skills', 'J-space', 'J-space 技能工作区', null, now()),
      env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind('preset', 'router-standard', '标准路由预设', null, now()),
      env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind('type', 'effect', '视觉特效类', null, now()),
      env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind('type', 'widget', '小组件类', null, now()),
      env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind('type', 'game', '小游戏类', null, now()),
    ])
  }

  // seed 管理员
  const admin = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind('admin').first()
  if (!admin) {
    const ph = await hashPassword('admin123')
    await env.DB.prepare('INSERT INTO users (username,password_hash,role,status,bio,created_at) VALUES (?,?,?,?,?,?)')
      .bind('admin', ph, 'admin', 'active', '站点管理员', now())
      .run()
  }

  // settings
  const autoApprove = (env.AUTO_APPROVE ?? 'true') === 'true'
  await env.DB.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind('auto_approve', autoApprove ? 'true' : 'false').run()
}

// ---------------------------------------------------------------- serializers
async function tagsOf(env: Env, demoId: number): Promise<{ key: string; value: string }[]> {
  const r = await env.DB.prepare(
    `SELECT t.key as key, t.value as value FROM demo_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.demo_id = ? ORDER BY t.id`,
  )
    .bind(demoId)
    .all<{ key: string; value: string }>()
  return r.results
}

async function tagOut(env: Env, row: any): Promise<any> {
  const demoCount = await env.DB.prepare('SELECT COUNT(*) as n FROM demo_tags WHERE tag_id=?').bind(row.id).first<{ n: number }>()
  const childCount = await env.DB.prepare('SELECT COUNT(*) as n FROM tags WHERE parent_id=?').bind(row.id).first<{ n: number }>()
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    description: row.description,
    parent_id: row.parent_id,
    demo_count: demoCount?.n ?? 0,
    child_count: childCount?.n ?? 0,
  }
}

async function demoOut(env: Env, row: any, opts: { detail?: boolean; viewer?: SessionUser | null } = {}): Promise<any> {
  const author = row.author_id
    ? await env.DB.prepare('SELECT username FROM users WHERE id=?').bind(row.author_id).first<{ username: string }>()
    : null
  const tags = await tagsOf(env, row.id)
  const [commentCount, sessionCount, commitCount] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) as n FROM comments WHERE demo_id=?').bind(row.id),
    env.DB.prepare('SELECT COUNT(*) as n FROM session_logs WHERE demo_id=?').bind(row.id),
    env.DB.prepare('SELECT COUNT(*) as n FROM commits WHERE demo_id=?').bind(row.id),
  ])
  const out: any = {
    slug: row.slug,
    title: row.title,
    description: row.description,
    cover_url: row.cover_url,
    author: author?.username ?? null,
    author_id: row.author_id,
    tags,
    view_count: row.view_count,
    download_count: row.download_count,
    comment_count: (commentCount.results?.[0] as any)?.n ?? 0,
    created_at: row.created_at,
    status: row.status,
  }
  if (opts.detail) {
    out.session_log_count = (sessionCount.results?.[0] as any)?.n ?? 0
    out.commit_count = (commitCount.results?.[0] as any)?.n ?? 0
    out.is_author = !!opts.viewer && row.author_id === opts.viewer.id
    out.storage_size = 0
    out.inconsistency = false
  }
  return out
}

// ---------------------------------------------------------------- auth routes
const api = new Hono<Bindings>()

api.post('/auth/register', async (c) => {
  const env = c.env as Env
  const body = await c.req.json().catch(() => null)
  const username: string = body?.username ?? ''
  const password: string = body?.password ?? ''
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return err(c, 422, '用户名需为 3-32 位字母数字下划线')
  if (password.length < 8) return err(c, 422, '密码至少 8 位')
  const exists = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first()
  if (exists) return err(c, 409, '用户名已存在')
  const ph = await hashPassword(password)
  const res = await env.DB.prepare('INSERT INTO users (username,password_hash,role,status,bio,created_at) VALUES (?,?,?,?,?,?)')
    .bind(username, ph, 'user', 'active', '', now())
    .run()
  const user = await env.DB.prepare('SELECT id,username,role,status,bio,created_at FROM users WHERE username=?').bind(username).first()
  const token = await createSession(env, user!.id as number)
  return withCookie(json(c, { access_token: token, user: user }, 201), token)
})

api.post('/auth/login', async (c) => {
  const env = c.env as Env
  const body = await c.req.json().catch(() => null)
  const { username = '', password = '' } = body ?? {}
  const user = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first<any>()
  if (!user || !(await verifyPassword(password, user.password_hash))) return err(c, 401, '用户名或密码错误')
  if (user.status !== 'active') return err(c, 403, '账号不可用')
  const token = await createSession(env, user.id)
  delete user.password_hash
  return withCookie(json(c, { access_token: token, user }, 200), token)
})

api.post('/auth/logout', async (c) => {
  const u = await requireUser(c)
  const cookie = c.req.header('cookie')
  const token = cookie?.match(/(?:^|;\s*)demo_token=([^;]+)/)?.[1]
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256hex(token)).run()
  const res = new Response(null, { status: 204 })
  res.headers.append('set-cookie', 'demo_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
  return res
})

api.get('/auth/me', async (c) => {
  const u = await currentUser(c)
  if (!u) return err(c, 401, '未登录或登录已过期')
  return json(c, u)
})

api.get('/users/:username', async (c) => {
  const env = c.env as Env
  const user = await env.DB.prepare('SELECT id,username,role,status,bio,created_at FROM users WHERE username=?').bind(c.req.param('username')).first<any>()
  if (!user) return err(c, 404, '用户不存在')
  const demoCount = await env.DB.prepare('SELECT COUNT(*) as n FROM demos WHERE author_id=?').bind(user.id).first<{ n: number }>()
  return json(c, { ...user, demo_count: demoCount?.n ?? 0 })
})

api.patch('/users/:id', async (c) => {
  const env = c.env as Env
  await requireAdmin(c)
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<any>()
  if (!user) return err(c, 404, '用户不存在')
  const role = body?.role ?? user.role
  const status = body?.status ?? user.status
  await env.DB.prepare('UPDATE users SET role=?, status=? WHERE id=?').bind(role, status, id).run()
  const updated = await env.DB.prepare('SELECT id,username,role,status,bio,created_at FROM users WHERE id=?').bind(id).first<any>()
  const demoCount = await env.DB.prepare('SELECT COUNT(*) as n FROM demos WHERE author_id=?').bind(id).first<{ n: number }>()
  return json(c, { ...updated, demo_count: demoCount?.n ?? 0 })
})

// ---------------------------------------------------------------- tags
api.get('/tags', async (c) => {
  const env = c.env as Env
  const r = await env.DB.prepare('SELECT * FROM tags ORDER BY key, value').all<any>()
  return json(c, await Promise.all(r.results.map((row) => tagOut(env, row))))
})

api.get('/tags/:keyvalue', async (c) => {
  const env = c.env as Env
  const kv = c.req.param('keyvalue')
  const idx = kv.indexOf(':')
  if (idx < 0) return err(c, 404, '标签不存在')
  const key = kv.slice(0, idx)
  const value = kv.slice(idx + 1)
  const row = await env.DB.prepare('SELECT * FROM tags WHERE key=? AND value=?').bind(key, value).first<any>()
  if (!row) return err(c, 404, '标签不存在')
  const out = await tagOut(env, row)
  out.parent = row.parent_id ? await env.DB.prepare('SELECT * FROM tags WHERE id=?').bind(row.parent_id).first<any>().then((r: any) => (r ? tagOut(env, r) : null)) : null
  const children = await env.DB.prepare('SELECT * FROM tags WHERE parent_id=?').bind(row.id).all<any>()
  out.children = await Promise.all(children.results.map((r: any) => tagOut(env, r)))
  return json(c, out)
})

api.post('/tags', async (c) => {
  const env = c.env as Env
  await requireUser(c)
  const body = await c.req.json().catch(() => null)
  const key: string = body?.key ?? ''
  const value: string = body?.value ?? ''
  if (key === 'author') return err(c, 400, 'author 为保留 key')
  const duplicate = await env.DB.prepare('SELECT id FROM tags WHERE key=? AND value=?').bind(key, value).first()
  if (duplicate) return err(c, 409, '标签已存在')
  const parent_id = body?.parent_id ?? null
  if (parent_id) {
    const p = await env.DB.prepare('SELECT id FROM tags WHERE id=?').bind(parent_id).first()
    if (!p) return err(c, 404, '父标签不存在')
  }
  await env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)')
    .bind(key, value, body?.description ?? '', parent_id, now())
    .run()
  const row = await env.DB.prepare('SELECT * FROM tags WHERE key=? AND value=?').bind(key, value).first<any>()
  return json(c, await tagOut(env, row), 201)
})

// ---------------------------------------------------------------- demos
api.get('/demos', async (c) => {
  const env = c.env as Env
  await initDb(env)
  const url = new URL(c.req.url)
  const status = url.searchParams.get('status') || 'approved'
  const tagParams = url.searchParams.getAll('tag')
  const q = url.searchParams.get('q') || ''
  const sort = url.searchParams.get('sort') || 'newest'
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') || 20)))

  let where = 'WHERE d.status = ?'
  const binds: any[] = [status]
  if (tagParams.length) {
    for (const kv of tagParams) {
      const idx = kv.indexOf(':')
      const key = kv.slice(0, idx)
      const value = kv.slice(idx + 1)
      where += ' AND d.id IN (SELECT dt.demo_id FROM demo_tags dt JOIN tags t ON t.id=dt.tag_id WHERE t.key=? AND t.value=?)'
      binds.push(key, value)
    }
  }
  if (q) {
    where += ' AND (d.title LIKE ? OR d.description LIKE ? OR d.id IN (SELECT dt.demo_id FROM demo_tags dt JOIN tags t ON t.id=dt.tag_id WHERE (t.key || ":" || t.value) LIKE ?))'
    const like = `%${q}%`
    binds.push(like, like, like)
  }
  const order = sort === 'popular' ? 'd.view_count DESC' : 'd.created_at DESC'
  const total = await env.DB.prepare(`SELECT COUNT(*) as n FROM demos d ${where}`).bind(...binds).first<{ n: number }>()
  const rows = await env.DB.prepare(`SELECT d.* FROM demos d ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<any>()
  return json(c, {
    items: await Promise.all(rows.results.map((r) => demoOut(env, r))),
    total: total?.n ?? 0,
    page,
    page_size: pageSize,
  })
})

api.get('/demos/:slug', async (c) => {
  const env = c.env as Env
  const viewer = await currentUser(c)
  const row = await env.DB.prepare('SELECT * FROM demos WHERE slug=?').bind(c.req.param('slug')).first<any>()
  if (!row) return err(c, 404, 'Demo 不存在')
  await env.DB.prepare('UPDATE demos SET view_count = view_count + 1 WHERE id=?').bind(row.id).run()
  row.view_count += 1
  return json(c, await demoOut(env, row, { detail: true, viewer }))
})

function makeSlug(title: string): string {
  const base = (title || 'demo').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'demo'
  return `${base}-${Math.random().toString(16).slice(2, 10)}`
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
}

function contentType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[ext] || 'application/octet-stream'
}

async function storeDemoZip(env: Env, slug: string, data: Uint8Array, authorName: string): Promise<Record<string, number | string>[]> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(data)
  } catch {
    throw { status: 400, detail: 'zip 文件非法', code: 'http_400' }
  }
  const paths = Object.keys(entries).filter((p) => !p.endsWith('/'))
  let root = ''
  if (!paths.includes('index.html')) {
    const topDirs = new Set(paths.map((p) => p.split('/')[0]))
    if (topDirs.size === 1) {
      const dir = [...topDirs][0]
      if (paths.includes(`${dir}/index.html`)) root = `${dir}/`
      else throw { status: 400, detail: 'zip 中缺少 index.html', code: 'http_400' }
    } else {
      throw { status: 400, detail: 'zip 中缺少 index.html', code: 'http_400' }
    }
  }

  const writes: Promise<any>[] = []
  const manifest: Record<string, number | string>[] = []
  // 覆盖旧文件：先删本 demo 的 files 前缀
  const toDelete = await ossList(env, `demos/${slug}/files/`)
  for (const key of toDelete) writes.push(ossDelete(env, key))

  for (const p of paths) {
    // root 表示要剥离的顶层目录前缀（如 pvz/），直接去掉，避免路径重复
    const rel = sanitizePath(root ? p.slice(root.length) : p)
    if (!rel) continue
    if (rel.startsWith('sessions/')) {
      const filename = rel.slice('sessions/'.length).split('/').join('-')
      writes.push(ossPut(env, `demos/${slug}/sessions/${filename}`, entries[p], contentType(filename)))
      writes.push(env.DB.prepare('DELETE FROM session_logs WHERE demo_id=(SELECT id FROM demos WHERE slug=?) AND filename=?').bind(slug, filename).run())
      writes.push(env.DB.prepare('INSERT INTO session_logs (demo_id, filename, file_size, created_at) VALUES ((SELECT id FROM demos WHERE slug=?),?,?,?)').bind(slug, filename, entries[p].length, now()).run())
      continue
    }
    writes.push(ossPut(env, `demos/${slug}/files/${rel}`, entries[p], contentType(rel)))
    const h = await sha256hex(entries[p])
    manifest.push({ path: rel, size: entries[p].length, hash: h })
  }
  await Promise.all(writes)
  return manifest
}

async function commitSnapshot(env: Env, slug: string, demoId: number, authorName: string, manifest: Record<string, number | string>[], message = 'update demo') {
  const date = now()
  const hash = await sha256hex(JSON.stringify({ manifest, date, demoId }))
  const snapshotKey = `demos/${slug}/snapshots/${hash}.json`
  await ossPut(env, snapshotKey, JSON.stringify(manifest), 'application/json')
  const prev = await env.DB.prepare('SELECT hash FROM commits WHERE demo_id=? ORDER BY id DESC LIMIT 1').bind(demoId).first<{ hash: string }>()
  await env.DB.prepare('INSERT INTO commits (demo_id, hash, message, author, author_email, date, snapshot_key, parent_hash) VALUES (?,?,?,?,?,?,?,?)')
    .bind(demoId, hash, message, authorName, `${authorName}@demo-site`, date, snapshotKey, prev?.hash ?? null)
    .run()
  return hash
}

api.post('/demos', async (c) => {
  const env = c.env as Env
  const user = await requireUser(c)
  const form = await c.req.formData()
  const title: string = String(form.get('title') ?? '').trim()
  const description: string = String(form.get('description') ?? '')
  const tagsRaw: string = String(form.get('tags') ?? '')
  const file = form.get('file')
  if (!title) return err(c, 422, '缺少标题')
  if (!file || !(file instanceof File)) return err(c, 400, '必须上传 zip 文件')
  if (!file.name.toLowerCase().endsWith('.zip')) return err(c, 400, '必须上传 zip 文件')
  const data = new Uint8Array(await file.arrayBuffer())
  const autoApprove = (await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('auto_approve').first<{ value: string }>())?.value === 'true'
  const slug = makeSlug(title)
  const coverUrl = '/media/covers/default.svg'
  // 默认封面
  await ossPut(env, 'media/covers/default.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#4ecdc4"/><rect x="14" y="14" width="612" height="452" fill="none" stroke="#000" stroke-width="8"/><text x="320" y="250" font-family="Arial, sans-serif" font-size="64" font-weight="900" text-anchor="middle" fill="#000">DS DEMO</text></svg>', 'image/svg+xml')

  const res = await env.DB.prepare('INSERT INTO demos (slug,title,description,cover_url,status,author_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(slug, title, description, coverUrl, autoApprove ? 'approved' : 'pending', user.id, now(), now())
    .run()
  const demo = await env.DB.prepare('SELECT * FROM demos WHERE slug=?').bind(slug).first<any>()

  try {
    await ossPut(env, `demos/${slug}/source.zip`, data, 'application/zip')
    const manifest = await storeDemoZip(env, slug, data, user.username)
    const commitHash = await commitSnapshot(env, slug, demo.id, user.username, manifest)
    await commitMeta(env, demo.id, commitHash, 'update demo', user.username, now())
  } catch (e: any) {
    await env.DB.prepare('DELETE FROM demos WHERE id=?').bind(demo.id).run()
    if (e?.status) return err(c, e.status, e.detail, e.code)
    throw e
  }

  // tags
  let tags: string[] = []
  try {
    tags = JSON.parse(tagsRaw)
  } catch { /* ignore */ }
  tags.push(`author:${user.username}`)
  await setDemosTags(env, demo.id, tags)

  return json(c, { slug, status: autoApprove ? 'approved' : 'pending' }, 201)
})

async function setDemosTags(env: Env, demoId: number, keyValues: string[]) {
  await env.DB.prepare('DELETE FROM demo_tags WHERE demo_id=?').bind(demoId).run()
  for (const kv of keyValues) {
    const idx = kv.indexOf(':')
    if (idx < 0) continue
    const key = kv.slice(0, idx)
    const value = kv.slice(idx + 1)
    let tag = await env.DB.prepare('SELECT id FROM tags WHERE key=? AND value=?').bind(key, value).first<{ id: number }>()
    if (!tag) {
      await env.DB.prepare('INSERT INTO tags (key,value,description,parent_id,created_at) VALUES (?,?,?,?,?)').bind(key, value, '', null, now()).run()
      tag = await env.DB.prepare('SELECT id FROM tags WHERE key=? AND value=?').bind(key, value).first<{ id: number }>()
    }
    await env.DB.prepare('INSERT OR IGNORE INTO demo_tags (demo_id, tag_id) VALUES (?,?)').bind(demoId, tag!.id).run()
  }
}

async function commitMeta(env: Env, demoId: number, hash: string, message: string, author: string, date: string) {
  await env.DB.prepare('UPDATE commits SET message=?, author=?, date=? WHERE demo_id=? AND hash=?')
    .bind(message, author, date, demoId, hash)
    .run()
}

api.put('/demos/:slug', async (c) => {
  const env = c.env as Env
  const user = await requireUser(c)
  const demo = await env.DB.prepare('SELECT * FROM demos WHERE slug=?').bind(c.req.param('slug')).first<any>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  if (demo.author_id !== user.id && user.role !== 'admin') return err(c, 403, '无权修改该 Demo')
  const form = await c.req.formData()
  const title = form.get('title') ? String(form.get('title')).trim() : demo.title
  const description = form.get('description') !== null ? String(form.get('description')) : demo.description
  await env.DB.prepare('UPDATE demos SET title=?, description=?, updated_at=? WHERE id=?').bind(title, description, now(), demo.id).run()
  const tagsRaw = form.get('tags')
  if (tagsRaw !== null) {
    let tags: string[] = []
    try { tags = JSON.parse(String(tagsRaw)) } catch { /* ignore */ }
    if (!tags.some((t) => t.startsWith('author:'))) tags.push(`author:${user.username}`)
    await setDemosTags(env, demo.id, tags)
  }
  const file = form.get('file')
  if (file && file instanceof File) {
    const data = new Uint8Array(await file.arrayBuffer())
    try {
      const manifest = await storeDemoZip(env, demo.slug, data, user.username)
      const hash = await commitSnapshot(env, demo.slug, demo.id, user.username, manifest)
      await commitMeta(env, demo.id, hash, 'update demo', user.username, now())
    } catch (e: any) {
      if (e?.status) return err(c, e.status, e.detail, e.code)
      throw e
    }
  }
  return new Response(null, { status: 204 })
})

api.delete('/demos/:slug', async (c) => {
  const env = c.env as Env
  const user = await requireUser(c)
  const demo = await env.DB.prepare('SELECT * FROM demos WHERE slug=?').bind(c.req.param('slug')).first<any>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  if (demo.author_id !== user.id && user.role !== 'admin') return err(c, 403, '无权删除该 Demo')
  await env.DB.prepare('DELETE FROM demos WHERE id=?').bind(demo.id).run()
  const keys = await ossList(env, `demos/${demo.slug}/`)
  await Promise.all(keys.map((k) => ossDelete(env, k)))
  return new Response(null, { status: 204 })
})

api.get('/demos/:slug/download', async (c) => {
  const env = c.env as Env
  const demo = await env.DB.prepare('SELECT * FROM demos WHERE slug=?').bind(c.req.param('slug')).first<any>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  const buf = await ossGet(env, `demos/${demo.slug}/source.zip`)
  if (!buf) return err(c, 404, 'Demo 文件不存在')
  await env.DB.prepare('UPDATE demos SET download_count = download_count + 1 WHERE id=?').bind(demo.id).run()
  return new Response(buf, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${demo.slug}.zip"`,
    },
  })
})

// ---------------------------------------------------------------- comments
api.get('/demos/:slug/comments', async (c) => {
  const env = c.env as Env
  const demo = await env.DB.prepare('SELECT id FROM demos WHERE slug=?').bind(c.req.param('slug')).first<{ id: number }>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  const rows = await env.DB.prepare(
    `SELECT cm.id, cm.demo_id, cm.user_id, u.username, cm.parent_id, cm.content, cm.created_at
     FROM comments cm LEFT JOIN users u ON u.id = cm.user_id WHERE cm.demo_id=? ORDER BY cm.created_at ASC`,
  )
    .bind(demo.id)
    .all<any>()
  const nodes = new Map<number, any>()
  for (const r of rows.results) nodes.set(r.id, { ...r, children: [] })
  const roots: any[] = []
  for (const node of nodes.values()) {
    if (node.parent_id !== null && nodes.has(node.parent_id)) nodes.get(node.parent_id).children.push(node)
    else roots.push(node)
  }
  return json(c, roots)
})

api.post('/demos/:slug/comments', async (c) => {
  const env = c.env as Env
  const user = await requireUser(c)
  const demo = await env.DB.prepare('SELECT id FROM demos WHERE slug=?').bind(c.req.param('slug')).first<{ id: number }>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  const body = await c.req.json().catch(() => null)
  const content: string = body?.content ?? ''
  if (!content) return err(c, 422, '评论不能为空')
  const parent_id = body?.parent_id ?? null
  if (parent_id !== null) {
    const parent = await env.DB.prepare('SELECT * FROM comments WHERE id=?').bind(parent_id).first<any>()
    if (!parent || parent.demo_id !== demo.id) return err(c, 404, '父评论不存在')
  }
  const res = await env.DB.prepare('INSERT INTO comments (demo_id, user_id, parent_id, content, created_at) VALUES (?,?,?,?,?)')
    .bind(demo.id, user.id, parent_id, content, now())
    .run()
  const id = res.meta?.last_row_id ?? 0
  const row = { id, demo_id: demo.id, user_id: user.id, username: user.username, parent_id, content, created_at: now(), children: [] }
  return json(c, row, 201)
})

api.delete('/comments/:id', async (c) => {
  const env = c.env as Env
  const user = await requireUser(c)
  const id = Number(c.req.param('id'))
  const row = await env.DB.prepare('SELECT * FROM comments WHERE id=?').bind(id).first<any>()
  if (!row) return err(c, 404, '评论不存在')
  if (row.user_id !== user.id && user.role !== 'admin') return err(c, 403, '无权删除该评论')
  await env.DB.prepare('DELETE FROM comments WHERE id=?').bind(id).run()
  return new Response(null, { status: 204 })
})

// ---------------------------------------------------------------- session logs
api.get('/demos/:slug/session-logs', async (c) => {
  const env = c.env as Env
  const demo = await env.DB.prepare('SELECT id FROM demos WHERE slug=?').bind(c.req.param('slug')).first<{ id: number }>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  const rows = await env.DB.prepare('SELECT id,filename,file_size,created_at FROM session_logs WHERE demo_id=? ORDER BY filename').bind(demo.id).all<any>()
  return json(c, rows.results)
})

api.get('/demos/:slug/session-logs/:filename', async (c) => {
  const env = c.env as Env
  const demo = await env.DB.prepare('SELECT id FROM demos WHERE slug=?').bind(c.req.param('slug')).first<{ id: number }>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  const filename = c.req.param('filename')
  const safe = sanitizePath(filename)
  if (!safe) return err(c, 400, '非法的文件名')
  const buf = await ossGet(env, `demos/${c.req.param('slug')}/sessions/${safe}`)
  if (!buf) return err(c, 404, '会话日志不存在')
  return new Response(buf, { headers: { 'content-type': contentType(safe) } })
})

// ---------------------------------------------------------------- git (commits)
api.get('/demos/:slug/commits', async (c) => {
  const env = c.env as Env
  const demo = await env.DB.prepare('SELECT id FROM demos WHERE slug=?').bind(c.req.param('slug')).first<{ id: number }>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  const rows = await env.DB.prepare('SELECT hash,message,author,date FROM commits WHERE demo_id=? ORDER BY id DESC LIMIT 200').bind(demo.id).all<any>()
  return json(c, rows.results.map((r) => ({ hash_short: String(r.hash).slice(0, 8), message: r.message, author: r.author, date: r.date })))
})

api.get('/demos/:slug/commits/:hash', async (c) => {
  const env = c.env as Env
  const demo = await env.DB.prepare('SELECT id FROM demos WHERE slug=?').bind(c.req.param('slug')).first<{ id: number }>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  const target = c.req.param('hash')
  const commit = await env.DB.prepare('SELECT * FROM commits WHERE demo_id=? AND hash LIKE ?').bind(demo.id, `${target}%`).first<any>()
  if (!commit) return err(c, 404, '提交不存在')
  const manifestBuf = await ossGet(env, commit.snapshot_key)
  const manifest: { path: string }[] = manifestBuf ? JSON.parse(new TextDecoder().decode(manifestBuf)) : []
  let files: { path: string; status: string; additions: number; deletions: number }[] = manifest.map((f) => ({ path: f.path, status: 'A', additions: 1, deletions: 0 }))
  let diffText = files.map((f) => `+ ${f.path}`).join('\n')
  if (commit.parent_hash) {
    const parent = await env.DB.prepare('SELECT snapshot_key FROM commits WHERE demo_id=? AND hash=?').bind(demo.id, commit.parent_hash).first<any>()
    if (parent) {
      const pBuf = await ossGet(env, parent.snapshot_key)
      const pManifest: { path: string }[] = pBuf ? JSON.parse(new TextDecoder().decode(pBuf)) : []
      const curPaths = new Set(manifest.map((f) => f.path))
      const prevPaths = new Set(pManifest.map((f) => f.path))
      files = []
      for (const p of prevPaths) if (!curPaths.has(p)) files.push({ path: p, status: 'D', additions: 0, deletions: 1 })
      for (const p of curPaths) if (!prevPaths.has(p)) files.push({ path: p, status: 'A', additions: 1, deletions: 0 })
      for (const p of curPaths) if (prevPaths.has(p)) files.push({ path: p, status: 'M', additions: 1, deletions: 1 })
      diffText = files.map((f) => `${f.status === 'D' ? '-' : f.status === 'A' ? '+' : '~'} ${f.path}`).join('\n')
    }
  }
  return json(c, {
    hash: commit.hash,
    message: commit.message,
    author: commit.author,
    date: commit.date,
    files,
    diff_text: diffText,
  })
})

// ---------------------------------------------------------------- admin
api.get('/admin/review', async (c) => {
  const env = c.env as Env
  const user = await requireAdmin(c)
  const rows = await env.DB.prepare('SELECT * FROM demos WHERE status=? ORDER BY created_at DESC').bind('pending').all<any>()
  return json(c, await Promise.all(rows.results.map((r) => demoOut(env, r, { detail: true, viewer: user }))))
})

api.post('/admin/review/:slug', async (c) => {
  const env = c.env as Env
  await requireAdmin(c)
  const body = await c.req.json().catch(() => null)
  const demo = await env.DB.prepare('SELECT * FROM demos WHERE slug=?').bind(c.req.param('slug')).first<any>()
  if (!demo) return err(c, 404, 'Demo 不存在')
  const status = body?.action === 'approve' ? 'approved' : 'rejected'
  await env.DB.prepare('UPDATE demos SET status=? WHERE id=?').bind(status, demo.id).run()
  return json(c, { status })
})

api.get('/admin/demos', async (c) => {
  const env = c.env as Env
  const user = await requireAdmin(c)
  const rows = await env.DB.prepare('SELECT * FROM demos ORDER BY created_at DESC').all<any>()
  return json(c, await Promise.all(rows.results.map((r) => demoOut(env, r, { detail: true, viewer: user }))))
})

api.get('/admin/users', async (c) => {
  const env = c.env as Env
  await requireAdmin(c)
  const rows = await env.DB.prepare('SELECT id,username,role,status,bio,created_at FROM users ORDER BY id').all<any>()
  const out = []
  for (const u of rows.results) {
    const cnt = await env.DB.prepare('SELECT COUNT(*) as n FROM demos WHERE author_id=?').bind(u.id).first<{ n: number }>()
    out.push({ ...u, demo_count: cnt?.n ?? 0 })
  }
  return json(c, out)
})

api.get('/admin/settings', async (c) => {
  const env = c.env as Env
  await requireAdmin(c)
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('auto_approve').first<{ value: string }>()
  return json(c, { auto_approve: row?.value === 'true' })
})

api.put('/admin/settings', async (c) => {
  const env = c.env as Env
  await requireAdmin(c)
  const body = await c.req.json().catch(() => null)
  const value = body?.auto_approve === true ? 'true' : 'false'
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('auto_approve', value).run()
  return json(c, { auto_approve: value === 'true' })
})

// ---------------------------------------------------------------- cookie + wiring
function withCookie(res: Response, token: string): Response {
  res.headers.append('set-cookie', `demo_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`)
  return res
}

app.use('/api/v1/*', async (c, next) => {
  try {
    await initDb(c.env as Env)
    await next()
  } catch (e: any) {
    if (e?.status && e?.detail) return err(c, e.status, e.detail, e.code)
    throw e
  }
})

app.route('/api/v1', api)

// 静态预览 /preview/{slug}/...（从 OSS 读取解压后的文件）
app.get('/preview/:slug/*', async (c) => {
  const env = c.env as Env
  const slug = c.req.param('slug')
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(slug)) return err(c, 400, '非法的 demo 标识')
  const rest = c.req.param('*') ?? 'index.html'
  const safe = sanitizePath(rest)
  if (!safe) return err(c, 400, '非法的路径')
  const buf = await ossGet(env, `demos/${slug}/files/${safe}`)
  if (!buf) return err(c, 404, '文件不存在')
  return new Response(buf, { headers: { 'content-type': contentType(safe) } })
})

// 媒体 /media/...
app.get('/media/*', async (c) => {
  const env = c.env as Env
  const rest = c.req.param('*') ?? ''
  const safe = sanitizePath(rest)
  if (!safe) return err(c, 400, '非法的路径')
  const buf = await ossGet(env, `media/${safe}`)
  if (!buf) return err(c, 404, '文件不存在')
  return new Response(buf, { headers: { 'content-type': contentType(safe) } })
})

// 其余走静态资源（SPA 回退）
app.all('*', async (c) => {
  await initDb(c.env as Env)
  return (c.env as Env).ASSETS.fetch(c.req.raw)
})

export default app