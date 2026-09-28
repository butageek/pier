import http from "node:http";
import https from "node:https";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { TileHealth } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Reachability probe for dashboard links. Browsers can't ping cross-origin
 * services, so Pier checks server-side with a HEAD request: any HTTP response
 * (401, 404, ...) proves the endpoint is up — only network errors and timeouts
 * count as down. Results are cached 60s so dashboard polls stay cheap, and
 * tiles that appear after a scan/add are probed on the next request.
 */
const TTL_MS = 60_000;
const TIMEOUT_MS = 5_000;
const CONCURRENCY = 8;

type Entry = { at: number; health: TileHealth };

// Survives dev hot-reload like the db singleton.
const globalForHealth = globalThis as unknown as {
  pierHealthCache?: Map<number, Entry>;
  pierHealthInflight?: Map<number, Promise<TileHealth>>;
};
const cache = (globalForHealth.pierHealthCache ??= new Map());
const inflight = (globalForHealth.pierHealthInflight ??= new Map());

function probe(url: string, timeoutMs = 5000): Promise<TileHealth> {
  const started = Date.now();
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      resolve({ state: "down", code: null, ms: null, error: "invalid url", at: started });
      return;
    }
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(
      u,
      {
        method: "HEAD",
        timeout: timeoutMs,
        // LAN services (and Proxmox VE) commonly serve self-signed certificates.
        rejectUnauthorized: false,
      },
      (res) => {
        res.resume(); // drain the (empty) body
        resolve({ state: "up", code: res.statusCode ?? 0, ms: Date.now() - started, at: started });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ state: "down", code: null, ms: null, error: "timeout", at: started });
    });
    req.on("error", (err) => {
      resolve({
        state: "down",
        code: null,
        ms: null,
        error: err.message || "probe failed",
        at: started,
      });
    });
    req.end();
  });
}

/** Dedup concurrent probes of the same tile (multiple tabs / poll overlap). */
function check(id: number, url: string): Promise<TileHealth> {
  const running = inflight.get(id);
  if (running) return running;
  const p = probe(url, TIMEOUT_MS).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export async function GET() {
  const tiles = getDb()
    .prepare("SELECT id, url FROM tiles WHERE hidden = 0")
    .all() as { id: number; url: string }[];
  const targets = tiles.filter((t) => /^https?:\/\//i.test(t.url));

  // Drop cache entries for deleted/hidden tiles so the map never grows stale.
  const liveIds = new Set(targets.map((t) => t.id));
  for (const id of [...cache.keys()]) if (!liveIds.has(id)) cache.delete(id);

  const health = new Map<number, TileHealth>();
  const queue: { id: number; url: string }[] = [];
  for (const t of targets) {
    const hit = cache.get(t.id);
    if (hit && Date.now() - hit.at < TTL_MS) health.set(t.id, hit.health);
    else queue.push(t);
  }

  // Bounded-concurrency sweep of the expired entries.
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const h = await check(t.id, t.url);
        cache.set(t.id, { at: Date.now(), health: h });
        health.set(t.id, h);
      }
    })
  );

  return NextResponse.json({ health: Object.fromEntries(health) });
}
