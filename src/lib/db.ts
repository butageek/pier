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

/** True if `table` already has `column` — the guard behind each guarded migration. */
function columnExists(db: Database.Database, table: string, column: string): boolean {
  return (db.pragma(`table_info(${table})`) as { name: string }[]).some((c) => c.name === column);
}

function migrate(db: Database.Database) {
  // Migrate databases created before hidden links existed.
  if (!columnExists(db, "tiles", "hidden")) {
    db.exec("ALTER TABLE tiles ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
  }

  // Migrate databases created before Proxmox devices existed (all devices were docker).
  if (!columnExists(db, "devices", "type")) {
    db.exec("ALTER TABLE devices ADD COLUMN type TEXT NOT NULL DEFAULT 'docker'");
  }

  // Migrate databases from the pre-agent era (direct Docker API devices).
  const cols = db.pragma("table_info(devices)") as { name: string }[];
  if (cols.length > 0 && cols.some((c) => c.name === "docker_url")) {
    db.exec("ALTER TABLE tiles DROP INDEX IF EXISTS idx_tiles_device_endpoint");
    db.exec(`
      CREATE TABLE devices_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        agent_url TEXT NOT NULL DEFAULT '',
        agent_key TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'docker',
        info TEXT NOT NULL DEFAULT '{}',
        last_scan TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO devices_new (id, name, host, agent_url, agent_key, info, last_scan, created_at)
        SELECT id, name, host, COALESCE(agent_url, ''), COALESCE(agent_key, ''), info, last_scan, created_at
        FROM devices;
      DROP TABLE devices;
      ALTER TABLE devices_new RENAME TO devices;
    `);
  }
}

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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tiles_device_endpoint
      ON tiles(device_id, container_id, url)
      WHERE device_id IS NOT NULL AND container_id IS NOT NULL;
  `);
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.pierDb) globalForDb.pierDb = open();
  return globalForDb.pierDb;
}
