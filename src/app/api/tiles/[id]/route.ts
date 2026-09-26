import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { enrichTiles } from "@/lib/tiles";
import type { Tile } from "@/lib/types";

export const dynamic = "force-dynamic";

const EDITABLE = ["title", "url", "description", "group_name", "icon", "sort_order"] as const;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tileId = Number(id);
  if (!Number.isInteger(tileId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const db = getDb();
  const existing = db.prepare("SELECT * FROM tiles WHERE id = ?").get(tileId) as Tile | undefined;
  if (!existing) return NextResponse.json({ error: "Tile not found" }, { status: 404 });

  // Accept both "group" (client form) and "group_name" (column name).
  if ("group" in body && !("group_name" in body)) body.group_name = body.group;

  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in body) updates[key] = String(body[key] ?? "").trim();
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  const setSql = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .join(", ");
  db.prepare(`UPDATE tiles SET ${setSql} WHERE id = ?`).run(...Object.values(updates), tileId);

  const tile = db.prepare("SELECT * FROM tiles WHERE id = ?").get(tileId) as Tile;
  return NextResponse.json({ tile: (await enrichTiles([tile]))[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tileId = Number(id);
  if (!Number.isInteger(tileId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const result = getDb().prepare("DELETE FROM tiles WHERE id = ?").run(tileId);
  if (result.changes === 0) return NextResponse.json({ error: "Tile not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
