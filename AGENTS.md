# AGENTS.md

Guidance for AI coding agents working in this repo.

## What Pier is

A single-page, self-hosted dashboard — "a dock for your services". Two concepts:

- **Links** — manual tiles (title/URL/description/group) shown on the dashboard.
- **Devices** — servers you want links auto-discovered from, two kinds:
  Docker-enabled servers running **pier-agent**, a zero-dependency
  Node script reporting host stats from `/proc` and containers via the local
  Docker socket (every published container endpoint becomes an auto-discovered
  link), and **Proxmox VE** hosts talked to directly via the PVE API
  (`src/lib/proxmox.ts`) — guests and Docker containers listed in
  cursor-following popups on the device card, discovered web endpoints
  clickable.

Stack: Next.js 16 (App Router) · React 19 · shadcn/ui **base-nova** (on
@base-ui/react) · Tailwind v4 · better-sqlite3 · Node >= 20 (runtime images
ship Node 24 LTS).

## Deployment (keep all three paths working)

- **Docker Compose** — `compose.yaml` builds the `Dockerfile` (Next standalone
  output; all SQLite N-API prebuilds bundled, so one image serves every arch).
- **One-liner** — `install.sh` installs the prebuilt `pier-standalone.tar.gz`
  release bundle as a systemd service; falls back to building from source
  (`npm ci --ignore-scripts` — better-sqlite3 needs no compiler toolchain).
- **Plain Node** — `npm ci && npm run build && npm start`.

Releases: tag `vX.Y.Z` → bump commit → `gh release create`. The `build-app`
workflow attaches the standalone bundle to each release; `build-image` pushes
the pier image and `build-agent` the pier-agent image to GHCR on every push.

## Commands

```bash
npm run dev     # dev server at http://localhost:3000
npm run lint    # must be clean
npm run build   # must pass — also type-checks and regenerates the route types bare `tsc` needs
PIER_KEY=x node agent/index.mjs   # run the agent standalone (zero deps)
```

## Map

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | dashboard page (all logic in `src/components/dashboard.tsx`, client) |
| `src/app/layout.tsx` | site header with the `#header-actions` slot — the dashboard portal-renders Add / layout-edit controls into it |
| `src/app/api/tiles*` | links CRUD + hide flag (`/api/tiles`, `/api/tiles/[id]`) and `/api/tiles/order` (layout persistence: tile ids + group order) |
| `src/app/api/devices*` | devices CRUD (PATCH: blank key = keep), `[id]/scan`, `[id]/status` (live usage, 15s cache), `/order` (arranged device order) |
| `src/app/settings/` | settings hub — sections list (left) + detail panel (right), no sub-pages |
| `src/app/api/health` | link reachability probes (server-side HEAD, 60s cache) |
| `src/app/api/icons` | icon search (`?q=`) and resolve (`?title=&image=&url=` / `?hint=`) |
| `src/app/agent.mjs/route.ts` | serves `agent/index.mjs` so servers deploy without cloning the repo |
| `src/lib/db.ts` | SQLite singleton (`getDb()`); schema in `open()` (`CREATE TABLE IF NOT EXISTS`) — DB at `data/pier.db` |
| `src/lib/agent.ts` | client for pier-agent endpoints (info/containers/stats) |
| `src/lib/proxmox.ts` | Proxmox VE API client (token auth, self-signed OK) + PVE scan/live-status (per-guest summary) |
| `src/lib/tiles.ts` | scan reconcile shared by docker + proxmox scanners: upsert links per (device, container, URL), prune gone ones |
| `src/lib/theme.ts` | two-tier theme management (mode + light/dark preferences, anti-FOUC script, storage keys) |
| `src/lib/icons.ts` | dashboard-icons slug index (disk-cached, weekly refresh) + matcher |
| `src/components/dashboard.tsx` | dashboard + category filter tabs + layout-edit drag & drop (FLIP animations in `use-flip.ts`; SWAP_COOLDOWN_MS rationale in situ) |
| `src/components/theme-toggle.tsx` | header dropdown menu for instant mode (auto/dark/light) and theme switching |
| `src/components/theme-settings.tsx` | appearance settings panel with live theme cards in the settings hub |
| `src/components/*` | device card/form, add + tile dialogs, icon/group pickers, `logo.tsx` (brand mark, supports `full` and `mark` variants) |
| `src/app/icon.svg` · `apple-icon.svg` | Next.js vector favicon and Apple touch icon routes (The Monogram P-Dock) |
| `agent/index.mjs` | the whole agent: token auth, `/info` `/containers` `/stats` `/container-stats` `/health` |
| `install.sh` · `Dockerfile` · `compose.yaml` | the three deployment paths (see above) |

