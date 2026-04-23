import { useEffect, useMemo, useState } from 'react';
import type { AgentId, LeaderboardResponse } from './types';

/**
 * "What changed since your last visit" — stores a tiny aggregate snapshot
 * in localStorage each session, compares the current LeaderboardResponse
 * against the previous snapshot on load, and reports per-agent deltas.
 *
 * Only needs `{ id, settled, total_pnl }` per agent, so no raw-row query
 * is required. Snapshot is committed once the session has been "active"
 * for ACTIVE_COMMIT_MS, OR on pagehide — whichever fires first. This
 * makes quick bounces (<30s) not overwrite a useful prior snapshot.
 *
 * The `dismiss` action immediately commits a fresh snapshot so the strip
 * treats "I've seen this" as equivalent to "I'm leaving for the day".
 */

const STORAGE_KEY = 'gym:lastVisit';
const ACTIVE_COMMIT_MS = 30_000;

interface StoredAgent {
  id: AgentId;
  settled: number;
  total_pnl: number;
}

interface VisitSnapshot {
  timestamp: string;
  agents: StoredAgent[];
}

export interface AgentDelta {
  id: AgentId;
  name: string;
  newTrades: number;
  pnlDelta: number;
}

export interface VisitDelta {
  totalNewTrades: number;
  totalPnlDelta: number;
  daysSince: number;
  perAgent: AgentDelta[];
}

function readSnapshot(): VisitSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisitSnapshot;
    if (!parsed.timestamp || !Array.isArray(parsed.agents)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(data: LeaderboardResponse) {
  try {
    const snap: VisitSnapshot = {
      timestamp: new Date().toISOString(),
      agents: data.agents.map((a) => ({
        id: a.id,
        settled: a.record.settled,
        total_pnl: a.total_pnl,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // quota exceeded or storage disabled — fine
  }
}

export function useVisitDelta(
  data: LeaderboardResponse,
  source: 'live' | 'mock',
): { delta: VisitDelta | null; dismiss: () => void; dismissed: boolean } {
  const [prev, setPrev] = useState<VisitSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setPrev(readSnapshot());
  }, []);

  // Commit a fresh snapshot after 30s of active viewing, or on pagehide.
  // Only while on live data — we never want to persist mock numbers.
  useEffect(() => {
    if (source !== 'live') return;
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      writeSnapshot(data);
    };
    const t = window.setTimeout(commit, ACTIVE_COMMIT_MS);
    const onHide = () => commit();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pagehide', onHide);
    };
  }, [data, source]);

  const delta = useMemo<VisitDelta | null>(() => {
    if (!prev || dismissed) return null;
    const perAgent: AgentDelta[] = [];
    for (const a of data.agents) {
      const p = prev.agents.find((x) => x.id === a.id);
      if (!p) continue;
      const newTrades = a.record.settled - p.settled;
      if (newTrades <= 0) continue;
      perAgent.push({
        id: a.id,
        name: a.name,
        newTrades,
        pnlDelta: a.total_pnl - p.total_pnl,
      });
    }
    if (perAgent.length === 0) return null;

    const totalNewTrades = perAgent.reduce((s, a) => s + a.newTrades, 0);
    const totalPnlDelta = perAgent.reduce((s, a) => s + a.pnlDelta, 0);
    const daysSince =
      (Date.now() - new Date(prev.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    return { totalNewTrades, totalPnlDelta, daysSince, perAgent };
  }, [data, prev, dismissed]);

  const dismiss = () => {
    writeSnapshot(data);
    setDismissed(true);
  };

  return { delta, dismiss, dismissed };
}
