import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";

/**
 * User-uploaded link icons. Files live in data/icons/ (gitignored, local-only,
 * same volume as pier.db). The tiles.icon column stores "upload:<filename>"
 * so uploaded icons flow through the same "explicit icon wins over scans"
 * logic as dashboard-icons slugs.
 */

export const UPLOAD_PREFIX = "upload:";
const UPLOAD_DIR = path.join(process.cwd(), "data", "icons");

/** Generated names only (uuid + extension) — also blocks path traversal. */
const SAFE_NAME = /^[A-Za-z0-9-]{8,}\.(png|jpe?g|gif|webp|svg|ico|avif)$/i;

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/avif": "avif",
};

export const MAX_ICON_BYTES = 2 * 1024 * 1024; // 2 MB

export function isUploadIcon(value: string | null | undefined): value is string {
  return !!value && value.startsWith(UPLOAD_PREFIX);
}

/** Browser URL for an uploaded icon value ("/api/icons/file/<name>"). */
export function uploadIconUrl(value: string): string {
  return `/api/icons/file/${value.slice(UPLOAD_PREFIX.length)}`;
}

/** Validate and persist an uploaded icon file; returns the tiles.icon value. */
export async function saveIconUpload(file: File): Promise<string> {
  const ext = MIME_TO_EXT[file.type];
  if (!ext) throw new UploadError("Unsupported image type");
  if (file.size > MAX_ICON_BYTES) throw new UploadError("Icon must be 2 MB or smaller");

  const name = `${crypto.randomUUID()}.${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return `${UPLOAD_PREFIX}${name}`;
}

export class UploadError extends Error {}

/** Read an uploaded icon for serving; null when missing or unsafe. */
export function readIconUpload(
  name: string
): { bytes: Uint8Array<ArrayBuffer>; contentType: string } | null {
  if (!SAFE_NAME.test(name)) return null;
  const ext = name.split(".").pop()!.toLowerCase();
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    avif: "image/avif",
  };
  try {
    const buf = fs.readFileSync(path.join(UPLOAD_DIR, name));
    // Copy into a standalone ArrayBuffer so the value satisfies Response's
    // BodyInit (Uint8Array<ArrayBuffer>, not ArrayBufferLike).
    const bytes = new Uint8Array(buf.byteLength);
    bytes.set(buf);
    return { bytes, contentType: types[ext] };
  } catch {
    return null;
  }
}

/**
 * Delete an uploaded icon file once nothing references it. Call when a tile's
 * icon is replaced or the tile is deleted.
 */
export function gcUploadIcon(icon: string | null | undefined): void {
  if (!isUploadIcon(icon)) return;
  const name = icon.slice(UPLOAD_PREFIX.length);
  if (!SAFE_NAME.test(name)) return;
  try {
    const used = getDb()
      .prepare("SELECT COUNT(*) AS n FROM tiles WHERE icon = ?")
      .get(icon) as { n: number };
    if (used.n === 0) fs.rmSync(path.join(UPLOAD_DIR, name), { force: true });
  } catch {
    // non-fatal: an orphaned file is harmless
  }
}
