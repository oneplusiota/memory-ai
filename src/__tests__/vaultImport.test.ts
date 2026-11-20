import { guessCreatedAt, importId } from '@/services/import/VaultImport';

jest.mock('expo-file-system/legacy', () => ({ StorageAccessFramework: {} }));
jest.mock('@/services/db/EntryDB', () => ({ addEntry: jest.fn() }));

describe('guessCreatedAt', () => {
  const now = new Date(2026, 10, 20, 15, 0).getTime();

  it('prefers the frontmatter date', () => {
    const content = '---\ntitle: x\ndate: 2026-03-05\n---\nbody';
    expect(new Date(guessCreatedAt(content, 'atoms/x.md', now)).getMonth()).toBe(2);
  });

  it('falls back to a date in the file name', () => {
    const d = new Date(guessCreatedAt('no frontmatter', 'daily/2026-01-09.md', now));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 9]);
  });

  it('uses the fallback when there is no date', () => {
    expect(guessCreatedAt('plain', 'atoms/Note.md', now)).toBe(now);
  });

  it('never returns a date in the future', () => {
    expect(guessCreatedAt('---\ndate: 2030-01-01\n---\n', 'x.md', now)).toBe(now);
  });
});

describe('importId', () => {
  it('is stable per path', () => {
    expect(importId('atoms/A.md')).toBe('imp:atoms/A.md');
  });
});
