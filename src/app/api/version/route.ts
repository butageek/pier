import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Which build is actually running — the first thing to check when a fix
 * "isn't working" (stale containers / cached bundles look identical to bugs).
 * Reads the version baked into the standalone bundle / image at build time.
 */
export const GET = () => guardRoute(pierVersion);

async function pierVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
    version?: string;
  };
  return NextResponse.json({ version: pkg.version ?? "unknown" });
}
