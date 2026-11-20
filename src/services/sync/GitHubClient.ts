/**
 * Minimal GitHub REST client for the backup repo, built on the Git Data API so
 * a whole batch of entry changes lands as a single commit.
 */

import { SyncError } from './errors';

export type TreeEntry =
  | { path: string; mode: '100644'; type: 'blob'; content: string }
  | { path: string; mode: '100644'; type: 'blob'; sha: null }; // sha: null deletes the file

export type RepoInfo = { fullName: string; isPrivate: boolean; defaultBranch: string };
export type Head = { sha: string; treeSha: string };
export type RemoteFile = { path: string; sha: string };

/** Everything the sync engine needs from GitHub (also implemented by the in-memory fake in tests). */
export interface GitHubApi {
  getRepo(): Promise<RepoInfo>;
  /** Null when the branch does not exist yet (empty repository). */
  getHead(branch: string): Promise<Head | null>;
  /** Creates the first commit so the Git Data API becomes usable on an empty repo. */
  createInitialCommit(): Promise<Head>;
  createTree(baseTreeSha: string, entries: TreeEntry[]): Promise<string>;
  createCommit(message: string, treeSha: string, parentSha: string): Promise<string>;
  /** Fast-forward only. Throws SyncError('conflict') when the branch moved. */
  updateRef(branch: string, commitSha: string): Promise<void>;
  listFiles(treeSha: string): Promise<RemoteFile[]>;
  getBlobText(sha: string): Promise<string>;
}

const API = 'https://api.github.com';
const TIMEOUT_MS = 20000;

function utf8ToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

export function createGitHubClient(
  owner: string,
  repo: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): GitHubApi {
  const base = `${API}/repos/${owner}/${repo}`;

  async function request(
    method: string,
    path: string,
    opts: { body?: unknown; raw?: boolean } = {},
  ): Promise<{ status: number; data: any; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e: any) {
      throw new SyncError('network', e?.name === 'AbortError' ? 'GitHub did not respond in time.' : 'No connection to GitHub.');
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (res.ok) {
      let data: any = null;
      if (!opts.raw && text) {
        try { data = JSON.parse(text); } catch { /* non-JSON success body */ }
      }
      return { status: res.status, data, text };
    }

    let message = '';
    try { message = JSON.parse(text)?.message ?? ''; } catch { /* ignore */ }
    throw classify(res, message);
  }

  function classify(res: Response, message: string): SyncError {
    const status = res.status;
    const remaining = res.headers.get('x-ratelimit-remaining');
    const retryAfter = Number(res.headers.get('retry-after'));
    const reset = Number(res.headers.get('x-ratelimit-reset'));

    if (status === 429 || (status === 403 && (remaining === '0' || /rate limit/i.test(message)))) {
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Number.isFinite(reset) && reset > 0 ? Math.max(reset * 1000 - Date.now(), 1000) : 60000;
      return new SyncError('rate_limit', 'GitHub rate limit reached.', wait, status);
    }
    if (status === 401) return new SyncError('auth', 'The GitHub token is invalid or has expired. Create a new one and paste it in Settings.', undefined, status);
    if (status === 403) return new SyncError('auth', 'The token cannot write to this repository. It needs "Contents: Read and write" on it.', undefined, status);
    if (status === 404) return new SyncError('not_found', 'Repository not found. Check the name, and that the token has access to it.', undefined, status);
    if (status === 409 || status === 422) return new SyncError('conflict', message || 'GitHub rejected the update.', undefined, status);
    if (status >= 500) return new SyncError('server', 'GitHub is having trouble right now.', undefined, status);
    return new SyncError('server', `GitHub error ${status}${message ? `: ${message}` : ''}`, undefined, status);
  }

  return {
    async getRepo() {
      const { data } = await request('GET', '');
      return { fullName: data.full_name, isPrivate: data.private === true, defaultBranch: data.default_branch ?? 'main' };
    },

    async getHead(branch) {
      let sha: string;
      try {
        const { data } = await request('GET', `/git/ref/heads/${encodeURI(branch)}`);
        sha = data.object.sha;
      } catch (e) {
        // 404 = no such branch; 409 = "Git Repository is empty" — both mean nothing has been pushed yet
        if (e instanceof SyncError && (e.kind === 'not_found' || (e.kind === 'conflict' && e.status === 409))) return null;
        throw e;
      }
      const { data } = await request('GET', `/git/commits/${sha}`);
      return { sha, treeSha: data.tree.sha };
    },

    async createInitialCommit() {
      const readme = '# memory.ai backup\n\nPrivate backup of my memory.ai entries. One file per entry under `entries/`.\n';
      const { data } = await request('PUT', '/contents/README.md', {
        body: { message: 'Initialize backup', content: utf8ToBase64(readme) },
      });
      return { sha: data.commit.sha, treeSha: data.commit.tree.sha };
    },

    async createTree(baseTreeSha, entries) {
      const { data } = await request('POST', '/git/trees', { body: { base_tree: baseTreeSha, tree: entries } });
      return data.sha;
    },

    async createCommit(message, treeSha, parentSha) {
      const { data } = await request('POST', '/git/commits', { body: { message, tree: treeSha, parents: [parentSha] } });
      return data.sha;
    },

    async updateRef(branch, commitSha) {
      await request('PATCH', `/git/refs/heads/${encodeURI(branch)}`, { body: { sha: commitSha, force: false } });
    },

    async listFiles(treeSha) {
      const { data } = await request('GET', `/git/trees/${treeSha}?recursive=1`);
      if (data.truncated) throw new SyncError('server', 'The backup repo is too large to list in one request.');
      return (data.tree as { path: string; type: string; sha: string }[])
        .filter((t) => t.type === 'blob')
        .map((t) => ({ path: t.path, sha: t.sha }));
    },

    async getBlobText(sha) {
      const { text } = await request('GET', `/git/blobs/${sha}`, { raw: true });
      return text;
    },
  };
}
