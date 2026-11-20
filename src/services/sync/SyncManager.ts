/**
 * SyncManager — decides *when* to sync, so the user never has to.
 *
 *  - every local save/edit/delete schedules a push after a short debounce
 *  - the app coming to the foreground pushes anything left over
 *  - transient failures (offline, rate limit, GitHub down) retry with backoff
 *  - permanent failures (bad token, missing repo) stop and surface a message
 */

import { AppState } from 'react-native';
import {
  countDirtyEntries,
  insertRestoredEntry,
  listDirtyEntries,
  markEntriesSynced,
  onEntriesChanged,
} from '@/services/db/EntryDB';
import { createGitHubClient } from './GitHubClient';
import { SyncError } from './errors';
import { loadSyncConfig } from './SyncConfig';
import { pushPending, restoreAll } from './syncEngine';
import type { RestoreResult, SyncStore } from './syncEngine';

export type SyncState = 'disabled' | 'idle' | 'syncing' | 'error';

export type SyncStatus = {
  state: SyncState;
  pending: number;
  lastSyncedAt: number | null;
  error: { kind: SyncError['kind']; message: string } | null;
};

const DEBOUNCE_MS = 2000;
const BACKOFF_MS = [5000, 15000, 60000, 300000, 900000];

const store: SyncStore = {
  listDirty: listDirtyEntries,
  markSynced: markEntriesSynced,
  insertRemote: insertRestoredEntry,
};

let status: SyncStatus = { state: 'disabled', pending: 0, lastSyncedAt: null, error: null };
const subscribers = new Set<(s: SyncStatus) => void>();

let started = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let running: Promise<void> | null = null;
let rerun = false; // a change arrived while a push was running

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  subscribers.forEach((cb) => cb(status));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

async function refreshPending() {
  try {
    setStatus({ pending: await countDirtyEntries() });
  } catch {
    // ignore — the database may not be open yet
  }
}

async function runOnce(): Promise<void> {
  const config = await loadSyncConfig();
  if (!config) {
    setStatus({ state: 'disabled', error: null });
    await refreshPending();
    return;
  }

  setStatus({ state: 'syncing', error: null });
  try {
    await pushPending(store, createGitHubClient(config.owner, config.repo, config.token));
    failures = 0;
    setStatus({ state: 'idle', lastSyncedAt: Date.now(), error: null });
  } catch (e) {
    const err = e instanceof SyncError ? e : new SyncError('server', e instanceof Error ? e.message : 'Sync failed.');
    setStatus({ state: 'error', error: { kind: err.kind, message: err.message } });
    if (err.transient) scheduleRetry(err.retryAfterMs);
  }
  await refreshPending();
}

function scheduleRetry(retryAfterMs?: number) {
  if (retryTimer) clearTimeout(retryTimer);
  const backoff = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
  failures++;
  retryTimer = setTimeout(() => { retryTimer = null; syncNow(); }, Math.max(backoff, retryAfterMs ?? 0));
}

/** Pushes pending changes right now. Concurrent calls share one run. */
export function syncNow(): Promise<void> {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (running) { rerun = true; return running; }
  running = (async () => {
    try {
      do {
        rerun = false;
        await runOnce();
      } while (rerun && status.state !== 'error');
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Like syncNow, but gives up waiting after `ms` (the sync keeps going in the background). */
export async function syncNowWithin(ms: number): Promise<boolean> {
  const done = syncNow().then(() => true);
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms));
  const finished = await Promise.race([done, timeout]);
  return finished && status.state === 'idle' && status.pending === 0;
}

function schedule() {
  void refreshPending();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { debounceTimer = null; syncNow(); }, DEBOUNCE_MS);
}

/** Starts watching for changes. Safe to call more than once. */
export function startSync(): void {
  if (started) return;
  started = true;
  onEntriesChanged(schedule);
  AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      failures = 0; // a fresh foreground is a good moment to retry
      syncNow();
    }
  });
  syncNow();
}

/** Call after the user saves new settings: forget old errors and try again. */
export function resetSync(): Promise<void> {
  failures = 0;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  return syncNow();
}

/** Pulls entries from the backup that are missing on this device. */
export async function restoreFromBackup(onProgress?: (done: number, total: number) => void): Promise<RestoreResult> {
  const config = await loadSyncConfig();
  if (!config) throw new SyncError('config', 'Set up the backup repository and token first.');
  return restoreAll(store, createGitHubClient(config.owner, config.repo, config.token), onProgress);
}

/** Checks the token and repository without writing anything. Throws a SyncError on failure. */
export async function testConnection(owner: string, repo: string, token: string): Promise<{ isPrivate: boolean }> {
  const info = await createGitHubClient(owner, repo, token).getRepo();
  if (!info.isPrivate) {
    throw new SyncError('public_repo', `${info.fullName} is public. Create a private repository for your backup.`);
  }
  return { isPrivate: true };
}
