/** Accepts "owner/name", "github.com/owner/name", or a full https URL (with or without .git). */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const m = cleaned.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}
