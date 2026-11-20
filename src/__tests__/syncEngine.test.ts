import { SyncError } from '@/services/sync/errors';
import type { GitHubApi, Head, RemoteFile, RepoInfo, TreeEntry } from '@/services/sync/GitHubClient';
import { entryPath, parseEntryFile, serializeEntry } from '@/services/sync/entryFile';
import { pushPending, restoreAll } from '@/services/sync/syncEngine';
import type { DirtyRow, SyncStore } from '@/services/sync/syncEngine';

// ── In-memory GitHub ───────────────────────────────────────────────────────

class FakeGitHub implements GitHubApi {
  isPrivate = true;
  hasBranch = false;
  files = new Map<string, string>();
  commits: { message: string; files: Map<string, string> }[] = [];
  /** Number of upcoming updateRef calls that should fail with a conflict. */
  failRefUpdates = 0;
  treeCalls = 0;
  private trees = new Map<string, Map<string, string>>();
  private n = 0;

  private sha() { return `sha${++this.n}`; }
  private snapshot(files: Map<string, string>) {
    const s = this.sha();
    this.trees.set(s, new Map(files));
    return s;
  }
  head(): Head { return { sha: `c${this.commits.length}`, treeSha: this.snapshot(this.files) }; }

  async getRepo(): Promise<RepoInfo> { return { fullName: 'me/data', isPrivate: this.isPrivate, defaultBranch: 'main' }; }
  async getHead() { return this.hasBranch ? this.head() : null; }
  async createInitialCommit() {
    this.hasBranch = true;
    this.files.set('README.md', 'readme');
    this.commits.push({ message: 'Initialize backup', files: new Map(this.files) });
    return this.head();
  }
  async createTree(baseTreeSha: string, entries: TreeEntry[]) {
    this.treeCalls++;
    const next = new Map(this.trees.get(baseTreeSha) ?? []);
    for (const e of entries) {
      if ('content' in e) next.set(e.path, e.content);
      else if (!next.has(e.path)) throw new SyncError('conflict', 'path does not exist in base tree', undefined, 422);
      else next.delete(e.path);
    }
    const s = this.sha();
    this.trees.set(s, next);
    return s;
  }
  async createCommit(message: string, treeSha: string) {
    const s = this.sha();
    this.pending.set(s, { message, files: this.trees.get(treeSha)! });
    return s;
  }
  private pending = new Map<string, { message: string; files: Map<string, string> }>();
  async updateRef(_b: string, commitSha: string) {
    if (this.failRefUpdates > 0) { this.failRefUpdates--; throw new SyncError('conflict', 'not a fast-forward', undefined, 422); }
    const c = this.pending.get(commitSha)!;
    this.files = new Map(c.files);
    this.commits.push(c);
  }
  async listFiles(treeSha: string): Promise<RemoteFile[]> {
    return [...(this.trees.get(treeSha) ?? [])].map(([path]) => ({ path, sha: `${treeSha}:${path}` }));
  }
  async getBlobText(sha: string) {
    const [tree, path] = [sha.split(':')[0], sha.slice(sha.indexOf(':') + 1)];
    return this.trees.get(tree)!.get(path)!;
  }
}

// ── In-memory store ────────────────────────────────────────────────────────

class FakeStore implements SyncStore {
  rows = new Map<string, DirtyRow & { syncedAt: number | null }>();
  add(id: string, text: string, createdAt = Date.UTC(2026, 10, 20, 9), updatedAt = createdAt) {
    this.rows.set(id, { id, text, createdAt, updatedAt, deletedAt: null, everSynced: false, syncedAt: null });
  }
  edit(id: string, text: string, at: number) { const r = this.rows.get(id)!; r.text = text; r.updatedAt = at; }
  remove(id: string, at: number) { const r = this.rows.get(id)!; r.deletedAt = at; r.updatedAt = at; }
  async listDirty(limit: number) {
    return [...this.rows.values()].filter((r) => r.syncedAt === null || r.syncedAt < r.updatedAt).slice(0, limit);
  }
  async markSynced(items: { id: string; updatedAt: number }[]) {
    for (const i of items) {
      const r = this.rows.get(i.id);
      if (r) { r.syncedAt = i.updatedAt; r.everSynced = true; }
    }
  }
  async insertRemote(e: { id: string; text: string; createdAt: number; updatedAt: number }) {
    if (this.rows.has(e.id)) return false;
    this.rows.set(e.id, { ...e, deletedAt: null, everSynced: true, syncedAt: e.updatedAt });
    return true;
  }
}

