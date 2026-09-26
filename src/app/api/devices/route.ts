import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { AgentError, testAgent } from "@/lib/agent";
import type { Device } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = getDb().prepare("SELECT * FROM devices ORDER BY id").all() as Device[];
  // Don't leak agent keys to the client.
  const devices = rows.map((d) => {
    const { agent_key, ...safe } = d;
    void agent_key;
    return safe;
  });
  return NextResponse.json({ devices });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const name = String(body.name ?? "").trim();
  const host = String(body.host ?? "").trim();
  const agentUrl = String(body.agent_url ?? "").trim();
  const agentKey = String(body.agent_key ?? "").trim();

  if (!name || !host) return NextResponse.json({ error: "Name and host are required" }, { status: 400 });
  if (!agentUrl || !agentKey) {
    return NextResponse.json({ error: "Agent URL and key are required" }, { status: 400 });
  }
  if (!/^https?:\/\//.test(agentUrl)) {
    return NextResponse.json({ error: "Agent URL must start with http:// or https://" }, { status: 400 });
  }

  // Verify the agent actually answers with this key before saving.
  try {
    await testAgent(agentUrl, agentKey);
  } catch (err) {
    const message = err instanceof AgentError ? err.message : "Agent connection test failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = getDb()
    .prepare("INSERT INTO devices (name, host, agent_url, agent_key) VALUES (?, ?, ?, ?)")
    .run(name, host, agentUrl, agentKey);
  const device = getDb()
    .prepare("SELECT * FROM devices WHERE id = ?")
    .get(result.lastInsertRowid) as Device;
  const { agent_key, ...safe } = device;
  void agent_key;
  return NextResponse.json({ device: safe }, { status: 201 });
}
