import { NextResponse } from "next/server";

/**
 * Wrap a route handler body so unexpected throws return JSON instead of an
 * empty 500 body. The dashboard forms call res.json() unconditionally, and
 * a body-less error response surfaces as the cryptic browser exception
 * "Unexpected end of JSON input" — this keeps every failure actionable.
 */
export async function guardRoute(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api] unhandled error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
