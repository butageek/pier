import tls from "node:tls";
import { getDb } from "./db";
import { agentContainers, agentInfo } from "./agent";
import { imageCandidates, resolveIcon, iconUrl } from "./icons";
import type { Device, DeviceScanInfo, ScanResult, Tile } from "./types";

export type EnrichedTile = Tile & { iconUrl: string | null; auto: boolean };

/** Resolve the final icon URL for each tile (explicit slug > image name > title > hostname). */
export async function enrichTiles(tiles: Tile[]): Promise<EnrichedTile[]> {
  return Promise.all(
    tiles.map(async (t) => {
      const candidates = [
        t.icon,
        ...(t.container_image ? imageCandidates(t.container_image) : []),
        t.title,
        t.url,
      ].filter(Boolean);
      const match = t.icon
        ? { slug: t.icon, url: iconUrl(t.icon) }
        : await resolveIcon(candidates);
      return {
        ...t,
        iconUrl: match?.url ?? null,
        auto: t.device_id != null,
      };
    })
  );
}

type DeviceSnapshot = { info: DeviceScanInfo; containers: SnapshotContainer[] };

type SnapshotContainer = {
  id: string;
  name: string;
  image: string;
  state: string;
  ports: { ip?: string; publicPort?: number; privatePort?: number; type?: string }[];
};

/** Fetch OS facts + container list from pier-agent on the server. */
export async function getDeviceSnapshot(device: Device): Promise<DeviceSnapshot> {
  const [info, containers] = await Promise.all([agentInfo(device), agentContainers(device)]);
  return {
    info: {
      os: info.os,
      osType: info.platform,
      arch: info.arch,
      kernelVersion: info.kernel,
      dockerVersion: info.docker?.version,
      cpuCount: info.cpuCount,
      memTotalBytes: info.memTotalBytes,
      containers: info.docker?.containers,
    },
    containers,
  };
}

/**
 * Detect whether an endpoint speaks TLS by attempting a handshake.
 * Self-signed certificates are accepted (rejectUnauthorized: false) — common
 * on LAN services. Anything that fails/times out is treated as plain HTTP.
 */
export function detectScheme(host: string, port: number, timeoutMs = 2500): Promise<"https" | "http"> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (scheme: "https" | "http") => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(scheme);
      }
    };
    const socket = tls.connect({ host, port, rejectUnauthorized: false }, () => done("https"));
    socket.setTimeout(timeoutMs, () => done("http"));
    socket.on("error", () => done("http"));
    socket.on("close", () => done("http"));
  });
}

async function endpointsFor(c: SnapshotContainer, deviceHost: string): Promise<{ url: string; port: number }[]> {
  const seen = new Set<number>();
  const raw: { host: string; port: number }[] = [];
  for (const p of c.ports ?? []) {
    if (!p.publicPort || p.type === "udp" || seen.has(p.publicPort)) continue;
    seen.add(p.publicPort);
    const hostIp = p.ip && p.ip !== "0.0.0.0" && p.ip !== "::" ? p.ip : deviceHost;
    raw.push({ host: hostIp, port: p.publicPort });
  }
  const probed = await Promise.all(
    raw.map(async (r) => ({ url: `${await detectScheme(r.host, r.port)}://${r.host}:${r.port}`, port: r.port }))
  );
  return probed.sort((a, b) => a.port - b.port);
}

/** One auto-discovered endpoint to upsert for a device. */
export type TileUpsert = {
  /** Stable per-thing id (Docker container id, "lxc/100", "qemu/101", ...). */
  containerId: string;
  url: string;
  title: string;
  /** Explicit icon slug for new tiles; an existing user-picked icon always wins. */
  icon: string;
  image: string;
  state: string;
};

/**
 * Reconcile auto-discovered tiles for a device: upsert one tile per
 * (container, url), prune ones whose endpoint disappeared. Shared by the
 * Docker (pier-agent) and Proxmox scanners.
 */
export function reconcileTiles(deviceId: number, groupName: string, entries: TileUpsert[]): {
  created: number;
  updated: number;
  removed: number;
} {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO tiles (title, url, group_name, icon, device_id, container_id, container_image, container_state, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1000)
    ON CONFLICT (device_id, container_id, url) WHERE device_id IS NOT NULL AND container_id IS NOT NULL DO UPDATE SET
      title = excluded.title,
      container_image = excluded.container_image,
      container_state = excluded.container_state,
      group_name = excluded.group_name
  `);
  const findExisting = db.prepare(
    "SELECT icon FROM tiles WHERE device_id = ? AND container_id = ? AND url = ?"
  );

  let created = 0;
  let updated = 0;
  const seenKeys = new Set<string>();
  for (const e of entries) {
    seenKeys.add(`${e.containerId}|${e.url}`);
    const existing = findExisting.get(deviceId, e.containerId, e.url) as { icon: string } | undefined;
    if (existing) updated++;
    else created++;
    upsert.run(e.title, e.url, groupName, existing?.icon || e.icon, deviceId, e.containerId, e.image, e.state);
  }

  // Prune auto tiles whose endpoint no longer exists on this device.
  const existingRows = db
    .prepare("SELECT id, container_id, url FROM tiles WHERE device_id = ?")
    .all(deviceId) as { id: number; container_id: string | null; url: string }[];
  const gone = existingRows.filter((r) => r.container_id && !seenKeys.has(`${r.container_id}|${r.url}`));
  const del = db.prepare("DELETE FROM tiles WHERE id = ?");
  const removeMany = db.transaction((ids: number[]) => ids.forEach((id) => del.run(id)));
  removeMany(gone.map((r) => r.id));

  return { created, updated, removed: gone.length };
}

/** Write scan facts + timestamp back to the device row. */
export function saveScanInfo(deviceId: number, info: DeviceScanInfo): void {
  const db = getDb();
  db.prepare("UPDATE devices SET info = ?, last_scan = ? WHERE id = ?").run(
    JSON.stringify(info),
    new Date().toISOString(),
    deviceId
  );
}

/**
 * Scan a device: detect OS/runtime facts, then reconcile one tile per published
 * container endpoint (upsert by device+container+url, prune endpoints that
 * disappeared). Stopped containers keep their tiles, flagged with their state.
 */
export async function scanDevice(device: Device): Promise<ScanResult> {
  const { info, containers } = await getDeviceSnapshot(device);

  // Endpoint scheme probes and icon matching are network-bound — run them all
  // in parallel, then apply DB writes sequentially below.
  const prepared = await Promise.all(
    containers.map(async (c) => ({
      c,
      endpoints: await endpointsFor(c, device.host),
      match: await resolveIcon([...imageCandidates(c.image), c.name || c.id.slice(0, 12)]),
    }))
  );

  const entries: TileUpsert[] = [];
  for (const { c, endpoints, match } of prepared) {
    const name = c.name || c.id.slice(0, 12);
    for (const ep of endpoints) {
      entries.push({
        containerId: c.id,
        url: ep.url,
        title: endpoints.length > 1 ? `${name}:${ep.port}` : name,
        icon: match?.slug ?? "",
        image: c.image,
        state: c.state,
      });
    }
  }

  const { created, updated, removed } = reconcileTiles(device.id, device.name, entries);
  saveScanInfo(device.id, info);

  return {
    info,
    containersSeen: containers.length,
    tilesCreated: created,
    tilesUpdated: updated,
    tilesRemoved: removed,
  };
}
