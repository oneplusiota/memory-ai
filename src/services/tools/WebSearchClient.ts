/**
 * WebSearchClient — Tavily and Brave Search adapters.
 * The active provider and API key are stored in SecureStore and loaded at runtime.
 */

import type { ToolDefinition, ToolResult, WebSearchProvider } from '@/types';
import * as SecureStore from 'expo-secure-store';

const PROVIDER_KEY = 'web_search_provider';
const TAVILY_KEY_STORE = 'tavily_api_key';
const BRAVE_KEY_STORE = 'brave_api_key';

let activeProvider: WebSearchProvider = 'tavily';
let tavilyKey = '';
let braveKey = '';

// ── Config management ──────────────────────────────────────────────────────

export function setWebSearchProvider(p: WebSearchProvider) { activeProvider = p; }
export function getWebSearchProvider(): WebSearchProvider { return activeProvider; }
export function setTavilyKey(k: string) { tavilyKey = k; }
export function setBraveKey(k: string) { braveKey = k; }

export async function loadWebSearchConfig(): Promise<void> {
  const provider = await SecureStore.getItemAsync(PROVIDER_KEY);
  const tKey = await SecureStore.getItemAsync(TAVILY_KEY_STORE);
  const bKey = await SecureStore.getItemAsync(BRAVE_KEY_STORE);
  if (provider) activeProvider = provider as WebSearchProvider;
  if (tKey) tavilyKey = tKey;
  if (bKey) braveKey = bKey;
}

export async function saveWebSearchProvider(p: WebSearchProvider): Promise<void> {
  activeProvider = p;
  await SecureStore.setItemAsync(PROVIDER_KEY, p);
}

export async function saveTavilyKey(k: string): Promise<void> {
  tavilyKey = k;
  await SecureStore.setItemAsync(TAVILY_KEY_STORE, k);
}

export async function saveBraveKey(k: string): Promise<void> {
  braveKey = k;
  await SecureStore.setItemAsync(BRAVE_KEY_STORE, k);
}

export async function loadStoredWebSearchKeys(): Promise<{
  tavilyKey: string;
  braveKey: string;
  provider: WebSearchProvider;
}> {
  return {
    tavilyKey: (await SecureStore.getItemAsync(TAVILY_KEY_STORE)) ?? '',
    braveKey: (await SecureStore.getItemAsync(BRAVE_KEY_STORE)) ?? '',
    provider: ((await SecureStore.getItemAsync(PROVIDER_KEY)) ?? 'tavily') as WebSearchProvider,
  };
}

// ── Tool definition ────────────────────────────────────────────────────────

export const WEB_SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for up-to-date information on a topic. Use this when the user asks about current events, facts not in the vault, or external information.',
  parameters: [
    { name: 'query', description: 'The search query', type: 'string', required: true },
    { name: 'max_results', description: 'Maximum number of results to return (default 5)', type: 'number', required: false },
  ],
  kind: 'builtin',
};

// ── Execution ──────────────────────────────────────────────────────────────

export async function executeWebSearch(
  toolCallId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const query = String(args.query ?? '');
  const maxResults = Number(args.max_results ?? 5);

  if (!query) {
    return { toolCallId, name: 'web_search', output: 'Error: query is required.' };
  }

  try {
    if (activeProvider === 'tavily') {
      return await searchTavily(toolCallId, query, maxResults);
    }
    return await searchBrave(toolCallId, query, maxResults);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { toolCallId, name: 'web_search', output: `Web search failed: ${msg}` };
  }
}

async function searchTavily(
  toolCallId: string,
  query: string,
  maxResults: number,
): Promise<ToolResult> {
  if (!tavilyKey) {
    return { toolCallId, name: 'web_search', output: 'Tavily API key not configured. Add it in Settings → Web Search.' };
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily ${response.status}`);
  }

  const data = await response.json();

  const lines: string[] = [];
  if (data.answer) lines.push(`**Summary:** ${data.answer}\n`);

  const results: { title: string; url: string; content: string }[] = data.results ?? [];
  results.slice(0, maxResults).forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content?.slice(0, 200) ?? ''}`);
  });

  return { toolCallId, name: 'web_search', output: lines.join('\n') || 'No results found.' };
}

async function searchBrave(
  toolCallId: string,
  query: string,
  maxResults: number,
): Promise<ToolResult> {
  if (!braveKey) {
    return { toolCallId, name: 'web_search', output: 'Brave Search API key not configured. Add it in Settings → Web Search.' };
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(maxResults));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': braveKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search ${response.status}`);
  }

  const data = await response.json();
  const results: { title: string; url: string; description: string }[] =
    data.web?.results ?? [];

  if (results.length === 0) {
    return { toolCallId, name: 'web_search', output: 'No results found.' };
  }

  const lines = results.slice(0, maxResults).map((r, i) =>
    `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description?.slice(0, 200) ?? ''}`,
  );

  return { toolCallId, name: 'web_search', output: lines.join('\n') };
}
