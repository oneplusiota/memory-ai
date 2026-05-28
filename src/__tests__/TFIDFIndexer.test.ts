import { tokenize, indexNote, searchTFIDF } from '../services/indexer/TFIDFIndexer';
import type { VaultIndex } from '../types';

function makeIndex(): VaultIndex {
  return { notes: {}, tfidf: {}, corpusStats: {}, links: {}, builtAt: 0 };
}

describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello', 'world']);
  });

  it('removes stopwords', () => {
    const tokens = tokenize('the quick brown fox');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('quick');
  });

  it('filters tokens shorter than 3 chars', () => {
    expect(tokenize('it is a cat')).not.toContain('it');
    expect(tokenize('it is a cat')).toContain('cat');
  });
});

describe('indexNote + searchTFIDF', () => {
  it('returns indexed note on matching query', () => {
    const index = makeIndex();
    index.notes['notes/roadmap.md'] = {
      id: 'notes/roadmap.md', title: 'Roadmap', tags: [], aliases: [],
      summary: '', outlinks: [], lastModified: 0,
    };
    indexNote(index, 'notes/roadmap.md', tokenize('quarterly roadmap planning priorities'));

    const results = searchTFIDF(index, tokenize('roadmap'), 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].note.id).toBe('notes/roadmap.md');
  });

  it('returns empty array for unmatched query', () => {
    const index = makeIndex();
    index.notes['notes/foo.md'] = {
      id: 'notes/foo.md', title: 'Foo', tags: [], aliases: [],
      summary: '', outlinks: [], lastModified: 0,
    };
    indexNote(index, 'notes/foo.md', tokenize('foo bar baz'));

    const results = searchTFIDF(index, tokenize('quantum computing'), 5);
    expect(results.length).toBe(0);
  });

  it('ranks more relevant notes higher', () => {
    const index = makeIndex();
    index.notes['a.md'] = { id: 'a.md', title: 'A', tags: [], aliases: [], summary: '', outlinks: [], lastModified: 0 };
    index.notes['b.md'] = { id: 'b.md', title: 'B', tags: [], aliases: [], summary: '', outlinks: [], lastModified: 0 };

    indexNote(index, 'a.md', tokenize('gemini gemini gemini api integration'));
    indexNote(index, 'b.md', tokenize('weather forecast temperature'));

    const results = searchTFIDF(index, tokenize('gemini'), 5);
    expect(results[0].note.id).toBe('a.md');
  });
});
