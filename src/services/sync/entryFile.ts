/**
 * How an entry is stored in the backup repo: one markdown file per entry.
 *
 *   entries/2026/11/2026-11-20-lq3x9k-ab12cd.md
 *
 * The path is a pure function of (id, createdAt), so an entry can always be
 * found again to update or delete it. UTC is used for the date so the path
 * never changes with the phone's time zone.
 */

export type StoredEntry = {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

export const ENTRIES_DIR = 'entries';

/** 53-bit string hash (cyrb53); collision odds are negligible for this data size. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Ids we generate are already filename-safe; imported ones (paths) are hashed. */
function fileId(id: string): string {
  return /^[A-Za-z0-9_-]{1,60}$/.test(id) ? id : `i-${hash53(id)}`;
}

export function entryPath(entry: { id: string; createdAt: number }): string {
  const d = new Date(entry.createdAt);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${ENTRIES_DIR}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}-${fileId(entry.id)}.md`;
}

export function serializeEntry(entry: StoredEntry): string {
  return (
    '---\n' +
    `id: ${JSON.stringify(entry.id)}\n` +
    `created: ${new Date(entry.createdAt).toISOString()}\n` +
    `updated: ${new Date(entry.updatedAt).toISOString()}\n` +
    '---\n\n' +
    `${entry.text}\n`
  );
}

export function parseEntryFile(content: string): StoredEntry | null {
  const m = content.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!m) return null;
  const field = (key: string): string | null => {
    const hit = m[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return hit ? hit[1].trim() : null;
  };

  const rawId = field('id');
  const created = field('created');
  const updated = field('updated');
  if (!rawId || !created) return null;

  let id = rawId;
  try {
    const parsed = JSON.parse(rawId);
    if (typeof parsed === 'string') id = parsed;
  } catch {
    // unquoted id written by hand — use as-is
  }

  const createdAt = Date.parse(created);
  const updatedAt = updated ? Date.parse(updated) : createdAt;
  const text = m[2].replace(/\n+$/, '');
  if (!id || !Number.isFinite(createdAt) || !text.trim()) return null;
  return { id, text, createdAt, updatedAt: Number.isFinite(updatedAt) ? updatedAt : createdAt };
}
