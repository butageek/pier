import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Device } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deviceId = Number(id);
  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const db = getDb();
  const device = db.prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as Device | undefined;
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const name = "name" in body ? String(body.name ?? "").trim() : device.name;
  const host = "host" in body ? String(body.host ?? "").trim() : device.host;
  const agentUrl = "agent_url" in body ? String(body.agent_url ?? "").trim() : device.agent_url;
  const agentKey = "agent_key" in body ? String(body.agent_key ?? "").trim() : device.agent_key;
  if (!name || !host || !agentUrl || !agentKey) {
    return NextResponse.json({ error: "Name, host, agent URL and key are required" }, { status: 400 });
  }
  if (!/^https?:\/\//.test(agentUrl)) {
    return NextResponse.json({ error: "Agent URL must start with http:// or https://" }, { status: 400 });
  }

  db.prepare("UPDATE devices SET name = ?, host = ?, agent_url = ?, agent_key = ? WHERE id = ?").run(
    name,
    host,
    agentUrl,
    agentKey,
    deviceId
  );
  const updated = db.prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as Device;
  const { agent_key, ...safe } = updated;
  void agent_key;
  return NextResponse.json({ device: safe });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deviceId = Number(id);
  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  // Cascades to the device's auto-discovered tiles.
  db.prepare("DELETE FROM tiles WHERE device_id = ?").run(deviceId);
  const result = db.prepare("DELETE FROM devices WHERE id = ?").run(deviceId);
  if (result.changes === 0) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
