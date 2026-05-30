export function noteTitle(id: string): string {
  return id.replace(/^.*\//, '').replace(/\.md$/, '');
}
