export type SyncErrorKind =
  | 'network'     // no connection / timeout — retry later
  | 'server'      // GitHub 5xx — retry later
  | 'rate_limit'  // retry after `retryAfterMs`
  | 'auth'        // token invalid, expired, or lacks access — user must fix
  | 'not_found'   // repository missing or invisible to the token
  | 'conflict'    // the branch moved under us — refetch and retry
  | 'public_repo' // refusing to write private data to a public repo
  | 'config';     // nothing configured / malformed settings

export class SyncError extends Error {
  constructor(
    public readonly kind: SyncErrorKind,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'SyncError';
  }

  /** Worth retrying automatically without the user doing anything. */
  get transient(): boolean {
    return this.kind === 'network' || this.kind === 'server' || this.kind === 'rate_limit' || this.kind === 'conflict';
  }
}
