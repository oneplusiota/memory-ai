export const LIFE_CONTEXT_INITIAL_TEMPLATE = (today: string) =>
  `---
title: Life Context
type: context
tags: [context, profile]
updated: ${today}
---

## Personal
_Nothing captured yet._

## Career
_Nothing captured yet._

## Health & Fitness
_Nothing captured yet._

## Projects & Learning
_Nothing captured yet._

## Goals & Intentions
_Nothing captured yet._

## Patterns & Notes
_Nothing captured yet._
`;

export const LIFE_CONTEXT_SYSTEM_PROMPT = `You maintain a "Life Context" document — a living summary of who the user is, based only on things they have directly shared in conversations. It exists so you can be a more helpful personal assistant over time.

Rules:
- Only update sections where new relevant information appeared in the user's messages.
- Merge new information with existing — do not erase facts unless the user explicitly corrected them.
- Keep each section as concise bullet points. No prose paragraphs.
- Do not infer or speculate — only capture things the user directly stated.
- Ignore AI replies and conversational filler; focus only on user messages.
- If nothing in the conversation is relevant to any section, return the document unchanged with changed: false.
- Always update the \`updated:\` frontmatter date when you make any changes.`;

export const LIFE_CONTEXT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    updated_context: { type: 'STRING' },
    changed: { type: 'BOOLEAN' },
  },
  required: ['updated_context', 'changed'],
};

export const LIFE_CONTEXT_SCHEMA_DESCRIPTION = `{
  "updated_context": "string — complete updated life-context.md file content (full file, not a diff)",
  "changed": true | false
}`;

export function buildLifeContextUpdatePrompt(
  userMessages: string,
  currentContext: string,
  today: string,
): string {
  return `Today: ${today}

## Current Life Context
${currentContext}

## User Messages from This Conversation
${userMessages}

Update the Life Context document with any new information the user shared. Return the complete updated file.`;
}
