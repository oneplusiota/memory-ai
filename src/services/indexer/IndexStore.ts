import { File, Paths } from 'expo-file-system';
import type { VaultIndex } from '@/types';

let memoryIndex: VaultIndex | null = null;

const emptyIndex = (): VaultIndex => ({
  notes: {},
  tfidf: {},
  corpusStats: {},
  links: {},
  builtAt: 0,
});

function indexFile(): File {
  return new File(Paths.document, 'vault-index.json');
}

export async function loadIndex(): Promise<VaultIndex> {
  if (memoryIndex) return memoryIndex;
  try {
    const f = indexFile();
    if (f.exists) {
      const raw = await f.text();
      memoryIndex = JSON.parse(raw) as VaultIndex;
      return memoryIndex;
    }
  } catch {
    // corrupted — start fresh
  }
  memoryIndex = emptyIndex();
  return memoryIndex;
}

export async function saveIndex(index: VaultIndex): Promise<void> {
  memoryIndex = index;
  const f = indexFile();
  f.write(JSON.stringify(index));
}

export function getIndex(): VaultIndex {
  return memoryIndex ?? emptyIndex();
}

export async function clearIndex(): Promise<void> {
  memoryIndex = emptyIndex();
  try {
    const f = indexFile();
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}
