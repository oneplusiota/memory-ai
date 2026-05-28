export type ParsedNote = {
  title: string;
  tags: string[];
  aliases: string[];
  summary: string;
  outlinks: string[];
  body: string;
  type?: string;
  area?: string;
  status?: string;
};

export function parseNote(content: string, fallbackTitle: string): ParsedNote {
  const frontmatter = extractFrontmatter(content);
  const body = stripFrontmatter(content);
  return {
    title: frontmatter.title || extractFirstHeading(body) || fallbackTitle,
    tags: frontmatter.tags,
    aliases: frontmatter.aliases,
    summary: body.trim().slice(0, 300),
    outlinks: extractWikilinks(body),
    body,
    type: frontmatter.type,
    area: frontmatter.area,
    status: frontmatter.status,
  };
}

function extractFrontmatter(content: string): { title: string; tags: string[]; aliases: string[]; type?: string; area?: string; status?: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { title: '', tags: [], aliases: [] };
  const raw = match[1];
  const type = extractScalarField(raw, 'type') || undefined;
  const area = extractScalarField(raw, 'area') || undefined;
  const status = extractScalarField(raw, 'status') || undefined;
  return {
    title: extractScalarField(raw, 'title'),
    tags: extractArrayField(raw, 'tags'),
    aliases: extractArrayField(raw, 'aliases'),
    type,
    area,
    status,
  };
}

function extractScalarField(raw: string, key: string): string {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

function extractArrayField(raw: string, key: string): string[] {
  // Inline: tags: [a, b, c]
  const inline = raw.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)]`, 'm'));
  if (inline) {
    return inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  // Block:
  //   tags:
  //     - a
  //     - b
  const headerMatch = raw.match(new RegExp(`^${key}:\\s*$`, 'm'));
  if (headerMatch?.index !== undefined) {
    const after = raw.slice(headerMatch.index + headerMatch[0].length);
    const items: string[] = [];
    for (const line of after.split('\n')) {
      const item = line.match(/^\s+-\s+(.+)$/);
      if (item) {
        items.push(item[1].trim());
      } else if (line.trim() !== '' && !/^\s/.test(line)) {
        break; // hit next non-indented field
      }
    }
    return items;
  }
  return [];
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function extractFirstHeading(body: string): string {
  const m = body.match(/^#{1,3}\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

export function extractWikilinks(content: string): string[] {
  const matches = [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)];
  return [...new Set(matches.map((m) => m[1].trim()))];
}
