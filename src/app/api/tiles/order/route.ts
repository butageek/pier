import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Persist a user-arranged dashboard layout. Either or both fields:
 *  - `ids`    — tile ids in their new order; rewrites sort_order to match
 *  - `groups` — group names in their new order; upserts tile_groups positions
 */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ids, groups } = body as { ids?: unknown; groups?: unknown };
  if (ids !== undefined && (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id)))) {
    return NextResponse.json({ error: "ids must be an array of tile ids" }, { status: 400 });
  }
  if (groups !== undefined && (!Array.isArray(groups) || !groups.every((g) => typeof g === "string"))) {
    return NextResponse.json({ error: "groups must be an array of group names" }, { status: 400 });
  }
  if (ids === undefined && groups === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = getDb();
  db.transaction(() => {
    if (ids !== undefined) {
      const setOrder = db.prepare("UPDATE tiles SET sort_order = ? WHERE id = ?");
      (ids as number[]).forEach((id, i) => setOrder.run(i, id));
    }
    if (groups !== undefined) {
      const seen = new Set<string>();
      const upsert = db.prepare(`
        INSERT INTO tile_groups (name, position) VALUES (?, ?)
        ON CONFLICT(name) DO UPDATE SET position = excluded.position
      `);
      // Skip blanks and duplicates; positions are the final indexes.
      for (const [i, raw] of (groups as string[]).entries()) {
        const name = raw.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        upsert.run(name, i);
      }
      // The array is the complete order: forget saved groups no longer in it
      // (an empty array resets groups to alphabetical).
      const placeholders = [...seen].map(() => "?").join(", ");
      db.prepare(
        seen.size ? `DELETE FROM tile_groups WHERE name NOT IN (${placeholders})` : "DELETE FROM tile_groups"
      ).run(...seen);
    }
  })();

  return NextResponse.json({ ok: true });
}
