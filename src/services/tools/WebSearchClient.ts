/**
 * WebSearchClient — factory-pattern web search adapters (Tavily, Google Custom Search).
 * The active provider and API keys are stored in SecureStore and loaded at runtime.
 * To add a new provider: implement WebSearchAdapter, call WebSearchAdapterFactory.register().
 */

import type { ToolDefinition, ToolResult, WebSearchProvider } from '@/types';
import { getGeminiKey } from '@/services/llm/LLMClient';
import * as SecureStore from 'expo-secure-store';

// ── Adapter interface ──────────────────────────────────────────────────────

export interface WebSearchAdapter {
  search(toolCallId: string, query: string, maxResults: number): Promise<ToolResult>;
}

// ── Factory ────────────────────────────────────────────────────────────────

export class WebSearchAdapterFactory {
  private static readonly registry = new Map<WebSearchProvider, WebSearchAdapter>();

  static register(provider: WebSearchProvider, adapter: WebSearchAdapter): void {
    this.registry.set(provider, adapter);
  }

  static get(provider: WebSearchProvider): WebSearchAdapter {
    const adapter = this.registry.get(provider);
    if (!adapter) throw new Error(`No web search adapter registered for provider: ${provider}`);
    return adapter;
  }
}

// ── SecureStore keys ───────────────────────────────────────────────────────

const PROVIDER_KEY = 'web_search_provider';
const TAVILY_KEY_STORE = 'tavily_api_key';
const GOOGLE_CX_STORE = 'google_search_cx';

// ── Module-level state ─────────────────────────────────────────────────────

let activeProvider: WebSearchProvider = 'tavily';
let tavilyKey = '';
let googleCx = '';

export function setWebSearchProvider(p: WebSearchProvider) { activeProvider = p; }
export function getWebSearchProvider(): WebSearchProvider { return activeProvider; }
export function setTavilyKey(k: string) { tavilyKey = k; }
export function setGoogleCx(cx: string) { googleCx = cx; }

// ── Config management ──────────────────────────────────────────────────────

export async function loadWebSearchConfig(): Promise<void> {
  const provider = await SecureStore.getItemAsync(PROVIDER_KEY);
  const tKey = await SecureStore.getItemAsync(TAVILY_KEY_STORE);
  const gCx = await SecureStore.getItemAsync(GOOGLE_CX_STORE);
  if (provider) activeProvider = provider as WebSearchProvider;
  if (tKey) tavilyKey = tKey;
  if (gCx) googleCx = gCx;
}

export async function saveWebSearchProvider(p: WebSearchProvider): Promise<void> {
  activeProvider = p;
  await SecureStore.setItemAsync(PROVIDER_KEY, p);
}

export async function saveTavilyKey(k: string): Promise<void> {
  tavilyKey = k;
  await SecureStore.setItemAsync(TAVILY_KEY_STORE, k);
}

export async function saveGoogleCx(cx: string): Promise<void> {
  googleCx = cx;
  await SecureStore.setItemAsync(GOOGLE_CX_STORE, cx);
}

export async function loadStoredWebSearchKeys(): Promise<{
  tavilyKey: string;
  googleCx: string;
  provider: WebSearchProvider;
}> {
  return {
    tavilyKey: (await SecureStore.getItemAsync(TAVILY_KEY_STORE)) ?? '',
    googleCx: (await SecureStore.getItemAsync(GOOGLE_CX_STORE)) ?? '',
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
    return await WebSearchAdapterFactory.get(activeProvider).search(toolCallId, query, maxResults);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { toolCallId, name: 'web_search', output: `Web search failed: ${msg}` };
  }
}

// ── Tavily adapter ─────────────────────────────────────────────────────────

class TavilyAdapter implements WebSearchAdapter {
  async search(toolCallId: string, query: string, maxResults: number): Promise<ToolResult> {
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

    if (!response.ok) throw new Error(`Tavily ${response.status}`);

    const data = await response.json();
    const lines: string[] = [];
    if (data.answer) lines.push(`**Summary:** ${data.answer}\n`);

    const results: { title: string; url: string; content: string }[] = data.results ?? [];
    results.slice(0, maxResults).forEach((r, i) => {
      lines.push(`${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content?.slice(0, 200) ?? ''}`);
    });

    return { toolCallId, name: 'web_search', output: lines.join('\n') || 'No results found.' };
  }
}

// ── Google Custom Search adapter ───────────────────────────────────────────

class GoogleSearchAdapter implements WebSearchAdapter {
  async search(toolCallId: string, query: string, maxResults: number): Promise<ToolResult> {
    // Reuse the Gemini API key — it's the same Google Cloud key
    const apiKey = getGeminiKey();
    if (!apiKey) {
      return { toolCallId, name: 'web_search', output: 'Google API key not configured. Add your Gemini API key in Settings → AI Model.' };
    }
    if (!googleCx) {
      return { toolCallId, name: 'web_search', output: 'Google Search Engine ID (cx) not configured. Add it in Settings → Web Search.' };
    }

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', googleCx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(Math.min(maxResults, 10)));

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 429) throw new Error('Google Search daily quota exceeded (100 queries/day free).');
      if (response.status === 403) throw new Error('Google Search API key invalid or quota exceeded. Check your key in Settings.');
      throw new Error(`Google Search ${response.status}`);
    }

    const data = await response.json();
    const items: { title: string; link: string; snippet: string }[] = data.items ?? [];

    if (items.length === 0) {
      return { toolCallId, name: 'web_search', output: 'No results found.' };
    }

    const lines = items.slice(0, maxResults).map((r, i) =>
      `${i + 1}. **${r.title}**\n   ${r.link}\n   ${r.snippet?.slice(0, 200) ?? ''}`,
    );

    return { toolCallId, name: 'web_search', output: lines.join('\n') };
  }
}

// ── Register all adapters ──────────────────────────────────────────────────

WebSearchAdapterFactory.register('tavily', new TavilyAdapter());
WebSearchAdapterFactory.register('google', new GoogleSearchAdapter());
