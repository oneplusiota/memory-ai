import * as SecureStore from 'expo-secure-store';
import { parseRepoInput } from './repoInput';

const REPO_KEY = 'sync_github_repo';
const TOKEN_KEY = 'sync_github_token';

export type SyncConfig = { owner: string; repo: string; token: string };

/** The repository and token are saved independently, so either can be entered first. */
export async function loadSyncParts(): Promise<{ repo: string; token: string }> {
  const [repo, token] = await Promise.all([
    SecureStore.getItemAsync(REPO_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  return { repo: repo ?? '', token: token ?? '' };
}

export async function saveSyncRepo(repo: string): Promise<void> {
  await SecureStore.setItemAsync(REPO_KEY, repo);
}

export async function saveSyncToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** Both parts present and valid, or null (sync stays off). */
export async function loadSyncConfig(): Promise<SyncConfig | null> {
  const { repo, token } = await loadSyncParts();
  const parsed = parseRepoInput(repo);
  return parsed && token ? { ...parsed, token } : null;
}

export async function clearSyncConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(REPO_KEY);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
