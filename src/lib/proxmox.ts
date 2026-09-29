import http from "node:http";
import https from "node:https";
import net from "node:net";
import { AgentError } from "./agent";
import { resolveIcon } from "./icons";
import { detectScheme, reconcileTiles, saveScanInfo, type TileUpsert } from "./tiles";
import type { Device, DeviceScanInfo, DeviceStatus, PveGuestStatus, ScanResult } from "./types";

/**
 * Client for the Proxmox VE REST API (https://host:8006/api2/json/...).
 * Pier talks to PVE directly — no agent runs on the PVE host. Auth is an API
 * token (Authorization: PVEAPIToken=user@realm!tokenid=uuid) created in the
 * PVE UI under Datacenter → Permissions → API Tokens. PVE ships self-signed
 * certificates by default, so certificate validation is disabled (LAN norm).
 */

type PveGuest = {
  /** "qemu/100" or "lxc/101" — unique across the cluster. */
  id: string;
  type: "qemu" | "lxc" | string;
  vmid: number;
  node: string;
  name?: string;
  status: string;
  template?: number;
};

type PveNode = {
  node: string;
  status: string;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  uptime: number;
};

/**
 * Ports probed on running LXC guests to discover web UIs (PVE doesn't know
 * them, unlike Docker's published ports). Curated to the default web ports of
 * popular self-hosted services; all probed in parallel with fast timeouts.
 */
const WEB_PORTS = [
  80, 81, 443, 8443, // classic web / reverse proxies
  3000, 3001, // grafana, homepage, node apps
  32400, // plex
  4533, // navidrome
  5000, // flask / synology
  5055, // overseerr / jellyseerr
  7575, // frigate
  7878, // radarr
  8000, 8080, 8081, 8083, // generic app ports
  8090, // beszel
  8096, // jellyfin
  8123, // home assistant
  8200, // duplicati
  8384, // syncthing
  8686, // lidarr
  8787, // readarr
  8983, // sonarr
  9000, // portainer
  9090, // prometheus / cockpit
  9117, // jackett
  9443, // portainer (https)
  9696, // prowlarr
  10000, // webmin
];

function pveRequest(device: Device, path: string, timeoutMs = 6000): Promise<{ data: unknown }> {
  const base = (device.agent_url || "").replace(/\/+$/, "");
  if (!base) throw new AgentError("Device has no Proxmox URL");
  const url = new URL(`${base}${path}`);
  const mod = url.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: {
          Authorization: `PVEAPIToken=${device.agent_key}`,
          accept: "application/json",
        },
        rejectUnauthorized: false,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status === 401 || status === 403) {
            reject(new AgentError(`Proxmox rejected the token (${status})`, String(status)));
          } else if (status >= 400) {
            reject(new AgentError(`Proxmox ${path} returned ${status}`));
          } else {
            try {
              resolve(JSON.parse(body) as { data: unknown });
            } catch {
              reject(new AgentError(`Proxmox ${path} returned invalid JSON`));
            }
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new AgentError(`Proxmox ${path} timed out`, "TIMEOUT"));
    });
    req.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EHOSTUNREACH") {
        reject(new AgentError(`Cannot reach Proxmox (${code})`, code));
      } else {
        reject(new AgentError(`Proxmox ${path} failed: ${err.message}`, code));
      }
    });
    req.end();
  });
}

async function pveGet<T>(device: Device, path: string): Promise<T> {
  const json = await pveRequest(device, path);
  return json.data as T;
}

/** Quick connectivity + token check used when adding a device. */
export async function testProxmox(url: string, token: string): Promise<void> {
  const fake: Device = {
    id: 0,
    name: "",
    host: "",
    agent_url: url,
    agent_key: token,
    info: "{}",
    last_scan: null,
    position: 0,
    created_at: "",
  };
  await pveGet(fake, "/api2/json/version");
}

/** Bare TCP connect check — is anything listening on host:port? */
function tcpOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeoutMs, () => done(false));
    s.on("connect", () => done(true));
    s.on("error", () => done(false));
  });
}

/** Probe a running LXC guest's IP for common web ports → http(s) endpoint URLs. */
async function webEndpointsFor(ip: string): Promise<{ url: string; port: number }[]> {
  // Retry once: a single dropped packet must not cost a tile its link (the
  // reconcile prunes endpoints that don't answer a scan).
  const open = await Promise.all(
    WEB_PORTS.map(async (port) => ((await tcpOpen(ip, port)) || (await tcpOpen(ip, port, 1500)) ? port : null))
  );
  const ports = open.filter((p): p is number => p != null);
  return Promise.all(
    ports.map(async (port) => ({ url: `${await detectScheme(ip, port)}://${ip}:${port}`, port }))
  );
}

/** IPv4 addresses of a running LXC guest (net0/net1/... interfaces). */
async function lxcIps(device: Device, node: string, vmid: number): Promise<string[]> {
  const ifs = await pveGet<{ inet?: string }[]>(
    device,
    `/api2/json/nodes/${encodeURIComponent(node)}/lxc/${vmid}/interfaces`
  ).catch(() => [] as { inet?: string }[]);
  const ips: string[] = [];
  for (const i of ifs ?? []) {
    const ip = (i.inet ?? "").split("/")[0];
    if (ip && !ip.startsWith("127.")) ips.push(ip);
  }
  return [...new Set(ips)];
}

/**
 * Scan a Proxmox VE device. Guests don't become console deep-links (a link
 * into the PVE UI is a dead end) — their summary lives on the device card
 * instead (see proxmoxLiveStatus). Tiles are only created for real endpoints:
 * running LXC guests are probed on common web ports and each open port becomes
 * a direct http(s) link to the service inside.
 */
