import { NextResponse } from "next/server";
import { readIconUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * GET /api/icons/file/<name> — serve an uploaded icon from data/icons/.
 * Names are upload-generated (uuid + ext) and strictly validated, so this
 * can't escape the directory. UUID names never change content → immutable.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const file = readIconUpload(name);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(file.bytes, {
    headers: {
      "content-type": file.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      // Neutralize script execution if an SVG is opened directly (icons in
      // <img> tags never run scripts, direct navigation would).
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
