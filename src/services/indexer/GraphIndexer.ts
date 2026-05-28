import type { VaultIndex } from '@/types';

export function indexLinks(index: VaultIndex, noteId: string, outlinks: string[]): void {
  index.links[noteId] = outlinks;
}

export function hopDistance(
  index: VaultIndex,
  fromId: string,
  toId: string,
  maxDepth: number = 2,
): number {
  if (fromId === toId) return 0;
  const visited = new Set<string>([fromId]);
  let frontier = [fromId];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbor of index.links[node] ?? []) {
        if (neighbor === toId) return depth;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return Infinity;
}
