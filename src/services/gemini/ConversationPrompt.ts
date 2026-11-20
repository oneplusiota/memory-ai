import type { NoteNode } from '@/types';

const PERSONA = `You are a personal assistant inside memory.ai, a voice-first capture app. The user's notes live in a local vault you can search with tools. Be warm, brief and direct.`;

const TOOL_USE_POLICY = `## Tool use

- When the user asks about anything personal (activities, people, projects, plans, past entries), call search_vault first and answer from what it returns. Never say you have no information without searching.
- Use read_note when a search result looks relevant but you need the full text.
- To save something the user asks you to remember: call search_vault to find an existing note on the topic, then update_note if one matches or create_note if not (atoms/Note-Title.md, Title-Case-Hyphenated). Link related notes with [[wikilinks]].
- After saving, call append_daily_note once with a short entry in the form "### HH:MM — Title" followed by one or two lines and wikilinks to the notes touched.
- Writes need the user's confirmation. Never claim something was saved until a tool result confirms it.`;

const NO_VAULT = `No vault is connected, so you cannot search or save notes. If asked to, tell the user to connect a vault folder in Settings.`;

const FORMAT = `## Format

Plain sentences, no markdown headers, no bullet-point acknowledgements. This is a voice-first app, so write the way you would speak.`;

export function buildIndexBlock(notes: NoteNode[]): string {
  const recent = [...notes].sort((a, b) => b.lastModified - a.lastModified).slice(0, 20);
  if (recent.length === 0) return '';
  const lines = recent
    .map((n) => {
      const meta = [n.type, n.area, n.status].filter(Boolean).join(', ');
      return `- [[${n.title}]]${meta ? ` (${meta})` : ''}: ${n.summary.slice(0, 80).replace(/\n/g, ' ')}`;
    })
    .join('\n');
  return `\n\nRECENT NOTES (top 20 by last modified; use search_vault or read_note for more):\n${lines}`;
}

export function buildSystemPrompt(toolsAvailable: boolean, indexBlock: string = ''): string {
  return `${PERSONA}\n\n${FORMAT}${indexBlock}\n\n${toolsAvailable ? TOOL_USE_POLICY : NO_VAULT}`;
}
