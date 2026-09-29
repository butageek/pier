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

function open(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
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
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.pierDb) globalForDb.pierDb = open();
  return globalForDb.pierDb;
}
