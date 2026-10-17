import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/api";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export const PUT = (req: Request) => guardRoute(() => saveDeviceOrder(req));

/** Persist a user-arranged device order: `ids` in their new order. */
async function saveDeviceOrder(req: Request) {
  const body = await req.json().catch(() => null);
  const ids = (body ?? {})?.ids;
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) {
    return NextResponse.json({ error: "ids must be an array of device ids" }, { status: 400 });
  }

  const db = getDb();
  const setPos = db.prepare("UPDATE devices SET position = ? WHERE id = ?");
  db.transaction(() => (ids as number[]).forEach((id, i) => setPos.run(i, id)))();

  return NextResponse.json({ ok: true });
}
