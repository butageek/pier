import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resolveIcon } from "@/lib/icons";
import { enrichTiles } from "@/lib/tiles";
import type { Tile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const tiles = getDb()
    .prepare("SELECT * FROM tiles ORDER BY group_name, sort_order, id")
    .all() as Tile[];
  return NextResponse.json({ tiles: await enrichTiles(tiles) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const title = String(body.title ?? "").trim();
  let url = String(body.url ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith("mailto:")) url = `http://${url}`;

  const description = String(body.description ?? "").trim();
  const group = String(body.group ?? "").trim();
  const icon = String(body.icon ?? "").trim();

  // Auto-resolve an icon slug from title/hostname unless one was picked explicitly.
  let slug = icon;
  if (!slug) {
    const match = await resolveIcon([title, url]);
    slug = match?.slug ?? "";
  }

  const db = getDb();
  const nextOrder = (
    db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM tiles").get() as { n: number }
  ).n;
  const result = db
    .prepare(
      `INSERT INTO tiles (title, url, description, group_name, icon, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(title, url, description, group, slug, nextOrder);

  const tile = db.prepare("SELECT * FROM tiles WHERE id = ?").get(result.lastInsertRowid) as Tile;
  return NextResponse.json({ tile: (await enrichTiles([tile]))[0] }, { status: 201 });
}
