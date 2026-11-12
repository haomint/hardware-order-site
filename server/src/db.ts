import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrate(db: DatabaseSync) {
  const directory = new URL("../migrations/", import.meta.url);
  const migrations = readdirSync(directory).filter((file) => /^\d+-.*\.sql$/.test(file)).sort();
  transaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      ) STRICT;
    `);
    const applied = db.prepare("SELECT version FROM schema_migrations WHERE version = ?");
    const record = db.prepare("INSERT INTO schema_migrations VALUES (?, ?)");
    for (const file of migrations) {
      const version = Number(file.split("-")[0]);
      if (applied.get(version)) continue;
      db.exec(readFileSync(new URL(file, directory), "utf8"));
      record.run(version, Date.now());
    }
  });
}

export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
