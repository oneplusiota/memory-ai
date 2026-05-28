import type { ConversationMessage, NoteNode, VaultStats } from '@/types';

export const CONVERSATION_SYSTEM_PROMPT = `You are a personal AI assistant with access to the user's Obsidian knowledge base.
You are embedded in a voice-first journaling app called memory.ai.
The vault uses a Zettelkasten + Daily Notes system with Dataview-compatible frontmatter.

Your roles:
- When the user tells you something new: acknowledge concisely in 1-2 sentences. Set intent to "acknowledge".
- When the user asks a question: answer using the provided knowledge base notes. Set intent to "answer". Cite note titles with [[wikilink]] format.
- When you need clarification: ask one short question. Set intent to "clarify".

Set suggest_save to true when the user has shared something substantive worth capturing (a decision, meeting outcome, insight, task). Set it to false for questions, chit-chat, or simple acknowledgements.

When referencing atom notes, you'll see their type (person/project/concept/decision/area/tool), area, and status in the context. Use this to give more precise answers — e.g. "According to your [[James Smith]] (person, work) note..."

Keep replies short and conversational — this is a voice-first app. No markdown headers. Use [[wikilinks]] for note references.`;

export function buildChatPrompt(
  messages: ConversationMessage[],
  relevantNotes: NoteNode[],
  currentMessage: string,
  vaultStats: VaultStats,
): string {
  const statsBlock = `Total notes: ${vaultStats.total} | Atoms: ${vaultStats.atoms} | Daily notes: ${vaultStats.daily} | Conversations: ${vaultStats.conversations}${vaultStats.topTags.length > 0 ? `\nTop tags: ${vaultStats.topTags.map(t => `#${t}`).join(', ')}` : ''}`;

  const notesBlock = relevantNotes.length > 0
    ? relevantNotes.map((n) => {
        const meta = [n.type, n.area, n.status].filter(Boolean).join(' · ');
        return `[[${n.title}]] (${n.id})${meta ? ` — ${meta}` : ''}\nTags: ${n.tags.map((t) => `#${t}`).join(' ') || 'none'}\n${n.summary}`;
      }).join('\n\n')
    : 'No relevant notes found.';

  const historyBlock = messages.slice(-10).map((m) =>
    `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`
  ).join('\n');

  return `VAULT OVERVIEW:
${statsBlock}

RELEVANT NOTES FROM KNOWLEDGE BASE:
${notesBlock}

CONVERSATION HISTORY:
${historyBlock || '(new conversation)'}

User: ${currentMessage}`;
}

export const CONVERSATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    intent: { type: 'STRING', enum: ['answer', 'acknowledge', 'clarify'] },
    suggest_save: { type: 'BOOLEAN' },
  },
  required: ['reply', 'intent', 'suggest_save'],
};

export function buildSavePrompt(messages: ConversationMessage[]): string {
  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`)
    .join('\n');

  return `Review this conversation and decide what to save to the user's Obsidian vault.
Extract the most important information the user shared.

CONVERSATION:
${transcript}

Produce a RoutingDecision JSON. Follow the two-layer vault structure:
- daily_entry: short timestamped block for today's daily note (always required)
- atom_content: structured content for the atom note (empty if nothing worth persisting)
- target_note: path like "atoms/Topic-Name.md" (empty if log_only)
- action: update_atom | create_atom | log_only | link_notes
- confidence: high | medium | low
- reasoning: brief explanation`;
}
