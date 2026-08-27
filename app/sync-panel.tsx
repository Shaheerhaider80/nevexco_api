'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';

interface State {
  totals: { reported: number; synced: number; categories: number; departments: number };
  pagesSynced: number;
  nextOffset: number | null;
  lastSyncedAt: string | null;
}

interface SyncResult {
  fetched: number;
  added: number;
  newCategories: number;
  offset: number;
  ms: number;
  nextOffset: number | null;
}

/**
 * Catalog sync control.
 *
 * Novexco has no category endpoint, so categories are discovered by paging the
 * catalog: each page contributes any category codes not already seen.
 */
export function SyncPanel() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [last, setLast] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/catalog/state', { cache: 'no-store' });
    if (res.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    // Inlined rather than calling refresh(), so the effect body performs no
    // synchronous state update.
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/catalog/state', { cache: 'no-store' });
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) setState(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncOnce = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/catalog/sync?take=250', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.fault?.faultstring ?? data?.error ?? 'Sync failed');
        setAuto(false);
        return null;
      }
      setLast(data);
      await refresh();
      router.refresh();
      return data as SyncResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      setAuto(false);
      return null;
    } finally {
      setBusy(false);
    }
  }, [refresh, router]);

  // Auto mode keeps pulling pages until the catalog is complete or it errors.
  // Stopping is decided inside syncOnce, so this effect only ever schedules.
  useEffect(() => {
    if (!auto || busy || state?.nextOffset === null) return;
    const timer = setTimeout(() => {
      void syncOnce().then((data) => {
        if (data && data.nextOffset === null) setAuto(false);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [auto, busy, state?.nextOffset, syncOnce]);

  const reset = async () => {
    if (!confirm('Clear the local catalog cache? Nothing at Novexco is affected.')) return;
    setAuto(false);
    await fetch('/api/catalog/state', { method: 'DELETE' });
    setLast(null);
    await refresh();
    router.refresh();
  };

  const totals = state?.totals;
  const pct =
    totals && totals.reported > 0
      ? Math.min(100, (totals.synced / totals.reported) * 100)
      : 0;

  return (
    <Card
      title="Catalog sync"
      subtitle="Each page fetches 250 products and adds any newly seen categories."
      right={
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => void syncOnce()} disabled={busy || auto}>
            {busy ? 'Syncing…' : 'Sync one page'}
          </button>
          <button
            className="btn"
            onClick={() => setAuto((v) => !v)}
            disabled={busy && !auto}
          >
            {auto ? 'Stop auto-sync' : 'Auto-sync all'}
          </button>
          <button className="btn" onClick={() => void reset()} disabled={busy || auto}>
            Reset
          </button>
        </div>
      }
    >
      <div
        className="h-2 rounded-full overflow-hidden mb-3"
        style={{ background: 'var(--surface-2)' }}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: 'var(--accent)' }}
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center text-[13px]">
        <span className="chip">
          {totals ? `${totals.synced.toLocaleString()} / ${totals.reported.toLocaleString()} products` : 'loading…'}
        </span>
        <span className="chip">{totals?.categories ?? 0} categories</span>
        <span className="chip">{totals?.departments ?? 0} departments</span>
        <span className="chip">{state?.pagesSynced ?? 0} pages</span>
        {state?.nextOffset === null && totals && totals.synced > 0 && (
          <span className="chip chip-ok">catalog complete</span>
        )}
      </div>

      {last && (
        <p className="dim text-[12px] mt-3">
          Last page: offset {last.offset.toLocaleString()} · {last.fetched} fetched ·{' '}
          {last.added} new products · {last.newCategories} new categories ·{' '}
          {(last.ms / 1000).toFixed(1)}s
        </p>
      )}

      {error && (
        <div
          className="rounded-lg p-3 mt-3 text-[13px]"
          style={{ background: 'var(--err-bg)', color: 'var(--err)' }}
        >
          {error}
        </div>
      )}

      {auto && (
        <p className="dim text-[12px] mt-2">
          Auto-sync runs page by page. A full catalog takes roughly 88 pages — leave
          this tab open, or stop any time; progress is saved after every page.
        </p>
      )}
    </Card>
  );
}
