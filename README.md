# Pier

A dock for your self-hosted services — a fast, personal dashboard that starts small.

Pier takes the best ideas from [homepage](https://github.com/gethomepage/homepage) (links for your services)
and [beszel](https://github.com/henrygd/beszel) (a tiny agent per server), strips them down to an MVP:
a 60-line zero-dependency agent reports real host stats and Docker containers — no SSH tunnels,
no exposed Docker API.

![stack](https://img.shields.io/badge/Next.js-16-black) ![stack](https://img.shields.io/badge/shadcn%2Fui-base--nova) ![stack](https://img.shields.io/badge/Tailwind-v4-38bdf8)

## What it does (MVP)

1. **Manual links** — add any link (title, URL, description, group) from the dashboard.
   Duplicate endpoints for the same container? **Hide** any link from its ⋯ menu —
   it stays scan-synced but off the dashboard, and Settings lists hidden links to restore.
2. **Devices with auto-discovery** — run pier-agent on each Docker-enabled server:
   - detects the OS, architecture, kernel, Docker version, CPU count and RAM;
   - shows live CPU / RAM usage (real host stats for the local machine, summed container stats for remotes);
   - lists every running container and **auto-creates a clickable link for each published `ip:port`
     endpoint**, detecting `http` vs `https` per endpoint with a TLS probe (self-signed OK);
     multi-port containers get one link per port; stopped containers keep their links,
     dimmed with their state.
3. **Automatic icons** — links are matched against
   [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) (PNG set) by container image name,
   link title or hostname, served from the jsDelivr CDN. You can always pick one manually from the
   built-in searchable picker.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Data lives in `data/pier.db` (SQLite, created automatically, gitignored — agent
keys included, so treat that file as local-only).

## Development

```bash
npm ci        # Node >= 20
npm run dev   # dashboard at http://localhost:3000
npm run lint && npm run build
```

CI (`.github/workflows/`) runs lint + build on every push and publishes the
pier-agent image to GHCR when `agent/` changes. MIT licensed — see LICENSE.

## Connecting a device

Devices are Docker-enabled servers, added from the dashboard's **Add -> Device** dialog
(they're managed right on their dashboard card: hover the ... menu to scan or remove).
Every device runs **pier-agent** — a tiny, zero-dependency Node (>= 18) script that
reports your containers via the local Docker socket plus real host stats from `/proc`.
Nothing but one authenticated port is exposed: no SSH tunnels, no Docker API on the network.

```bash
# on each Docker-enabled server — prebuilt image from GHCR:
docker run -d --name pier-agent --restart unless-stopped \
  -e PIER_KEY=<shared-secret> -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/butageek/pier-agent
```

The image is rebuilt by CI whenever `agent/` changes. The Add-dialog snippet has
this command ready-made with your key and port embedded, plus a compose variant:

```yaml
services:
  pier-agent:
    image: ghcr.io/butageek/pier-agent
    container_name: pier-agent
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      PIER_KEY: <shared-secret>
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

Alternatives:

- Plain Node — `agent/index.mjs` in this repo is the whole agent:
  `PIER_KEY=<shared-secret> node agent/index.mjs` (PORT, DOCKER_SOCKET envs optional).
- Self-contained, image-free — Pier serves the agent at `/agent.mjs`, so a stock
  image can fetch it at startup:
  `docker run -d --name pier-agent --restart unless-stopped -e PIER_KEY=<secret> -p 8080:8080 -v /var/run/docker.sock:/var/run/docker.sock node:24-alpine sh -c "wget -qO /agent.mjs http://<pier-host>:3000/agent.mjs && exec node /agent.mjs"`
- Build the image yourself: `docker build -t pier-agent ./agent`

Then in Pier: **Add -> Device**, host = the server's IP (used for endpoint URLs),
agent URL `http://<ip>:8080`, and the same key. Adding the device scans it immediately.
Want a different port? Set it in the form — the agent URL and the generated deploy
command both follow (`-p <port>:8080` maps your port to the agent's internal 8080).

Hit **Scan now** (card refresh icon or the ... menu) to refresh: Pier stores the detected
info, creates/updates/prunes container endpoint links, and the dashboard card polls real
host CPU/RAM every 15s.

## How it works

```
agent/index.mjs     zero-dep pier-agent: host facts from /proc, containers via docker socket,
                    token-authenticated HTTP (Dockerfile + GHCR workflow included)
src/app/agent.mjs   serves the agent script so servers can deploy without cloning the repo
src/lib/agent.ts    client for pier-agent endpoints (info/containers/stats)
src/lib/icons.ts    dashboard-icons slug index (GitHub trees API → data/icon-index.json, weekly refresh,
                    bundled seed fallback) + matcher: exact → alias → token → substring
src/lib/tiles.ts    scan reconcile: upsert links per (device, container, endpoint URL), prune gone ones
src/app/api/*       REST routes: links CRUD, devices CRUD, scan, live status, icon search/resolve
src/components/*    dashboard grid, device cards, unified Add dialog (link/device) + icon picker
```

Everything is stored locally in `data/` (gitignored): `pier.db` (SQLite) and the
icon index cache. Agent keys live only in that database — they are never sent to
the browser.

Design choices kept intentionally small for the MVP:

- SQLite via `better-sqlite3`, one file, no migrations framework yet (schema is `CREATE IF NOT EXISTS`).
- Live usage is computed on demand with a 15s server-side cache; no background scheduler.
- Icons are never downloaded into the repo — only a cached list of slugs; images load from the CDN.

## Roadmap (post-MVP ideas)

- Background auto-scan interval per device
- Drag-and-drop link ordering, per-group layouts
- Ping/health badges on links; per-container CPU/RAM popovers
- Multi-user/auth, Docker labels as link config hints (homepage-style)
