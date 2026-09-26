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

function endpointsFor(c: SnapshotContainer, deviceHost: string): { url: string; port: number }[] {
  const seen = new Set<number>();
  const out: { url: string; port: number }[] = [];
  for (const p of c.ports ?? []) {
    if (!p.publicPort || p.type === "udp" || seen.has(p.publicPort)) continue;
    seen.add(p.publicPort);
    const hostIp = p.ip && p.ip !== "0.0.0.0" && p.ip !== "::" ? p.ip : deviceHost;
    out.push({ url: `http://${hostIp}:${p.publicPort}`, port: p.publicPort });
  }
  return out.sort((a, b) => a.port - b.port);
}

/**
 * Scan a device: detect OS/runtime facts, then reconcile one tile per published
 * container endpoint (upsert by device+container+url, prune endpoints that
 * disappeared). Stopped containers keep their tiles, flagged with their state.
 */
export async function scanDevice(device: Device): Promise<ScanResult> {
  const db = getDb();
  const { info, containers } = await getDeviceSnapshot(device);

  let created = 0;
  let updated = 0;
  const seenKeys = new Set<string>();

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
    "SELECT id, icon, url, title FROM tiles WHERE device_id = ? AND container_id = ? AND url = ?"
  );

  for (const c of containers) {
    const name = c.name || c.id.slice(0, 12);
    const endpoints = endpointsFor(c, device.host);
    if (endpoints.length === 0) continue;
    const match = await resolveIcon([...imageCandidates(c.image), name]);
    const multiPort = endpoints.length > 1;

    for (const ep of endpoints) {
      seenKeys.add(`${c.id}|${ep.url}`);
      const existing = findExisting.get(device.id, c.id, ep.url) as
        | { id: number; icon: string; url: string; title: string }
        | undefined;
      if (existing) updated++;
      else created++;
      const title = multiPort ? `${name}:${ep.port}` : name;
      upsert.run(title, ep.url, device.name, existing?.icon || match?.slug || "", device.id, c.id, c.image, c.state);
    }
  }

  // Prune auto tiles whose endpoint no longer exists on this device.
  const existingRows = db
    .prepare("SELECT id, container_id, url FROM tiles WHERE device_id = ?")
    .all(device.id) as { id: number; container_id: string | null; url: string }[];
  const gone = existingRows.filter((r) => r.container_id && !seenKeys.has(`${r.container_id}|${r.url}`));
  const del = db.prepare("DELETE FROM tiles WHERE id = ?");
  const removeMany = db.transaction((ids: number[]) => ids.forEach((id) => del.run(id)));
  removeMany(gone.map((r) => r.id));

  const now = new Date().toISOString();
  db.prepare("UPDATE devices SET info = ?, last_scan = ? WHERE id = ?").run(
    JSON.stringify(info),
    now,
    device.id
  );

  return {
    info: info as DeviceScanInfo,
    containersSeen: containers.length,
    tilesCreated: created,
    tilesUpdated: updated,
    tilesRemoved: gone.length,
  };
}
