import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { agentContainers, agentContainerStats, agentStats, AgentError } from "@/lib/agent";
import { proxmoxLiveStatus } from "@/lib/proxmox";
import type { Device, DeviceStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Live resource usage from pier-agent on the server — real host CPU/RAM
 * sampled on the device, cached 15s so dashboard polls stay cheap.
 */
const CACHE_TTL_MS = 15_000;
const cache = new Map<number, { at: number; status: DeviceStatus }>();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deviceId = Number(id);
  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const device = getDb().prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as Device | undefined;
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const hit = cache.get(deviceId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...hit.status, source: "cache" });
  }

  try {
    const status: DeviceStatus =
      device.type === "proxmox"
        ? await proxmoxLiveStatus(device)
        : await dockerLiveStatus(device);
    cache.set(deviceId, { at: Date.now(), status });
    return NextResponse.json(status);
  } catch (err) {
    const status: DeviceStatus = {
      online: false,
      error: err instanceof AgentError || err instanceof Error ? err.message : "Status check failed",
      source: "agent",
      cpuPct: null,
      memBytes: null,
      memLimitBytes: null,
      memPct: null,
      loadAvg: null,
      uptimeSec: null,
      runningContainers: null,
    };
    return NextResponse.json(status, { status: 200 });
  }
}

async function dockerLiveStatus(device: Device): Promise<DeviceStatus> {
  const [s, containers, cStats] = await Promise.all([
    agentStats(device),
    agentContainers(device),
    // Per-container usage is new — older agents 404 and the popup shows "—".
    agentContainerStats(device).catch(() => ({ docker: false, stats: [] })),
  ]);
  const byId = new Map(cStats.stats.map((x) => [x.id, x]));
  const info = JSON.parse(device.info || "{}");
  return {
    online: true,
    source: "agent",
    cpuPct: s.cpuPct,
    memBytes: s.memBytes,
    memLimitBytes: s.memTotalBytes,
    memPct: s.memTotalBytes ? pct(s.memBytes / s.memTotalBytes) : null,
    loadAvg: s.loadAvg,
    uptimeSec: s.uptimeSec,
    runningContainers: info.containers?.running ?? null,
    // For the card popup: running first, then alphabetical.
    containers: containers
      .map((c) => {
        const st = byId.get(c.id);
        return {
          id: c.id,
          name: c.name,
          image: c.image,
          state: c.state,
          cpuPct: st?.cpuPct ?? null,
          memPct: st && st.memBytes != null && st.memLimitBytes ? pct(st.memBytes / st.memLimitBytes) : null,
        };
      })
      .sort(
        (a, b) =>
          Number(b.state === "running") - Number(a.state === "running") ||
          a.name.localeCompare(b.name)
      ),
  };
}

function pct(v: number): number {
  return Math.round(Math.min(v, 1) * 1000) / 10;
}
