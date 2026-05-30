/**
 * WebSearchClient — factory-pattern web search adapters (Tavily, Serper.dev).
 * The active provider and API keys are stored in SecureStore and loaded at runtime.
 * To add a new provider: implement WebSearchAdapter, call WebSearchAdapterFactory.register().
 */

import type { ToolDefinition, ToolResult, WebSearchProvider } from '@/types';
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
const SERPER_KEY_STORE = 'serper_api_key';

// ── Module-level state ─────────────────────────────────────────────────────

let activeProvider: WebSearchProvider = 'tavily';
let tavilyKey = '';
let serperKey = '';

export function setWebSearchProvider(p: WebSearchProvider) { activeProvider = p; }
export function getWebSearchProvider(): WebSearchProvider { return activeProvider; }
export function setTavilyKey(k: string) { tavilyKey = k; }
export function setSerperKey(k: string) { serperKey = k; }

// ── Config management ──────────────────────────────────────────────────────

export async function loadWebSearchConfig(): Promise<void> {
  const provider = await SecureStore.getItemAsync(PROVIDER_KEY);
  const tKey = await SecureStore.getItemAsync(TAVILY_KEY_STORE);
  const sKey = await SecureStore.getItemAsync(SERPER_KEY_STORE);
  if (provider) activeProvider = provider as WebSearchProvider;
  if (tKey) tavilyKey = tKey;
  if (sKey) serperKey = sKey;
}

export async function saveWebSearchProvider(p: WebSearchProvider): Promise<void> {
  activeProvider = p;
  await SecureStore.setItemAsync(PROVIDER_KEY, p);
}

export async function saveTavilyKey(k: string): Promise<void> {
  tavilyKey = k;
  await SecureStore.setItemAsync(TAVILY_KEY_STORE, k);
}

export async function saveSerperKey(k: string): Promise<void> {
  serperKey = k;
  await SecureStore.setItemAsync(SERPER_KEY_STORE, k);
}

export async function loadStoredWebSearchKeys(): Promise<{
  tavilyKey: string;
  serperKey: string;
  provider: WebSearchProvider;
}> {
  return {
    tavilyKey: (await SecureStore.getItemAsync(TAVILY_KEY_STORE)) ?? '',
    serperKey: (await SecureStore.getItemAsync(SERPER_KEY_STORE)) ?? '',
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

// ── Serper.dev adapter ────────────────────────────────────────────────────
// Real Google results — 2,500 free queries/month, single API key, no cx needed.

class SerperAdapter implements WebSearchAdapter {
  async search(toolCallId: string, query: string, maxResults: number): Promise<ToolResult> {
    if (!serperKey) {
      return { toolCallId, name: 'web_search', output: 'Serper API key not configured. Add it in Settings → Web Search.' };
    }

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': serperKey,
      },
      body: JSON.stringify({ q: query, num: Math.min(maxResults, 10) }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('Serper quota exceeded. Upgrade at serper.dev or try again tomorrow.');
      if (response.status === 401 || response.status === 403) throw new Error('Serper API key invalid. Check your key in Settings → Web Search.');
      throw new Error(`Serper ${response.status}`);
    }

    const data = await response.json();
    const lines: string[] = [];

    // Answer box — shown for factual queries
    if (data.answerBox?.answer) {
      lines.push(`**Answer:** ${data.answerBox.answer}\n`);
    } else if (data.answerBox?.snippet) {
      lines.push(`**Answer:** ${data.answerBox.snippet}\n`);
    }

    // Organic results
    const organic: { title: string; link: string; snippet: string }[] = data.organic ?? [];
    organic.slice(0, maxResults).forEach((r, i) => {
      lines.push(`${i + 1}. **${r.title}**\n   ${r.link}\n   ${r.snippet?.slice(0, 200) ?? ''}`);
    });

    return { toolCallId, name: 'web_search', output: lines.join('\n') || 'No results found.' };
  }
}

// ── Register all adapters ──────────────────────────────────────────────────

WebSearchAdapterFactory.register('tavily', new TavilyAdapter());
WebSearchAdapterFactory.register('serper', new SerperAdapter());