// ── entryFile ──────────────────────────────────────────────────────────────

describe('entryFile', () => {
  const entry = { id: 'lq3x9k-ab12cd', text: 'Met James.\n\nDiscussed "Q3" roadmap: ok', createdAt: Date.UTC(2026, 10, 20, 23, 30), updatedAt: Date.UTC(2026, 10, 21, 1, 0) };

  it('builds a stable path from the UTC date', () => {
    expect(entryPath(entry)).toBe('entries/2026/11/2026-11-20-lq3x9k-ab12cd.md');
  });

  it('round-trips an entry through the file format', () => {
    expect(parseEntryFile(serializeEntry(entry))).toEqual(entry);
  });

  it('hashes ids that are not filename-safe (imported paths)', () => {
    const p = entryPath({ id: 'imp:atoms/Q3 Roadmap.md', createdAt: entry.createdAt });
    expect(p).toMatch(/^entries\/2026\/11\/2026-11-20-i-[a-z0-9]+\.md$/);
    expect(entryPath({ id: 'imp:atoms/Q3 Roadmap.md', createdAt: entry.createdAt })).toBe(p);
  });

  it('keeps entries that look like frontmatter', () => {
    const tricky = { ...entry, text: '---\nnot: frontmatter\n---\nbody' };
    expect(parseEntryFile(serializeEntry(tricky))?.text).toBe(tricky.text);
  });

  it('rejects files without usable frontmatter', () => {
    expect(parseEntryFile('just text')).toBeNull();
    expect(parseEntryFile('---\nid: "x"\n---\n\nbody')).toBeNull();
  });
});

// ── pushPending ────────────────────────────────────────────────────────────

