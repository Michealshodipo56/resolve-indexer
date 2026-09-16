import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type SqliteDb = DatabaseSync;

export function openDatabase(databasePath: string): SqliteDb {
  const dir = path.dirname(databasePath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export function openMemoryDatabase(): SqliteDb {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function migrationsDir(from: string = __dirname): string {
  const candidates = [
    path.resolve(from, "../../migrations"),
    path.resolve(from, "../../../migrations"),
    path.resolve(process.cwd(), "migrations"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), "migrations");
}

export function applyMigrations(db: SqliteDb, dir?: string): string[] {
  const migDir = dir ?? migrationsDir();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const applied = new Set(
    (
      db
        .prepare("SELECT id FROM schema_migrations ORDER BY id")
        .all() as Array<{ id: string }>
    ).map((r) => r.id),
  );

  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const newlyApplied: string[] = [];
  const insert = db.prepare(
    "INSERT INTO schema_migrations (id) VALUES (?)",
  );

  withTransaction(db, () => {
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migDir, file), "utf8");
      db.exec(sql);
      insert.run(file);
      newlyApplied.push(file);
    }
  });

  return newlyApplied;
}

export function withTransaction<T>(db: SqliteDb, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
