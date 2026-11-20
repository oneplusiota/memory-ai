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
const SCHEMA_VERSION = 2;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// ── Change notifications (drives auto-sync) ────────────────────────────────

const listeners = new Set<() => void>();

/** Called after any local write. Returns an unsubscribe function. */
export function onEntriesChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function emitChanged() {
  listeners.forEach((cb) => {
    try { cb(); } catch { /* a listener must never break a write */ }
  });
}

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version < 1) {
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

      PRAGMA user_version = 1;
    `);
    version = 1;
  }

  if (version < 2) {
    // synced_at = the updated_at value that was last pushed to the backup (NULL = never pushed)
    await db.execAsync(`
      ALTER TABLE entries ADD COLUMN synced_at INTEGER;
      CREATE INDEX IF NOT EXISTS idx_entries_dirty ON entries(updated_at) WHERE synced_at IS NULL OR synced_at < updated_at;
      PRAGMA user_version = 2;
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
  emitChanged();
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
  emitChanged();
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await openEntryDB();
  const now = Date.now();
  await db.runAsync('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  emitChanged();
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

// ── Sync support ───────────────────────────────────────────────────────────

export type DirtyEntry = Entry & { deletedAt: number | null; everSynced: boolean };

type DirtyRowRaw = Row & { deleted_at: number | null; synced_at: number | null };

/** Entries (including deletions) whose latest state has not been pushed yet, oldest first. */
export async function listDirtyEntries(limit: number): Promise<DirtyEntry[]> {
  const db = await openEntryDB();
  const rows = await db.getAllAsync<DirtyRowRaw>(
    `SELECT id, text, created_at, updated_at, deleted_at, synced_at
       FROM entries
      WHERE synced_at IS NULL OR synced_at < updated_at
      ORDER BY updated_at ASC
      LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({ ...toEntry(r), deletedAt: r.deleted_at, everSynced: r.synced_at !== null }));
}

export async function countDirtyEntries(): Promise<number> {
  const db = await openEntryDB();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM entries WHERE (synced_at IS NULL OR synced_at < updated_at) AND NOT (deleted_at IS NOT NULL AND synced_at IS NULL)',
  );
  return row?.n ?? 0;
}

/** Records which version of each entry reached the backup. An edit made mid-push stays dirty. */
export async function markEntriesSynced(items: { id: string; updatedAt: number }[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openEntryDB();
  await db.withTransactionAsync(async () => {
    for (const i of items) {
      await db.runAsync('UPDATE entries SET synced_at = ? WHERE id = ?', [i.updatedAt, i.id]);
    }
  });
}

/** Inserts an entry that exists in the backup but not locally. Never overwrites. */
export async function insertRestoredEntry(e: Entry): Promise<boolean> {
  const db = await openEntryDB();
  const result = await db.runAsync(
    'INSERT OR IGNORE INTO entries (id, text, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?)',
    [e.id, e.text, e.createdAt, e.updatedAt, e.updatedAt],
  );
  if (result.changes > 0) emitChanged();
  return result.changes > 0;
}
