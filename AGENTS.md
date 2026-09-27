# AGENTS.md

Guidance for AI coding agents working in this repo.

## What Pier is

A single-page, self-hosted dashboard — "a dock for your services". Two concepts:

- **Links** — manual tiles (title/URL/description/group) shown on the dashboard.
- **Devices** — Docker-enabled servers running **pier-agent**, a zero-dependency
  Node script reporting host stats from `/proc` and containers via the local
  Docker socket. Every published container endpoint becomes an auto-discovered link.

Stack: Next.js 16 (App Router) · React 19 · shadcn/ui **base-nova** (on
@base-ui/react) · Tailwind v4 · better-sqlite3 · Node >= 20.

## Commands

```bash
npm run dev     # dev server at http://localhost:3000
npm run lint    # must be clean
npm run build   # must pass
PIER_KEY=x node agent/index.mjs   # run the agent standalone (zero deps)
```

## Map

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | dashboard page (all logic in `src/components/dashboard.tsx`, client) |
| `src/app/api/tiles*` | links CRUD + hide flag (`/api/tiles`, `/api/tiles/[id]`) |
| `src/app/settings/` | settings hub — sections list (left) + detail panel (right), no sub-pages |
| `src/app/api/devices*` | devices CRUD, `[id]/scan`, `[id]/status` (live usage, 15s cache) |
| `src/app/api/icons` | icon search (`?q=`) and resolve (`?title=&image=&url=` / `?hint=`) |
| `src/app/agent.mjs/route.ts` | serves `agent/index.mjs` so servers deploy without cloning the repo |
| `src/lib/db.ts` | SQLite singleton (`getDb()`) + guarded migrations; DB at `data/pier.db` |
| `src/lib/agent.ts` | client for pier-agent endpoints (info/containers/stats) |
| `src/lib/tiles.ts` | scan reconcile: upsert links per (device, container, URL), prune gone ones |
| `src/lib/icons.ts` | dashboard-icons slug index (disk-cached, weekly refresh) + matcher |
| `src/components/*` | dashboard, device card/form, add dialog, tile card/form, icon + group pickers |
| `agent/index.mjs` | the whole agent: token auth, `/info` `/containers` `/stats` `/health` |

## Conventions & gotchas

- **Terminology**: user-facing copy says **"link"**; internal code, API paths and
  the DB table keep **"tile"**. Don't rename internals casually.
- **shadcn base-nova / Base UI** (differs from Radix-based shadcn):
  - no `asChild` — use the `render` prop, e.g. `render={<Link href/>}`
  - `nativeButton={false}` only when `render` is a non-button (e.g. an `<a>`);
    never set it on a real `<button>`
- **Secrets**: `agent_key` must never reach the browser — API routes return
  `SafeDevice` (key stripped). `data/` is local-only (gitignored) and holds keys.
- **DB**: access only via `getDb()`; schema changes go in `open()`/`migrate()`
  in `src/lib/db.ts` with column-existence guards (no migration framework).
- **Docker**: only the agent talks to a Docker daemon; Pier never does.
- **Icons**: matched server-side in `resolveIcon` (exact → alias → token →
  substring, min length 4), served from the jsDelivr CDN — never downloaded into the repo.
- **React 19 effects**: don't guard setState with a `mounted` ref — StrictMode's
  double-mount permanently falsifies it and state silently stops updating.
  Post-unmount setState is a safe no-op.
- **Native `<datalist>`** popups render detached from dialogs in some browsers —
  use the anchored combobox pattern (`group-select.tsx`) instead.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