export async function scanProxmoxDevice(device: Device): Promise<ScanResult> {
  const [version, guests, nodes] = await Promise.all([
    pveGet<{ version: string }>(device, "/api2/json/version"),
    pveGet<PveGuest[]>(device, "/api2/json/cluster/resources?type=vm"),
    pveGet<PveNode[]>(device, "/api2/json/nodes"),
  ]);

  const online = (nodes ?? []).filter((n) => n.status === "online");
  const active = (guests ?? []).filter(
    (g) => (g.type === "qemu" || g.type === "lxc") && !g.template
  );

  // A token that authenticates but lacks audit rights gets a silent empty list
  // from /cluster/resources. A real PVE always exposes its storages too, so
  // "only nodes visible, nothing else" means the permission never reached the
  // token — say so instead of reporting an empty dashboard.
  if (active.length === 0 && online.length > 0) {
    const all = await pveGet<{ type: string }[]>(device, "/api2/json/cluster/resources");
    if ((all ?? []).length <= online.length) {
      throw new AgentError(
        "Token works but sees no guests. Grant PVEAuditor on / to the token's user — and, " +
          "for a privilege-separated token, to the token as well (PVE intersects the two; " +
          "either half alone silently returns empty lists)",
        "NO_AUDIT"
      );
    }
  }

  // Running LXC guests: fetch their IPs, probe web ports, match icons — in parallel.
  const prepared = await Promise.all(
    active
      .filter((g) => g.type === "lxc" && g.status === "running")
      .map(async (g) => {
        const name = g.name || `CT ${g.vmid}`;
        const [ips, match] = await Promise.all([
          lxcIps(device, g.node, g.vmid),
          resolveIcon([name]),
        ]);
        const endpoints = (await Promise.all(ips.map(webEndpointsFor))).flat();
        return { g, name, match, endpoints };
      })
  );
  const entries: TileUpsert[] = [];
  for (const p of prepared) {
    // Direct links to web services inside running LXC guests. Multi-endpoint
    // guests get one tile per port with the port in the title (docker-style).
    for (const ep of p.endpoints) {
      entries.push({
        containerId: p.g.id,
        url: ep.url,
        title: p.endpoints.length > 1 ? `${p.name}:${ep.port}` : p.name,
        icon: p.match?.slug ?? "",
        image: "",
        state: p.g.status,
      });
    }
  }

  const { created, updated, removed } = reconcileTiles(device.id, device.name, entries);

  const info: DeviceScanInfo = {
    os: "proxmox",
    osType: "linux",
    cpuCount: online.reduce((s, n) => s + (n.maxcpu || 0), 0) || undefined,
    memTotalBytes: online.reduce((s, n) => s + (n.maxmem || 0), 0) || undefined,
    containers: {
      running: active.filter((g) => g.status === "running").length,
      paused: 0,
      stopped: active.filter((g) => g.status !== "running").length,
    },
    pveVersion: version.version,
    guests: {
      vms: active.filter((g) => g.type === "qemu").length,
      lxc: active.filter((g) => g.type === "lxc").length,
    },
  };
  saveScanInfo(device.id, info);

  return {
    info,
    containersSeen: active.length,
    tilesCreated: created,
    tilesUpdated: updated,
    tilesRemoved: removed,
  };
}

/** One entry of /cluster/resources — node, guest or storage. */
type PveResource = {
  type: string;
  id: string;
  vmid?: number;
  name?: string;
  status: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  uptime?: number;
  template?: number;
  node?: string;
};

/** Live cluster status from one call: node CPU/RAM totals + per-guest summary. */
export async function proxmoxLiveStatus(device: Device): Promise<DeviceStatus> {
  const resources = await pveGet<PveResource[]>(device, "/api2/json/cluster/resources");
  const nodes = (resources ?? []).filter((r) => r.type === "node" && r.status === "online");
  const guests = (resources ?? []).filter(
    (r) => (r.type === "qemu" || r.type === "lxc") && !r.template
  );

  const maxCpu = nodes.reduce((s, n) => s + (n.maxcpu || 0), 0);
  const mem = nodes.reduce((s, n) => s + (n.mem || 0), 0);
  const memTotal = nodes.reduce((s, n) => s + (n.maxmem || 0), 0);
  const cpuPct =
    maxCpu > 0
      ? Math.round((nodes.reduce((s, n) => s + (n.cpu || 0) * (n.maxcpu || 0), 0) / maxCpu) * 1000) / 10
      : null;

  return {
    online: nodes.length > 0,
    source: "agent",
    cpuPct,
    memBytes: mem || null,
    memLimitBytes: memTotal || null,
    memPct: memTotal ? Math.round((mem / memTotal) * 1000) / 10 : null,
    loadAvg: null,
    uptimeSec: nodes.reduce((m, n) => Math.max(m, n.uptime || 0), 0) || null,
    runningContainers: guests.filter((g) => g.status === "running").length,
    // Per-guest summary (PVE-portal style) for the device card.
    guests: guests
      .map((g): PveGuestStatus => ({
        id: g.id,
        vmid: g.vmid ?? 0,
        name: g.name || `${g.type === "qemu" ? "VM" : "CT"} ${g.vmid}`,
        type: g.type as "qemu" | "lxc",
        status: g.status,
        cpuPct: g.cpu != null && g.maxcpu ? Math.round(g.cpu * 1000) / 10 : null,
        memPct: g.maxmem ? Math.round(((g.mem || 0) / g.maxmem) * 1000) / 10 : null,
        memBytes: g.mem || null,
        memMaxBytes: g.maxmem || null,
        uptimeSec: g.uptime || null,
      }))
      // PVE-portal ordering: LXC guests first, then VMs, by VMID within each group.
      .sort((a, b) => (a.type === b.type ? a.vmid - b.vmid : a.type === "lxc" ? -1 : 1)),
  };
}
