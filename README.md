# Pier

A dock for your self-hosted services — a fast, personal dashboard that starts small.

Two ideas carry the whole app: **links** — manual tiles for anything you want one
click away — and **devices** — Docker servers running pier-agent (a zero-dependency Node
script reporting host stats and containers through the local socket) or a Proxmox VE
host Pier talks to directly. No SSH tunnels, no exposed Docker API.

![stack](https://img.shields.io/badge/Next.js-16-black) ![stack](https://img.shields.io/badge/shadcn%2Fui-base--nova) ![stack](https://img.shields.io/badge/Tailwind-v4-38bdf8)

## What it does (MVP)

1. **Manual links** — add any link (title, URL, description, group) from the dashboard.
   Duplicate endpoints for the same container? **Hide** any link from its ⋯ menu —
   it stays scan-synced but off the dashboard, and Settings lists hidden links to restore.
2. **Devices with auto-discovery** — two kinds:
   - **Docker servers** — run pier-agent on each one:
     - detects the OS, architecture, kernel, Docker version, CPU count and RAM;
     - shows live CPU / RAM usage (real host stats for the local machine, summed container stats for remotes);
     - lists every running container and **auto-creates a clickable link for each published `ip:port`
       endpoint**, detecting `http` vs `https` per endpoint with a TLS probe (self-signed OK);
       multi-port containers get one link per port; stopped containers keep their links,
       dimmed with their state.
   - **Proxmox VE** — no agent: Pier talks to the PVE API directly (API token, self-signed certs OK):
     - the device card shows a PVE-portal-style guest summary — every VM/LXC with state and
       live CPU/RAM, guest names clickable when a web endpoint was discovered;
     - running LXCs get direct links to web services found by probing ~30 common self-hosted
       service ports (80, 443, 3000, 8080, 8443, 8090, 8096, ...) on the guest's IP;
     - cluster CPU/RAM, PVE version and VM/LXC counts on the card header.
3. **Automatic icons** — links are matched against
   [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) (PNG set) by container image name,
   link title or hostname, served from the jsDelivr CDN. You can always pick one manually from the
   built-in searchable picker.
4. **Connectivity pings** — every link (manual or discovered) is probed server-side with a HEAD
   request; a single status dot on each card combines the picture: green = reachable, amber =
   container running but its endpoint isn't responding, gray = stopped, red = manual link down.
   Hover for details (status code, latency). Any HTTP response counts as up — only timeouts and
   network errors are treated as unreachable.
5. **Editable layout** — hit *Edit layout* and drag to rearrange: links within their group,
   the groups themselves, and the device cards. Cards slide aside with a live preview as you
   drag; **Done** keeps the arrangement, **Cancel** restores what you started with. Everything
   persists across reloads, rescans and reboots.

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

### Deploy with Docker Compose

```bash
git clone https://github.com/butageek/pier.git && cd pier
docker compose up -d --build       # dashboard at http://localhost:3000
```

Everything of consequence lives in `./data` (SQLite database, agent keys) —
mount or back up that directory and your Pier survives rebuilds. Updates:

```bash
git pull && docker compose up -d --build
```

Want Pier to also watch the Docker server it runs on? Uncomment the
`pier-agent` service in `compose.yaml` (one shared `PIER_KEY`, one Docker
socket mount). For other servers, run pier-agent there — see below.

### Install on a bare Linux server (one-liner)

No Docker needed — a single script installs Pier as a systemd service that
starts on boot. It fetches the **prebuilt release bundle** (nothing is compiled
on your server — the whole install takes seconds) and downloads its own Node
runtime if the server doesn't have Node >= 20 (nothing outside `/opt/pier` is
touched):

```bash
curl -fsSL https://raw.githubusercontent.com/butageek/pier/main/install.sh | sudo bash
```

- Dashboard on `http://<host>:3000`, app in `/opt/pier`, database in `/opt/pier/data`
- Runs as a dedicated system user; `systemctl status pier`, `journalctl -u pier -f`
- Options: `PIER_DIR=/somewhere PIER_PORT=3000 PIER_RELEASE=v0.2.0 curl … | sudo bash`
- Force a local source build with `PIER_BUILD_FROM_SOURCE=1` (the automatic
  fallback when a release has no bundle)
