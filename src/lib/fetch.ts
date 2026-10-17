/**
 * Parse a fetch Response as JSON, throwing a readable error when the body
 * isn't JSON (reverse-proxy 502/504 pages, empty error bodies) instead of
 * the browser's cryptic "Unexpected end of JSON input".
 */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.trim().slice(0, 120);
    throw new Error(`Server returned HTTP ${res.status}${snippet ? `: ${snippet}` : " (empty response)"}`);
  }
}
