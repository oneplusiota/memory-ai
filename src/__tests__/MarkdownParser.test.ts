import { parseNote, extractWikilinks } from '../services/vault/MarkdownParser';

describe('parseNote', () => {
  it('extracts YAML frontmatter fields', () => {
    const content = `---
title: My Note
tags: [project, work]
aliases: [MyNote]
---

Body text here.`;
    const result = parseNote(content, 'fallback');
    expect(result.title).toBe('My Note');
    expect(result.tags).toEqual(['project', 'work']);
    expect(result.aliases).toEqual(['MyNote']);
  });

  it('falls back to first H1 heading when no title in frontmatter', () => {
    const content = `---
tags: [test]
---

# Heading Title

Some body.`;
    const result = parseNote(content, 'fallback');
    expect(result.title).toBe('Heading Title');
  });

  it('falls back to provided fallback title when no frontmatter or heading', () => {
    const result = parseNote('Just plain text.', 'my-fallback');
    expect(result.title).toBe('my-fallback');
  });

  it('extracts wikilinks from body', () => {
    const content = `---\n---\n\nSee [[Project Alpha]] and [[Task Board|Tasks]].`;
    const result = parseNote(content, 'x');
    expect(result.outlinks).toContain('Project Alpha');
    expect(result.outlinks).toContain('Task Board');
  });

  it('summary is first 300 chars of body', () => {
    const body = 'A'.repeat(400);
    const result = parseNote(`---\n---\n\n${body}`, 'x');
    expect(result.summary.length).toBe(300);
  });

  it('handles multiline block-style tags', () => {
    const content = `---
tags:
  - alpha
  - beta
---

Body.`;
    const result = parseNote(content, 'x');
    expect(result.tags).toEqual(['alpha', 'beta']);
  });
});

describe('extractWikilinks', () => {
  it('deduplicates repeated links', () => {
    const links = extractWikilinks('[[Foo]] and [[Foo]] again');
    expect(links).toEqual(['Foo']);
  });

  it('strips pipe aliases', () => {
    const links = extractWikilinks('[[Real Name|Display Text]]');
    expect(links).toEqual(['Real Name']);
  });

  it('returns empty array for no links', () => {
    expect(extractWikilinks('No links here.')).toEqual([]);
  });
});
