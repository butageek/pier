import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Serve the pier-agent script so servers can deploy it without cloning the
 * repo or building an image:
 *
 *   wget -qO agent.mjs http://<pier-host>:3000/agent.mjs
 */
export async function GET() {
  try {
    const file = path.join(process.cwd(), "agent", "index.mjs");
    const source = fs.readFileSync(file, "utf8");
    return new NextResponse(source, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "agent script not found on server" }, { status: 404 });
  }
}
