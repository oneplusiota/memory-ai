export const ROUTING_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    action: {
      type: 'STRING',
      enum: ['update_atom', 'create_atom', 'log_only', 'link_notes'],
    },
    target_note: { type: 'STRING' },
    atom_content: { type: 'STRING' },
    daily_entry: { type: 'STRING' },
    confidence: {
      type: 'STRING',
      enum: ['high', 'medium', 'low'],
    },
    reasoning: { type: 'STRING' },
  },
  required: ['action', 'target_note', 'atom_content', 'daily_entry', 'confidence', 'reasoning'],
};
