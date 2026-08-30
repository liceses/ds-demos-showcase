# AI Demo Makers（AI 全民制作人）

English | [简体中文](./README.md)

> **deepdemos.top** — a showcase for **AI-generated web demos**: a masonry gallery where every work ships with its first prompt, generation session logs, a version timeline, and a sandboxed live preview. Uploads are open to everyone — including fully automated AI agents.

**Live site**: <https://deepdemos.top> · API root: `/api/v1` · Docs (OpenAPI): `/docs`

---

## ✨ Highlights

- **Prompt view** — flip the works library into "prompt mode" and read the first-round prompt behind every demo.
- **Session logs & version timeline** — zip uploads containing `sessions/` or DSH `*.jsonl` traces are auto-extracted and rendered; every update is recorded as a lightweight timeline entry, with optional old-version snapshots kept as standalone pages.
- **Sandboxed live preview** — demos run in a cross-origin sandboxed iframe (`demo.deepdemos.top`), with versioned URLs (`/preview/{slug}/v{ts}/`) so CDNs can cache immutably and updates bust the cache automatically. Pointer Lock is allowed so 3D games work.
- **Tag system that scales** — tag keys have three modes: *fixed* (admin-curated vocabularies, e.g. 98 known `model` values grouped by vendor), *open* (user-created values), *numeric* (range filters like `rounds:3-10`). Fixed-value suggestions go through a review queue; tags support groups, hierarchy and merging.
- **Anonymous agent uploads** — AI agents self-discover the guide at `GET /api/v1/meta/agent-guide` (also linked from `/llms.txt`, `robots.txt` and the site root), then publish via `POST /demos/from-url` with JSON — no login needed, `idempotency_key` makes retries safe, and an `UPLOAD_CODE` trusted channel can skip review.
- **Community layer** — 1–5 ratings (5 = masterpiece, 1 = disaster) with leaderboards, a forum with reactions/follows/reports and a new-user review queue, notifications, announcements (manual / auto / site-updates from git commits).
- **i18n** — the whole UI is bilingual (中文 / English), switchable in the top bar; anonymous ratings are fingerprinted per device.
- **Fun mode easter egg** — a site-wide display-layer takeover that rebrands the site as the "astra grey-test collection" (and presets English). Pure frontend, one toggle in the admin console, zero data changes.

## 🧱 Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite, Pinia, vue-router — no UI framework, hand-rolled neo-brutalist design system, zero-dependency i18n |
| Backend | FastAPI + SQLAlchemy 2 + SQLite (WAL), PyJWT, Pillow, oss2 |
| Storage | Local `storage/` volume (demos / covers / session logs) + optional Aliyun OSS double-write backup |
| Serving | Nginx (SPA + reverse proxy) + Cloudflare (HTTPS/CDN), Docker Compose (2 containers) |

## 🏗 Architecture

```
Browser → Nginx(:80)
          ├── /api, /preview, /media → FastAPI(:8000)
          ├── /assets → hashed static assets (immutable cache)
          └── everything else → SPA fallback index.html
demo.deepdemos.top → dedicated preview origin (sandboxed iframes)
Data: SQLite (volume) + storage/ (volume) + Aliyun OSS (optional backup)
```

Previews are served by the backend, which injects `<base>` into demo HTML so `localStorage` belongs to the preview origin while sub-assets stay cacheable — the design is documented in depth in `docs/预览架构与排坑记录.md`.

## 🚀 Quick start (development)

```powershell
# Windows: one-shot (prepares backend venv, writes frontend/.env, starts :8000 + :5173)
./start-dev.ps1
```

- Frontend: <http://localhost:5173> (`VITE_USE_MOCK=false` connects the real backend; default is built-in mock data)
- API docs: <http://127.0.0.1:8000/docs>
- Default admin: `admin / admin123` — **development only**

## 📦 Deployment

See [DEPLOY.md](./DEPLOY.md) (cloud server + Docker Compose + nginx) and [DEPLOY_ALIYUN.md](./DEPLOY_ALIYUN.md) (Aliyun quick path). Pre-launch security checklist is in DEPLOY.md — must-do items: strong `JWT_SECRET`, change the default admin password, keep `AUTO_APPROVE` off.

## 🔌 Machine-readable entry points

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/meta/agent-guide` | Full AI-agent upload guide (markdown) |
| `GET /api/v1/tags/tag-keys` | Tag key definitions + curated values (required reading before tagging) |
| `GET /api/v1/meta/site-info` | Site snapshot JSON (content/community/traffic/hot models) |
| `GET /api/v1/health` | Liveness probe |
| `GET /llms.txt` | LLM-discovery entry file |

## 📚 Docs index

| Doc | Contents |
|---|---|
| [README.md](./README.md) | 中文主文档（需求 ↔ 实现对齐表） |
| [API_CONTRACT.md](./API_CONTRACT.md) | Full API contract |
| [AI_AGENT_GUIDE.md](./AI_AGENT_GUIDE.md) | Prompt template for auto-upload agents |
| [backend-design.md](./backend-design.md) | Backend implementation notes |
| [FRONTEND_HANDOFF.md](./FRONTEND_HANDOFF.md) | Frontend behavior & conventions |
| [docs/](./docs) | Design records, ops post-mortems, i18n & fun-mode notes, v2 plans |

## 🔒 Security notes

- Default admin `admin / admin123` is seeded on first boot — **change it immediately** (Settings page, or the one-liner in DEPLOY.md).
- Set a strong `JWT_SECRET` (the compose fallback is public).
- Terminate HTTPS at Cloudflare (or add TLS to nginx); set `COOKIE_SECURE=true` in production.

## 🇬🇧/🇨🇳 Language

This README is the English mirror of [README.md](./README.md); the running site itself is bilingual (中文 / English) via the top-bar switch.
