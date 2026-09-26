import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { AgentError } from "@/lib/agent";
import { scanDevice } from "@/lib/tiles";
import type { Device } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deviceId = Number(id);
  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const device = getDb().prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as Device | undefined;
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  try {
    const result = await scanDevice(device);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof AgentError ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
