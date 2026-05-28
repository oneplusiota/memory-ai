export function normalizeWikilink(link: string, currentNoteDir: string = ''): string {
  const clean = link.replace(/\[\[|\]\]/g, '').split('|')[0].trim();
  if (clean.endsWith('.md')) return clean;
  return clean + '.md';
}

export function noteTitle(id: string): string {
  return id.replace(/^.*\//, '').replace(/\.md$/, '');
}

export function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}