- **Upgrade**: re-run the script (your `data/` is carried over) · **Uninstall**:
  `systemctl disable --now pier && rm -rf /opt/pier /etc/systemd/system/pier.service`

## Development

```bash
npm ci        # Node >= 20
npm run dev   # dashboard at http://localhost:3000
npm run lint && npm run build
```

CI (`.github/workflows/`) runs lint + build on every push, publishes the
pier-agent image to GHCR, and attaches a prebuilt `pier-standalone.tar.gz`
bundle to every release (that's what makes the one-liner fast). MIT licensed —
see LICENSE.

## Connecting a device

Devices are added from the dashboard's **Add -> Device** dialog
(they're managed right on their dashboard card: hover the ... menu to scan or remove).

### Docker servers

Every Docker server runs **pier-agent** — a tiny, zero-dependency Node (>= 18) script that
reports your containers via the local Docker socket plus real host stats from `/proc`.
Nothing but one authenticated port is exposed: no SSH tunnels, no Docker API on the network.

```bash
# on each Docker-enabled server — prebuilt image from GHCR:
docker run -d --name pier-agent --restart unless-stopped \
  -e PIER_KEY=<shared-secret> -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/butageek/pier-agent
```

The image is rebuilt by CI on every push. The Add-dialog snippet has
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

### Proxmox VE

Nothing runs on the PVE host — Pier uses its API directly:

1. In the PVE web UI, create a user: **Datacenter -> Permissions -> Users -> Add**
   (e.g. `pier@pve`; the password is never used, make it long and forget it).
2. Create a token: **Datacenter -> Permissions -> API Tokens -> Add** — user `pier@pve`, ID `pier`,
   keep **Privilege Separation** on. Copy the `pier@pve!pier=<uuid>` value (shown once).
3. **Grant PVEAuditor on `/` twice — once to the user, once to the token**
   (Permissions -> Add -> User Permission *and* Token Permission). PVE 9 computes a
   privilege-separated token's effective rights as the *intersection* of the two; either half
   alone sees nothing.
4. In Pier: **Add -> Device -> Proxmox VE**, host + API port (8006 by default), paste the token.

   The same setup from the PVE shell:

   ```bash
   pveum user add pier@pve -comment "Pier dashboard (read-only)"
   pveum user token add pier@pve pier -privsep 1     # prints the UUID -> pier@pve!pier=<uuid>
   pveum acl modify / -users pier@pve -roles PVEAuditor
   pveum acl modify / -tokens 'pier@pve!pier' -roles PVEAuditor
   ```

   Verify with `pveum user token permissions pier@pve!pier` — it must list PVEAuditor on `/`.

> **Token works but the scan finds nothing?** That's PVE's silent permission filtering: the API
> answers 200 with empty lists instead of an error. It means the intersection is empty — the
> grant is missing from the user or the token (step 3). Pier detects this case and tells you.

Adding the device scans it immediately: running LXCs are probed on common web ports and each
open port becomes a direct link into the container. Everything else lives on the device card —
a PVE-portal-style guest summary (state + live CPU/RAM per VM/LXC, names clickable when a
discovered link exists), refreshed every 15s along with cluster CPU/RAM.

Both kinds of devices refresh the same way: **Scan now** (card refresh icon or the ...
menu) stores the detected info, creates/updates/prunes links, and the card polls live
CPU/RAM every 15s.

## How it works

```
agent/index.mjs     zero-dep pier-agent: host facts from /proc, containers via docker socket,
                    token-authenticated HTTP (Dockerfile + GHCR workflow included)
src/app/agent.mjs   serves the agent script so servers can deploy without cloning the repo
src/lib/agent.ts    client for pier-agent endpoints (info/containers/stats)
src/lib/proxmox.ts  Proxmox VE API client: token auth, LXC web-port link discovery, live cluster status with per-guest summary
src/lib/icons.ts    dashboard-icons slug index (GitHub trees API → data/icon-index.json, weekly refresh,
                    bundled seed fallback) + matcher: exact → alias → token → substring
src/lib/tiles.ts    scan reconcile: upsert links per (device, container, endpoint URL), prune gone ones
src/app/api/*       REST routes: links CRUD, devices CRUD, scan, live status, link health probes, icon search/resolve
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
- Per-container CPU/RAM popovers
- Multi-user/auth, Docker labels as link config hints
