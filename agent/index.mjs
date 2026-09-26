#!/usr/bin/env node
/**
 * Pier Agent — run this on each server you want on your dashboard.
 *
 *   PIER_KEY=change-me node index.mjs
 *
 * or with Docker (recommended, no Node needed on the host):
 *
 *   docker run -d --name pier-agent --restart unless-stopped \
 *     -p 8080:8080 -e PIER_KEY=change-me \
 *     -v /var/run/docker.sock:/var/run/docker.sock \
 *     pier-agent
 *
 * Zero dependencies — plain Node (>=18). Serves:
 *   GET /health      liveness (no auth)
 *   GET /info        OS/arch/CPU/RAM/uptime + Docker presence    (auth)
 *   GET /containers  all containers + published ports           (auth)
 *   GET /stats       live CPU/RAM/load sampled from the host    (auth)
 *
 * Auth: X-Pier-Key header or ?key= — constant-time compared with PIER_KEY.
 */
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8080);
const KEY = process.env.PIER_KEY || "";
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || "/var/run/docker.sock";

if (!KEY) {
  console.error("pier-agent: set PIER_KEY to a shared secret (required)");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
function authorized(req) {
  const url = new URL(req.url, "http://localhost");
  const provided = String(req.headers["x-pier-key"] || url.searchParams.get("key") || "");
  const a = Buffer.from(provided);
  const b = Buffer.from(KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// host facts
// ---------------------------------------------------------------------------
function prettyOs() {
  try {
    const release = fs.readFileSync("/etc/os-release", "utf8");
    const m = release.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    if (m) return m[1];
  } catch {
    /* not linux / no os-release */
  }
  return `${os.type()} ${os.release()}`;
}

function readMem() {
  try {
    const mi = fs.readFileSync("/proc/meminfo", "utf8");
    const get = (k) => Number((mi.match(new RegExp(`^${k}:\\s+(\\d+) kB`, "m")) || [])[1] || 0) * 1024;
    const total = get("MemTotal");
    const available = get("MemAvailable");
    if (total > 0) return { total, available };
  } catch {
    /* fall through to os module */
  }
  return { total: os.totalmem(), available: os.freemem() };
}

async function cpuPctOver(windowMs = 300) {
  const sample = () => os.cpus().map((c) => c.times);
  const t1 = sample();
  await new Promise((r) => setTimeout(r, windowMs));
  const t2 = sample();
  let idle = 0;
  let total = 0;
  for (let i = 0; i < t1.length; i++) {
    const d = {
      user: t2[i].user - t1[i].user,
      nice: t2[i].nice - t1[i].nice,
      sys: t2[i].sys - t1[i].sys,
      idle: t2[i].idle - t1[i].idle,
      irq: t2[i].irq - t1[i].irq,
    };
    total += d.user + d.nice + d.sys + d.idle + d.irq;
    idle += d.idle;
  }
  return total > 0 ? Math.round(((total - idle) / total) * 1000) / 10 : 0;
}

// ---------------------------------------------------------------------------
// docker engine api over the local socket (optional — works without it)
// ---------------------------------------------------------------------------
function dockerGet(path, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DOCKER_SOCKET)) {
      reject(new Error("docker socket not present"));
      return;
    }
    const req = http.request({ socketPath: DOCKER_SOCKET, path, method: "GET", timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error(`docker ${path} -> ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`docker ${path} timed out`));
    });
    req.on("error", reject);
    req.end();
  });
}

let dockerInfoCache = { at: 0, value: null };
async function dockerInfo() {
  if (Date.now() - dockerInfoCache.at < 30_000) return dockerInfoCache.value;
  try {
    const [version, info] = await Promise.all([dockerGet("/version"), dockerGet("/info")]);
    const value = {
      version: version.Version,
      containers: {
        running: info.ContainersRunning ?? 0,
        paused: info.ContainersPaused ?? 0,
        stopped: info.ContainersStopped ?? 0,
      },
    };
    dockerInfoCache = { at: Date.now(), value };
    return value;
  } catch {
    dockerInfoCache = { at: Date.now(), value: null };
    return null;
  }
}

async function dockerContainers() {
  try {
    const list = await dockerGet("/containers/json?all=1");
    return (list ?? []).map((c) => ({
      id: c.Id,
      name: (c.Names?.[0] ?? "").replace(/^\//, ""),
      image: c.Image,
      state: c.State,
      ports: (c.Ports ?? [])
        .filter((p) => p.PublicPort)
        .map((p) => ({
          ip: p.IP,
          publicPort: p.PublicPort,
          privatePort: p.PrivatePort,
          type: p.Type ?? "tcp",
        })),
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const send = (code, data) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const path = (req.url ?? "/").split("?")[0];

  if (path === "/health") return send(200, { ok: true, agent: "pier" });
  if (!authorized(req)) return send(401, { error: "unauthorized" });

  try {
    if (path === "/info") {
      const mem = readMem();
      return send(200, {
        hostname: os.hostname(),
        platform: os.platform(),
        os: prettyOs(),
        arch: os.arch(),
        kernel: os.release(),
        cpuCount: os.cpus().length,
        memTotalBytes: mem.total,
        uptimeSec: Math.round(os.uptime()),
        docker: await dockerInfo(),
      });
    }

    if (path === "/containers") {
      const containers = await dockerContainers();
      return send(200, { docker: containers !== null, containers: containers ?? [] });
    }

    if (path === "/stats") {
      const mem = readMem();
      const cpuPct = await cpuPctOver();
      return send(200, {
        cpuPct,
        memBytes: mem.total - mem.available,
        memTotalBytes: mem.total,
        loadAvg: os.loadavg(),
        uptimeSec: Math.round(os.uptime()),
      });
    }

    return send(404, { error: "not found" });
  } catch (err) {
    return send(500, { error: err instanceof Error ? err.message : "agent error" });
  }
});

server.listen(PORT, () => {
  console.log(`pier-agent listening on :${PORT} (docker socket: ${DOCKER_SOCKET})`);
});
