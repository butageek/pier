import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { AgentError, testAgent } from "@/lib/agent";
import { testProxmox } from "@/lib/proxmox";
import type { Device, SafeDevice } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Devices as sent to the browser — agent keys/tokens never leave the server. */
function toSafeDevice(d: Device): SafeDevice {
  const { agent_key, ...safe } = d;
  void agent_key;
  return safe;
}

export async function GET() {
  const rows = getDb().prepare("SELECT * FROM devices ORDER BY id").all() as Device[];
  return NextResponse.json({ devices: rows.map(toSafeDevice) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const name = String(body.name ?? "").trim();
  const host = String(body.host ?? "").trim();
  const agentUrl = String(body.agent_url ?? "").trim();
  const agentKey = String(body.agent_key ?? "").trim();
  const type = body.type === "proxmox" ? "proxmox" : "docker";

  if (!name || !host) return NextResponse.json({ error: "Name and host are required" }, { status: 400 });
  if (!agentUrl || !agentKey) {
    return NextResponse.json({ error: "Agent URL and key are required" }, { status: 400 });
  }
  if (!/^https?:\/\//.test(agentUrl)) {
    return NextResponse.json({ error: "Agent URL must start with http:// or https://" }, { status: 400 });
  }

  if (type === "proxmox" && (!agentKey.includes("@") || !agentKey.includes("="))) {
    return NextResponse.json(
      { error: 'API token must look like "user@pam!token=uuid" — create one in PVE under Datacenter → Permissions → API Tokens' },
      { status: 400 }
    );
  }

  // Verify the endpoint actually answers with this credential before saving.
  try {
    if (type === "proxmox") await testProxmox(agentUrl, agentKey);
    else await testAgent(agentUrl, agentKey);
  } catch (err) {
    const message = err instanceof AgentError ? err.message : "Connection test failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = getDb()
    .prepare("INSERT INTO devices (name, host, agent_url, agent_key, type) VALUES (?, ?, ?, ?, ?)")
    .run(name, host, agentUrl, agentKey, type);
  const device = getDb()
    .prepare("SELECT * FROM devices WHERE id = ?")
    .get(result.lastInsertRowid) as Device;
  return NextResponse.json({ device: toSafeDevice(device) }, { status: 201 });
}
