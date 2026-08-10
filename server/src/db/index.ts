import Database from "better-sqlite3";
import path from "path";

export const db = new Database(path.join(__dirname, "..", "..", "data.sqlite"));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  requiredDocs TEXT NOT NULL,
  receivedDocs TEXT NOT NULL DEFAULT '[]',
  additionalMessage TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'REQUEST_SENT',
  reminderCount INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  nextActionAt TEXT,
  createdAt TEXT NOT NULL,
  emailSubject TEXT NOT NULL DEFAULT '',
  lastMessageId TEXT,
  threadReferences TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employeeId INTEGER NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (employeeId) REFERENCES employees(id)
);
`);

// Lightweight migration for DB files created before threading support was added.
// SQLite has no "ADD COLUMN IF NOT EXISTS" in the versions bundled with better-sqlite3,
// so we just attempt each ALTER and swallow the "duplicate column" error.
for (const stmt of [
  `ALTER TABLE employees ADD COLUMN emailSubject TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN lastMessageId TEXT`,
  `ALTER TABLE employees ADD COLUMN threadReferences TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN docValidations TEXT NOT NULL DEFAULT '[]'`,
]) {
  try {
    db.exec(stmt);
  } catch {
    // column already exists — fine
  }
}
