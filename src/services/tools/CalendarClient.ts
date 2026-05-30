/**
 * CalendarClient — Google Calendar v3 REST API adapter.
 *
 * Uses the OAuth access token from @react-native-google-signin.
 * Calendar scopes must be added to the GoogleSignin.configure() call
 * in useAuth.ts before calendar access will work.
 *
 * Required scopes:
 *   https://www.googleapis.com/auth/calendar.readonly  (for list_events)
 *   https://www.googleapis.com/auth/calendar.events    (for create_event)
 */

import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { ToolDefinition, ToolResult } from '@/types';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

// ── Tool definitions ───────────────────────────────────────────────────────

export const CALENDAR_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_events',
    description: 'List upcoming events from the user\'s Google Calendar.',
    parameters: [
      { name: 'days_ahead', description: 'How many days ahead to look (default 7)', type: 'number', required: false },
      { name: 'max_results', description: 'Maximum number of events to return (default 10)', type: 'number', required: false },
    ],
    kind: 'builtin',
  },
  {
    name: 'create_event',
    description: 'Create a new event on the user\'s Google Calendar. Requires user confirmation.',
    parameters: [
      { name: 'title', description: 'Event title / summary', type: 'string', required: true },
      { name: 'start', description: 'Start date-time in ISO 8601 format, e.g. 2026-06-01T10:00:00', type: 'string', required: true },
      { name: 'end', description: 'End date-time in ISO 8601 format', type: 'string', required: true },
      { name: 'description', description: 'Optional event description', type: 'string', required: false },
      { name: 'location', description: 'Optional location', type: 'string', required: false },
    ],
    kind: 'builtin',
  },
];

// ── Token helper ───────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string | null> {
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch {
    return null;
  }
}

// ── Execution ──────────────────────────────────────────────────────────────

export async function executeCalendarTool(
  toolCallId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case 'list_events':
      return listEvents(toolCallId, args);
    case 'create_event':
      return prepareCreateEvent(toolCallId, args);
    default:
      return { toolCallId, name, output: `Unknown calendar tool: ${name}` };
  }
}

async function listEvents(
  toolCallId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) {
    return {
      toolCallId,
      name: 'list_events',
      output: 'Not signed in to Google, or calendar permission not granted. Please sign in via Settings and ensure calendar access is allowed.',
    };
  }

  const daysAhead = Number(args.days_ahead ?? 7);
  const maxResults = Number(args.max_results ?? 10);
  const now = new Date();
  const later = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const url = new URL(`${CALENDAR_BASE}/calendars/primary/events`);
  url.searchParams.set('timeMin', now.toISOString());
  url.searchParams.set('timeMax', later.toISOString());
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return {
        toolCallId,
        name: 'list_events',
        output: 'Calendar access denied. Add calendar scopes in Settings and re-sign in.',
      };
    }
    throw new Error(`Calendar API ${response.status}`);
  }

  const data = await response.json();
  const items: {
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    location?: string;
    description?: string;
  }[] = data.items ?? [];

  if (items.length === 0) {
    return { toolCallId, name: 'list_events', output: `No events in the next ${daysAhead} days.` };
  }

  const lines = items.map((e, i) => {
    const start = e.start?.dateTime ?? e.start?.date ?? 'Unknown time';
    const title = e.summary ?? 'Untitled';
    const loc = e.location ? ` @ ${e.location}` : '';
    return `${i + 1}. **${title}** — ${new Date(start).toLocaleString()}${loc}`;
  });

  return { toolCallId, name: 'list_events', output: lines.join('\n') };
}

function prepareCreateEvent(
  toolCallId: string,
  args: Record<string, unknown>,
): ToolResult {
  const title = String(args.title ?? '');
  const start = String(args.start ?? '');
  const end = String(args.end ?? '');

  if (!title || !start || !end) {
    return { toolCallId, name: 'create_event', output: 'Error: title, start, and end are required.' };
  }

  // Surface as a confirmation-required pending write
  // We encode the event data as a JSON string in pendingWrite.content
  const eventData = JSON.stringify({
    summary: title,
    start: { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    description: args.description ? String(args.description) : undefined,
    location: args.location ? String(args.location) : undefined,
  });

  return {
    toolCallId,
    name: 'create_event',
    output: `Ready to create calendar event "${title}" on ${start}. Awaiting confirmation.`,
    needsConfirmation: true,
    pendingWrite: { path: '__calendar__', content: eventData, action: 'create' },
  };
}

/**
 * Actually create a Google Calendar event after user confirmation.
 * Called by AgentClient after the user confirms.
 */
export async function executeConfirmedCalendarEvent(eventJson: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('No Google access token. Please sign in again.');

  const response = await fetch(`${CALENDAR_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: eventJson,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create calendar event: ${err}`);
  }
}
