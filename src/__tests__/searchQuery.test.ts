import { buildMatchQuery } from '@/services/db/searchQuery';

describe('buildMatchQuery', () => {
  it('quotes each term as a prefix token', () => {
    expect(buildMatchQuery('roadmap meet')).toBe('"roadmap"* "meet"*');
  });

  it('lowercases and collapses whitespace', () => {
    expect(buildMatchQuery('  Q3   Roadmap ')).toBe('"q3"* "roadmap"*');
  });

  it('strips FTS5 syntax characters', () => {
    expect(buildMatchQuery('"unterminated NEAR( * -foo')).toBe('"unterminated"* "near"* "foo"*');
  });

  it('keeps non-latin scripts', () => {
    expect(buildMatchQuery('नमस्ते दुनिया')).toBe('"नमस्ते"* "दुनिया"*');
  });

  it('returns null when nothing is searchable', () => {
    expect(buildMatchQuery('  ***  ')).toBeNull();
    expect(buildMatchQuery('')).toBeNull();
  });
});
