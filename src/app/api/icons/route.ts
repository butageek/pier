import { NextResponse } from "next/server";
import { resolveIcon, searchSlugs, iconUrl } from "@/lib/icons";

export const dynamic = "force-dynamic";

/**
 * GET /api/icons?q=term              → search slugs for the picker
 * GET /api/icons?title=&image=&url=  → resolve best match for a tile
 * GET /api/icons?hint=a&hint=b       → resolve + default suggestions for the picker
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = searchParams.get("q");
  if (q !== null) {
    const slugs = await searchSlugs(q);
    return NextResponse.json({ slugs, results: slugs.map((s) => ({ slug: s, url: iconUrl(s) })) });
  }

  const hints = [
    ...(searchParams.getAll("hint") ?? []),
    searchParams.get("title") ?? "",
    searchParams.get("image") ?? "",
    searchParams.get("url") ?? "",
  ].filter(Boolean);

  const match = hints.length > 0 ? await resolveIcon(hints) : null;

  let results: { slug: string; url: string }[] = [];
  if (match) {
    const around = await searchSlugs(match.slug, 12);
    results = around.map((s) => ({ slug: s, url: iconUrl(s) }));
  }

  return NextResponse.json({ match, results });
}
