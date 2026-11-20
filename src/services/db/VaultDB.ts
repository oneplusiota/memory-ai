/**
 * VaultDB — SQLite persistence layer for the vault index.
 * Stores note metadata and graph links.
 */

import * as SQLite from 'expo-sqlite';
import type { NoteNode } from '@/types';

const DB_NAME = 'vault.db';

let _db: SQLite.SQLiteDatabase | null = null;

// ── Bootstrap ──────────────────────────────────────────────────────────────

export async function openVaultDB(): Promise<void> {
  if (_db) return;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS notes (
      id             TEXT PRIMARY KEY,
      title          TEXT NOT NULL DEFAULT '',
      tags           TEXT NOT NULL DEFAULT '[]',
      aliases        TEXT NOT NULL DEFAULT '[]',
      summary        TEXT NOT NULL DEFAULT '',
      outlinks       TEXT NOT NULL DEFAULT '[]',
      type           TEXT,
      area           TEXT,
      status         TEXT,
      last_modified  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS links (
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      PRIMARY KEY (source, target)
    );
  `);
}

function getDB(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('VaultDB not initialised — call openVaultDB() first');
  return _db;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rowToNote(row: Record<string, unknown>): NoteNode {
  return {
    id:            String(row.id ?? ''),
    title:         String(row.title ?? ''),
    tags:          JSON.parse(String(row.tags ?? '[]')),
    aliases:       JSON.parse(String(row.aliases ?? '[]')),
    summary:       String(row.summary ?? ''),
    outlinks:      JSON.parse(String(row.outlinks ?? '[]')),
    type:          row.type ? String(row.type) : undefined,
    area:          row.area ? String(row.area) : undefined,
    status:        row.status ? String(row.status) : undefined,
    lastModified:  Number(row.last_modified ?? 0),
  };
}

// ── Note CRUD ──────────────────────────────────────────────────────────────

export async function upsertNote(note: NoteNode): Promise<void> {
  const db = getDB();
  await db.runAsync(
    `INSERT INTO notes
       (id, title, tags, aliases, summary, outlinks, type, area, status, last_modified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title          = excluded.title,
       tags           = excluded.tags,
       aliases        = excluded.aliases,
       summary        = excluded.summary,
       outlinks       = excluded.outlinks,
       type           = excluded.type,
       area           = excluded.area,
       status         = excluded.status,
       last_modified  = excluded.last_modified`,
    [
      note.id,
      note.title,
      JSON.stringify(note.tags),
      JSON.stringify(note.aliases),
      note.summary,
      JSON.stringify(note.outlinks),
      note.type ?? null,
      note.area ?? null,
      note.status ?? null,
      note.lastModified,
    ],
  );
}

export async function getAllNotes(): Promise<NoteNode[]> {
  const db = getDB();
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM notes');
  return rows.map(rowToNote);
}

export async function getNoteCount(): Promise<number> {
  const db = getDB();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM notes');
  return row?.count ?? 0;
}

// ── Graph links ────────────────────────────────────────────────────────────

export async function upsertLinks(sourceId: string, targets: string[]): Promise<void> {
  const db = getDB();
  await db.runAsync('DELETE FROM links WHERE source = ?', [sourceId]);
  for (const target of targets) {
    await db.runAsync(
      'INSERT OR IGNORE INTO links (source, target) VALUES (?, ?)',
      [sourceId, target],
    );
  }
}

// ── Bulk ops ───────────────────────────────────────────────────────────────

export async function clearNotes(): Promise<void> {
  const db = getDB();
  await db.runAsync('DELETE FROM notes');
  await db.runAsync('DELETE FROM links');
}