## Conventions & gotchas

- **Terminology**: user-facing copy says **"link"**; internal code, API paths and
  the DB table keep **"tile"**. Don't rename internals casually.
- **shadcn base-nova / Base UI** (differs from Radix-based shadcn):
  - no `asChild` — use the `render` prop, e.g. `render={<Link href/>}`
  - `nativeButton={false}` only when `render` is a non-button (e.g. an `<a>`);
    never set it on a real `<button>`
- **Secrets**: `agent_key` must never reach the browser — API routes return
  `SafeDevice` (key stripped). `data/` is local-only (gitignored) and holds keys.
- **DB**: access only via `getDb()`; schema lives in `open()` as `CREATE TABLE
  IF NOT EXISTS`. No migration framework — when changing columns, re-add a
  `migrate()` with `columnExists`-style guards in `src/lib/db.ts`.
- **Docker**: only the agent talks to a Docker daemon; Pier never does.
- **Proxmox**: PVE API tokens default to privilege separation — the token's
  effective rights are the *intersection* of the user's and the token's, so a
  privsep token needs the grant on BOTH (a missing half returns empty lists,
  200, not an error; `scanProxmoxDevice` detects it and throws `NO_AUDIT`).
  Pier's form recommends the simpler path: dedicated read-only user + token
  with separation OFF (one grant, token inherits PVEAuditor).
- **Icons**: matched server-side in `resolveIcon` (exact → alias → token →
  substring, min length 4), served from the jsDelivr CDN — never downloaded into the repo.
- **Brand & Project Icon**: Pier's official mark is **The Monogram P-Dock** (an architectural capital 'P'
  formed by an arched mooring deck and pilings standing over an ocean tide wave). Lives as a theme-adaptive
  React component in `src/components/logo.tsx` (supports `variant="full"` with squircle and `variant="mark"` transparent),
  served natively by Next.js at `src/app/icon.svg` & `src/app/apple-icon.svg`, and exported in `public/icons/`
  across standard PNG resolutions (16px to 512px) and multi-resolution `favicon.ico`.
- **React 19 effects**: don't guard setState with a `mounted` ref — StrictMode's
  double-mount permanently falsifies it and state silently stops updating.
  Post-unmount setState is a safe no-op.
- **Layout editing**: drag reordering is native HTML5 DnD with live preview.
  Drag handlers read latest-value refs (`applyTiles`/`applyGroupOrder`/
  `applyDevices`) — never render closures — and swaps are rate-limited by
  `SWAP_COOLDOWN_MS` (≥ the FLIP slide duration) so an animating tile can't
  re-trigger swaps under the cursor. Cancel restores the snapshot taken on
  entering edit mode (drops persist immediately, so cancel re-persists it).
- **Portals**: the dashboard portal-renders header actions after a
  `useSyncExternalStore` hydration check — rendering them during hydration
  mismatches the server HTML and remounts the page.
- **Native `<datalist>`** popups render detached from dialogs in some browsers —
  use the anchored combobox pattern (`group-select.tsx`) instead.
- **Themes**: Two-tier theme architecture (`pier-mode`: `system` | `dark` | `light`,
  `pier-dark-theme`: `bauhaus-dark` | `cad-dark` | `pinboard-dark`,
  `pier-light-theme`: `bauhaus-studio` | `cad-blueprint` | `pinboard-atelier`).
  In `system` mode, `computeEffectiveTheme()` reacts live to OS `prefers-color-scheme` to activate the user's
  preferred dark or light theme. An inline `<script>` in `<head>` (`src/app/layout.tsx`) sets
  `document.documentElement.dataset.theme` and toggles `.dark` synchronously before first paint
  to eliminate flash of unstyled content (FOUC). Dedicated design treatments apply distinct borders,
  shadows, corner marks, and meter bars per theme.
- **Search & Filters**: The header search input (`/` shortcut) integrates with Dashboard state
  to filter links by title, url, description, and group. In edit layout mode, search and category
  pill filters are temporarily deactivated to maintain drag-and-drop reordering fidelity.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
