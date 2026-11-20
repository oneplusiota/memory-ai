/**
 * EntryDB — the app's source of truth.
 *
 * Every capture is an immutable-id entry of plain text. Full-text search runs
 * through an FTS5 index kept in sync by triggers. Deletes are soft (deleted_at)
 * so a future sync layer can propagate them.
 */

import * as SQLite from 'expo-sqlite';
import { buildMatchQuery } from './searchQuery';

export type Entry = {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

const DB_NAME = 'memory.db';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS entries (
        id         TEXT PRIMARY KEY,
        text       TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
        text,
        content='entries',
        content_rowid='rowid',
        tokenize='porter unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
        INSERT INTO entries_fts(rowid, text) VALUES (new.rowid, new.text);
      END;
      CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
      END;
      CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE OF text ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
        INSERT INTO entries_fts(rowid, text) VALUES (new.rowid, new.text);
      END;

      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
  return db;
}

/** Opens the database once; safe to call from anywhere, any number of times. */
export function openEntryDB(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = init().catch((e) => {
      dbPromise = null; // allow a retry after a failed open
      throw e;
    });
  }
  return dbPromise;
}

function newId(now: number): string {
  // Time-sortable and collision-safe enough for a single-user app
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type Row = { id: string; text: string; created_at: number; updated_at: number };

function toEntry(r: Row): Entry {
  return { id: r.id, text: r.text, createdAt: r.created_at, updatedAt: r.updated_at };
}

// ── Writes ─────────────────────────────────────────────────────────────────

export async function addEntry(
  text: string,
  opts: { id?: string; createdAt?: number } = {},
): Promise<Entry | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const db = await openEntryDB();
  const now = Date.now();
  const createdAt = opts.createdAt ?? now;
  const id = opts.id ?? newId(now);
  const result = await db.runAsync(
    'INSERT OR IGNORE INTO entries (id, text, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, trimmed, createdAt, now],
  );
  if (result.changes === 0) return null; // id already exists (re-import)
  return { id, text: trimmed, createdAt, updatedAt: now };
}

export async function updateEntry(id: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const db = await openEntryDB();
  await db.runAsync(
    'UPDATE entries SET text = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [trimmed, Date.now(), id],
  );
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await openEntryDB();
  const now = Date.now();
  await db.runAsync('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listEntries(limit = 50, before?: number): Promise<Entry[]> {
  const db = await openEntryDB();
  const rows = before === undefined
    ? await db.getAllAsync<Row>(
        'SELECT id, text, created_at, updated_at FROM entries WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?',
        [limit],
      )
    : await db.getAllAsync<Row>(
        'SELECT id, text, created_at, updated_at FROM entries WHERE deleted_at IS NULL AND created_at < ? ORDER BY created_at DESC LIMIT ?',
        [before, limit],
      );
  return rows.map(toEntry);
}

/** BM25-ranked full-text search with stemming and prefix matching. */
export async function searchEntries(query: string, limit = 30): Promise<Entry[]> {
  const match = buildMatchQuery(query);
  if (!match) return [];
  const db = await openEntryDB();
  const rows = await db.getAllAsync<Row>(
    `SELECT e.id, e.text, e.created_at, e.updated_at
       FROM entries_fts
       JOIN entries e ON e.rowid = entries_fts.rowid
      WHERE entries_fts MATCH ? AND e.deleted_at IS NULL
      ORDER BY bm25(entries_fts)
      LIMIT ?`,
    [match, limit],
  );
  return rows.map(toEntry);
}

export async function countEntries(): Promise<number> {
  const db = await openEntryDB();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE deleted_at IS NULL');
  return row?.n ?? 0;
}
