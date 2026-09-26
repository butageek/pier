import type { Device } from "./types";

/** Client for the pier-agent that runs on each monitored server. */

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
  }
}

async function agentGet<T>(device: Device, path: string, timeoutMs = 5000): Promise<T> {
  const base = (device.agent_url || "").replace(/\/+$/, "");
  if (!base) throw new AgentError("Device has no agent URL");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      signal: ac.signal,
      headers: device.agent_key ? { "x-pier-key": device.agent_key } : {},
    });
    if (res.status === 401) throw new AgentError("Agent rejected the key", "UNAUTHORIZED");
    if (!res.ok) throw new AgentError(`Agent ${path} returned ${res.status}`, String(res.status));
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof AgentError) throw err;
    const e = err as NodeJS.ErrnoException & { name?: string };
    if (e?.name === "AbortError") throw new AgentError(`Agent ${path} timed out`, "TIMEOUT");
    const code = e?.code ?? (e?.cause as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EHOSTUNREACH") {
      throw new AgentError(`Cannot reach agent (${code}). Is it running on the server?`, code);
    }
    throw new AgentError(`Agent ${path} failed: ${e?.message ?? String(err)}`, code);
  } finally {
    clearTimeout(timer);
  }
}

export type AgentInfo = {
  hostname: string;
  platform: string;
  os: string;
  arch: string;
  kernel: string;
  cpuCount: number;
  memTotalBytes: number;
  uptimeSec: number;
  docker: { version: string; containers: { running: number; paused: number; stopped: number } } | null;
};

export type AgentContainer = {
  id: string;
  name: string;
  image: string;
  state: string;
  ports: { ip?: string; publicPort?: number; privatePort?: number; type?: string }[];
};

export type AgentStats = {
  cpuPct: number;
  memBytes: number;
  memTotalBytes: number;
  loadAvg: number[];
  uptimeSec: number;
};

export function agentInfo(device: Device) {
  return agentGet<AgentInfo>(device, "/info");
}

export async function agentContainers(device: Device): Promise<AgentContainer[]> {
  const data = await agentGet<{ docker: boolean; containers: AgentContainer[] }>(device, "/containers");
  return data.containers ?? [];
}

export function agentStats(device: Device) {
  return agentGet<AgentStats>(device, "/stats");
}

/** Quick connectivity + auth check used when adding a device. */
export async function testAgent(url: string, key: string): Promise<void> {
  const fake: Device = {
    id: 0,
    name: "",
    host: "",
    agent_url: url,
    agent_key: key,
    info: "{}",
    last_scan: null,
    created_at: "",
  };
  await agentGet<AgentInfo>(fake, "/info");
}
