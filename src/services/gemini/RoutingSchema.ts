export const ROUTING_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    notes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', enum: ['create_atom', 'update_atom'] },
          path: { type: 'STRING' },
          content: { type: 'STRING' },
        },
        required: ['action', 'path', 'content'],
      },
    },
    daily_entry: { type: 'STRING' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'STRING' },
  },
  required: ['notes', 'daily_entry', 'confidence', 'reasoning'],
};
