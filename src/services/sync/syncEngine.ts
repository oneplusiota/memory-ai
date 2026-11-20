/**
 * Pure sync logic — no React Native imports, so it is fully unit-testable.
 *
 * push:    local entries that changed since their last push → one commit per batch
 * restore: every entry file in the repo → local entries that are missing
 */

import { SyncError } from './errors';
import type { GitHubApi, Head, TreeEntry } from './GitHubClient';
import { ENTRIES_DIR, entryPath, parseEntryFile, serializeEntry } from './entryFile';
import type { StoredEntry } from './entryFile';

export type DirtyRow = StoredEntry & {
  deletedAt: number | null;
  /** True when a file for this entry was pushed before (so a delete has something to remove). */
  everSynced: boolean;
};

export interface SyncStore {
  listDirty(limit: number): Promise<DirtyRow[]>;
  markSynced(items: { id: string; updatedAt: number }[]): Promise<void>;
  /** Inserts the entry if its id is unknown locally. Returns true if it was added. */
  insertRemote(entry: StoredEntry): Promise<boolean>;
}

export const BATCH_SIZE = 100;
const MAX_CONFLICT_RETRIES = 4;

export type PushResult = { upserted: number; deleted: number; commits: number };

function commitMessage(upserted: number, deleted: number): string {
  if (upserted === 1 && deleted === 0) return 'Add entry';
  if (upserted === 0 && deleted === 1) return 'Delete entry';
  return `Sync ${upserted} saved, ${deleted} deleted`;
}

async function ensureHead(api: GitHubApi, branch: string): Promise<Head> {
  return (await api.getHead(branch)) ?? (await api.createInitialCommit());
}

/** Commits `entries` on top of the current head, rebasing onto a moved branch if needed. */
async function commitOnTop(
  api: GitHubApi,
  branch: string,
  head: Head,
  entries: TreeEntry[],
  message: string,
): Promise<Head> {
  let current = head;
  for (let attempt = 0; ; attempt++) {
    const treeSha = await api.createTree(current.treeSha, entries);
    const commitSha = await api.createCommit(message, treeSha, current.sha);
    try {
      await api.updateRef(branch, commitSha);
      return { sha: commitSha, treeSha };
    } catch (e) {
      // The branch moved (e.g. edited from a laptop). Our changes touch distinct files,
      // so rebuilding the same tree on the new head is a safe rebase.
      if (e instanceof SyncError && e.kind === 'conflict' && attempt < MAX_CONFLICT_RETRIES) {
        const latest = await api.getHead(branch);
        if (!latest) throw e;
        current = latest;
        continue;
      }
      throw e;
    }
  }
}

export async function pushPending(store: SyncStore, api: GitHubApi): Promise<PushResult> {
  const repo = await api.getRepo();
  if (!repo.isPrivate) {
    throw new SyncError('public_repo', `${repo.fullName} is a public repository. Backups are only written to private repositories.`);
  }
  const branch = repo.defaultBranch;

  const result: PushResult = { upserted: 0, deleted: 0, commits: 0 };
  let head: Head | null = null;
  let remotePaths: Set<string> | null = null;

  for (;;) {
    const dirty = await store.listDirty(BATCH_SIZE);
    if (dirty.length === 0) return result;

    const tree: TreeEntry[] = [];
    const settled: { id: string; updatedAt: number }[] = [];
    let upserted = 0;
    let deleted = 0;

    // Deleting a path that is not in the tree makes GitHub reject the whole commit,
    // so deletions are checked against the real tree first.
    const needsDeletes = dirty.some((d) => d.deletedAt !== null && d.everSynced);
    if (needsDeletes) {
      head = head ?? (await ensureHead(api, branch));
      if (!remotePaths) remotePaths = new Set((await api.listFiles(head.treeSha)).map((f) => f.path));
    }

    for (const d of dirty) {
      settled.push({ id: d.id, updatedAt: d.updatedAt });
      const path = entryPath(d);
      if (d.deletedAt !== null) {
        if (d.everSynced && remotePaths?.has(path)) {
          tree.push({ path, mode: '100644', type: 'blob', sha: null });
          deleted++;
        }
        continue; // never pushed, or already gone remotely
      }
      tree.push({ path, mode: '100644', type: 'blob', content: serializeEntry(d) });
      upserted++;
    }

    if (tree.length > 0) {
      head = await commitOnTop(api, branch, head ?? (await ensureHead(api, branch)), tree, commitMessage(upserted, deleted));
      remotePaths = null; // tree changed; re-list lazily if a later batch needs it
      result.commits++;
      result.upserted += upserted;
      result.deleted += deleted;
    }
    await store.markSynced(settled);
  }
}

export type RestoreResult = { found: number; added: number; unreadable: number };

export async function restoreAll(
  store: SyncStore,
  api: GitHubApi,
  onProgress?: (done: number, total: number) => void,
): Promise<RestoreResult> {
  const repo = await api.getRepo();
  const head = await api.getHead(repo.defaultBranch);
  const result: RestoreResult = { found: 0, added: 0, unreadable: 0 };
  if (!head) return result;

  const files = (await api.listFiles(head.treeSha)).filter(
    (f) => f.path.startsWith(`${ENTRIES_DIR}/`) && f.path.endsWith('.md'),
  );
  result.found = files.length;

  let done = 0;
  const CONCURRENCY = 6;
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const file = files[next++];
      try {
        const entry = parseEntryFile(await api.getBlobText(file.sha));
        if (!entry) result.unreadable++;
        else if (await store.insertRemote(entry)) result.added++;
      } catch (e) {
        // Auth / rate-limit problems apply to every file — surface them instead of looping
        if (e instanceof SyncError && !e.transient) throw e;
        result.unreadable++;
      }
      onProgress?.(++done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  return result;
}
