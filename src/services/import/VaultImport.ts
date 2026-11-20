/**
 * One-time import of an existing Obsidian vault: each markdown file becomes one entry.
 * Entry ids are derived from the file path, so importing the same vault twice is a no-op.
 */

import { StorageAccessFramework } from 'expo-file-system/legacy';
import { addEntry } from '@/services/db/EntryDB';
import { scanVaultForMarkdown } from '@/services/vault/VaultScanner';
import { parseNote } from '@/services/vault/MarkdownParser';

export type ImportResult = { imported: number; skipped: number; failed: number };

const DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;

/** Best-effort original date: frontmatter `date:`, else a date in the file name, else now. */
export function guessCreatedAt(content: string, relativePath: string, fallback: number): number {
  const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const candidate = fm.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1] ?? relativePath.match(DATE_RE)?.[0];
  if (!candidate) return fallback;
  const m = candidate.match(DATE_RE);
  if (!m) return fallback;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0).getTime();
  return Number.isFinite(t) && t <= fallback ? t : fallback;
}

/** Stable id so re-imports are idempotent. */
export function importId(relativePath: string): string {
  return `imp:${relativePath}`;
}

export async function importVault(
  vaultUri: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const files = await scanVaultForMarkdown(vaultUri);
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0 };
  const now = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const content = await StorageAccessFramework.readAsStringAsync(file.uri);
      const parsed = parseNote(content, file.relativePath.replace(/^.*\//, '').replace(/\.md$/, ''));
      const body = parsed.body.trim();
      if (!body) {
        result.skipped++;
      } else {
        const text = `${parsed.title}\n\n${body}`;
        const saved = await addEntry(text, {
          id: importId(file.relativePath),
          createdAt: guessCreatedAt(content, file.relativePath, now),
        });
        if (saved) result.imported++;
        else result.skipped++;
      }
    } catch {
      result.failed++;
    }
    onProgress?.(i + 1, files.length);
  }
  return result;
}
