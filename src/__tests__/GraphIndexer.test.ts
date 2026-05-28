import { indexLinks, hopDistance } from '../services/indexer/GraphIndexer';
import type { VaultIndex } from '../types';

function makeIndex(): VaultIndex {
  return { notes: {}, tfidf: {}, corpusStats: {}, links: {}, builtAt: 0 };
}

describe('hopDistance', () => {
  it('returns 0 for same note', () => {
    const index = makeIndex();
    expect(hopDistance(index, 'a.md', 'a.md')).toBe(0);
  });

  it('returns 1 for direct link', () => {
    const index = makeIndex();
    indexLinks(index, 'a.md', ['b.md']);
    expect(hopDistance(index, 'a.md', 'b.md')).toBe(1);
  });

  it('returns 2 for two-hop link', () => {
    const index = makeIndex();
    indexLinks(index, 'a.md', ['b.md']);
    indexLinks(index, 'b.md', ['c.md']);
    expect(hopDistance(index, 'a.md', 'c.md')).toBe(2);
  });

  it('returns Infinity when no path exists', () => {
    const index = makeIndex();
    indexLinks(index, 'a.md', ['b.md']);
    expect(hopDistance(index, 'a.md', 'z.md')).toBe(Infinity);
  });

  it('respects maxDepth and returns Infinity beyond it', () => {
    const index = makeIndex();
    indexLinks(index, 'a.md', ['b.md']);
    indexLinks(index, 'b.md', ['c.md']);
    indexLinks(index, 'c.md', ['d.md']);
    // 3 hops away, but maxDepth=2
    expect(hopDistance(index, 'a.md', 'd.md', 2)).toBe(Infinity);
  });
});