describe('pushPending', () => {
  it('refuses to write to a public repository', async () => {
    const gh = new FakeGitHub();
    gh.isPrivate = false;
    const store = new FakeStore();
    store.add('a', 'secret');
    await expect(pushPending(store, gh)).rejects.toMatchObject({ kind: 'public_repo' });
    expect(gh.commits).toHaveLength(0);
  });

  it('initialises an empty repo, then writes all pending entries in a single commit', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    store.add('a', 'one');
    store.add('b', 'two');
    const res = await pushPending(store, gh);
    expect(res).toEqual({ upserted: 2, deleted: 0, commits: 1 });
    expect(gh.commits.map((c) => c.message)).toEqual(['Initialize backup', 'Sync 2 saved, 0 deleted']);
    expect(gh.files.get(entryPath({ id: 'a', createdAt: Date.UTC(2026, 10, 20, 9) }))).toContain('one');
  });

  it('does nothing when everything is already synced', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    store.add('a', 'one');
    await pushPending(store, gh);
    const before = gh.commits.length;
    expect(await pushPending(store, gh)).toEqual({ upserted: 0, deleted: 0, commits: 0 });
    expect(gh.commits).toHaveLength(before);
  });

  it('pushes an edit as an update of the same file', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    store.add('a', 'one');
    await pushPending(store, gh);
    store.edit('a', 'one, revised', Date.UTC(2026, 10, 20, 10));
    await pushPending(store, gh);
    const files = [...gh.files.keys()].filter((p) => p.startsWith('entries/'));
    expect(files).toHaveLength(1);
    expect(gh.files.get(files[0])).toContain('one, revised');
    expect(gh.commits[gh.commits.length - 1].message).toBe('Add entry');
  });

  it('deletes the remote file for a deleted entry', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    store.add('a', 'one');
    await pushPending(store, gh);
    store.remove('a', Date.UTC(2026, 10, 20, 11));
    const res = await pushPending(store, gh);
    expect(res.deleted).toBe(1);
    expect([...gh.files.keys()].filter((p) => p.startsWith('entries/'))).toHaveLength(0);
  });

  it('skips an entry that was created and deleted before it was ever pushed', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    store.add('a', 'oops');
    store.remove('a', Date.UTC(2026, 10, 20, 9, 5));
    const res = await pushPending(store, gh);
    expect(res).toEqual({ upserted: 0, deleted: 0, commits: 0 });
    expect(await store.listDirty(10)).toHaveLength(0);
  });

  it('does not fail when the remote file for a deleted entry is already gone', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    store.add('a', 'one');
    await pushPending(store, gh);
    gh.files.delete(entryPath({ id: 'a', createdAt: Date.UTC(2026, 10, 20, 9) })); // removed on a laptop
    store.remove('a', Date.UTC(2026, 10, 20, 11));
    await expect(pushPending(store, gh)).resolves.toMatchObject({ deleted: 0 });
    expect(await store.listDirty(10)).toHaveLength(0);
  });

  it('retries on a moved branch and keeps changes made elsewhere', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    store.add('a', 'one');
    await pushPending(store, gh);
    gh.files.set('notes/from-laptop.md', 'hello'); // someone else committed
    store.add('b', 'two');
    gh.failRefUpdates = 2;
    await pushPending(store, gh);
    expect(gh.files.has('notes/from-laptop.md')).toBe(true);
    expect(gh.files.get(entryPath({ id: 'b', createdAt: Date.UTC(2026, 10, 20, 9) }))).toContain('two');
  });

  it('leaves entries unsynced when a push fails, so the next attempt retries them', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    store.add('a', 'one');
    gh.failRefUpdates = 99;
    await expect(pushPending(store, gh)).rejects.toMatchObject({ kind: 'conflict' });
    expect(await store.listDirty(10)).toHaveLength(1);
  });

  it('splits large backlogs into batches', async () => {
    const gh = new FakeGitHub();
    const store = new FakeStore();
    for (let i = 0; i < 250; i++) store.add(`e${i}`, `text ${i}`, Date.UTC(2026, 10, 20, 9) + i);
    const res = await pushPending(store, gh);
    expect(res.upserted).toBe(250);
    expect(res.commits).toBe(3);
  });
});

// ── restoreAll ─────────────────────────────────────────────────────────────

describe('restoreAll', () => {
  it('restores missing entries on a fresh device and ignores non-entry files', async () => {
    const gh = new FakeGitHub();
    const source = new FakeStore();
    source.add('a', 'one', Date.UTC(2026, 10, 20, 9));
    source.add('b', 'two', Date.UTC(2026, 10, 21, 9));
    await pushPending(source, gh);
    gh.files.set('entries/2026/11/garbage.md', 'not an entry');

    const fresh = new FakeStore();
    const res = await restoreAll(fresh, gh);
    expect(res).toEqual({ found: 3, added: 2, unreadable: 1 });
    expect(fresh.rows.get('a')?.text).toBe('one');
    expect(fresh.rows.get('b')?.createdAt).toBe(Date.UTC(2026, 10, 21, 9));
    expect(await fresh.listDirty(10)).toHaveLength(0); // restored entries are not re-pushed
  });

  it('does not overwrite entries that already exist locally', async () => {
    const gh = new FakeGitHub();
    const source = new FakeStore();
    source.add('a', 'remote text');
    await pushPending(source, gh);

    const local = new FakeStore();
    local.add('a', 'local text');
    const res = await restoreAll(local, gh);
    expect(res.added).toBe(0);
    expect(local.rows.get('a')?.text).toBe('local text');
  });

  it('returns nothing for an empty repository', async () => {
    expect(await restoreAll(new FakeStore(), new FakeGitHub())).toEqual({ found: 0, added: 0, unreadable: 0 });
  });
});
