import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Single SQLite database, stored under data/pier.db (gitignored).
 * A global is used so hot-reload in dev doesn't open a new handle per request.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "pier.db");

const globalForDb = globalThis as unknown as { pierDb?: Database.Database };

/**
 * Self-diagnosing permission-error text: reports who the process runs as vs
 * who owns the data dir, and names the exact fix for that combination (the
 * classic Docker trap — a PUID/PGID mismatch looks identical to a bug).
 */
function ownershipDiagnostics(): string {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  try {
    const st = fs.statSync(DATA_DIR);
    const mode = (st.mode & 0o7777).toString(8);
    const report = `Pier is running as uid=${uid ?? "?"} gid=${gid ?? "?"}, and the data dir is owned by ${st.uid}:${st.gid} (mode ${mode})`;
    if (uid != null && (st.uid !== uid || (gid != null && st.gid !== gid))) {
      return (
        `${report} — they don't match. ` +
        `Either chown the directory to the running user ` +
        `(sudo chown -R ${uid}:${gid} ./data) or remove PUID/PGID from compose.yaml ` +
        `so Pier runs as the directory's owner, then recreate the container.`
      );
    }
    const writable =
      (st.mode & 0o200) !== 0 ||
      (gid != null && st.gid === gid && (st.mode & 0o020) !== 0) ||
      (st.mode & 0o002) !== 0;
    if (!writable) {
      return (
        `${report} — the mode grants no write permission. ` +
        `Run sudo chmod u+w ./data (or 755) and restart the container.`
      );
    }
    return (
      `${report}, which looks correct — ` +
      `check extended ACLs (Synology: ls -le ./data), that the mount isn't read-only, ` +
      `and that the volume has free space.`
    );
  } catch {
    return `Pier is running as uid=${uid ?? "?"} gid=${gid ?? "?"} (could not stat the data dir).`;
  }
}

function open(): Database.Database {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    throw new Error(
      `Pier cannot create its data directory ${DATA_DIR} ` +
        `(${err instanceof Error ? err.message : String(err)}). ${ownershipDiagnostics()}`
    );
  }
  let db: Database.Database;
  try {
    db = new Database(DB_PATH);
  } catch (err) {
    throw new Error(
      `Pier cannot open its database at ${DB_PATH} ` +
        `(${err instanceof Error ? err.message : String(err)}). ${ownershipDiagnostics()}`
    );
  }
  try {
    db.pragma("journal_mode = WAL");
    db.exec(`
    CREATE TABLE IF NOT EXISTS tiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      group_name TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
      container_id TEXT,
      container_image TEXT NOT NULL DEFAULT '',
      container_state TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      agent_url TEXT NOT NULL DEFAULT '',
      agent_key TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'docker',
      info TEXT NOT NULL DEFAULT '{}',
      last_scan TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tiles_device_endpoint
      ON tiles(device_id, container_id, url)
      WHERE device_id IS NOT NULL AND container_id IS NOT NULL;
    -- User-arranged group order (dashboard groups are otherwise alphabetical).
      CREATE TABLE IF NOT EXISTS tile_groups (
        name TEXT PRIMARY KEY,
        position INTEGER NOT NULL DEFAULT 0
      );
    `);
  } catch (err) {
    if (/readonly|disk image|locked/i.test(String(err))) {
      throw new Error(
        `Pier cannot write to ${DATA_DIR} (${err instanceof Error ? err.message : String(err)}). ${ownershipDiagnostics()}`
      );
    }
    throw err;
  }
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.pierDb) globalForDb.pierDb = open();
  return globalForDb.pierDb;
}
