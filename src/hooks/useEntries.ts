import { useCallback, useEffect, useRef, useState } from 'react';
import { addEntry, deleteEntry, listEntries, searchEntries, updateEntry } from '@/services/db/EntryDB';
import type { Entry } from '@/services/db/EntryDB';

const PAGE = 40;

/** The entry list for the home screen, with debounced full-text search and paging. */
export function useEntries() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const endReachedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const requestRef = useRef(0); // ignore responses from superseded requests

  const reload = useCallback(async (q: string) => {
    const req = ++requestRef.current;
    try {
      const rows = q.trim() ? await searchEntries(q, 60) : await listEntries(PAGE);
      if (req !== requestRef.current) return;
      endReachedRef.current = !q.trim() && rows.length < PAGE;
      setEntries(rows);
      setError(null);
    } catch (e: any) {
      if (req === requestRef.current) setError(e?.message ?? 'Could not load entries.');
    } finally {
      if (req === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => reload(query), query ? 200 : 0);
    return () => clearTimeout(t);
  }, [query, reload]);

  const loadMore = useCallback(async () => {
    if (query.trim() || endReachedRef.current || loadingMoreRef.current || entries.length === 0) return;
    loadingMoreRef.current = true;
    try {
      const rows = await listEntries(PAGE, entries[entries.length - 1].createdAt);
      endReachedRef.current = rows.length < PAGE;
      setEntries((prev) => [...prev, ...rows]);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [entries, query]);

  const add = useCallback(async (text: string) => {
    const saved = await addEntry(text);
    if (saved) await reload(query);
    return saved;
  }, [query, reload]);

  const edit = useCallback(async (id: string, text: string) => {
    await updateEntry(id, text);
    await reload(query);
  }, [query, reload]);

  const remove = useCallback(async (id: string) => {
    await deleteEntry(id);
    await reload(query);
  }, [query, reload]);

  return { entries, query, setQuery, loading, error, loadMore, add, edit, remove };
}
