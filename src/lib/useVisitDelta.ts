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
const IDLE_COMMIT_MS = 5 * 60_000;

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
  awayMs: number;
  lastSeenAt: string;
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
  const [prev, setPrev] = useState<VisitSnapshot | null>(() => readSnapshot());
  const [dismissed, setDismissed] = useState(false);
  const [compareNow, setCompareNow] = useState<number>(() => Date.now());

  // Commit a fresh snapshot after 30s only when there is no unseen delta.
  // Departure and idle commits happen below, so return visits compare against
  // the moment the user actually left or stopped paying attention.
  useEffect(() => {
    if (source !== 'live' || prev) return;
    const commit = () => {
      writeSnapshot(data);
      setPrev(readSnapshot());
    };
    const t = window.setTimeout(commit, ACTIVE_COMMIT_MS);
    return () => {
      window.clearTimeout(t);
    };
  }, [data, prev, source]);

  // Save the current snapshot when the user leaves, hides the tab, blurs the
  // window, or goes idle. When they come back or become active again, refresh
  // the previous snapshot so new settled trades can trigger the strip.
  useEffect(() => {
    if (source !== 'live') return;

    let idle = false;
    let idleTimer = window.setTimeout(() => {
      idle = true;
      writeSnapshot(data);
      setPrev(readSnapshot());
    }, IDLE_COMMIT_MS);

    const resetIdleTimer = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        idle = true;
        writeSnapshot(data);
        setPrev(readSnapshot());
      }, IDLE_COMMIT_MS);
    };

    const commitDeparture = () => {
      writeSnapshot(data);
      setPrev(readSnapshot());
      setDismissed(false);
    };

    const refreshReturn = () => {
      if (!idle && document.visibilityState !== 'visible') return;
      setCompareNow(Date.now());
      setPrev(readSnapshot());
      setDismissed(false);
      idle = false;
      resetIdleTimer();
    };

    const onActivity = () => {
      if (idle) refreshReturn();
      resetIdleTimer();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') commitDeparture();
      if (document.visibilityState === 'visible') refreshReturn();
    };

    window.addEventListener('pagehide', commitDeparture);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', commitDeparture);
    window.addEventListener('focus', refreshReturn);
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('scroll', onActivity, { passive: true });

    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener('pagehide', commitDeparture);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', commitDeparture);
      window.removeEventListener('focus', refreshReturn);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('scroll', onActivity);
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
      (compareNow - new Date(prev.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    const awayMs = Math.max(0, compareNow - new Date(prev.timestamp).getTime());
    return { totalNewTrades, totalPnlDelta, daysSince, awayMs, lastSeenAt: prev.timestamp, perAgent };
  }, [data, prev, dismissed, compareNow]);

  const dismiss = () => {
    writeSnapshot(data);
    setDismissed(true);
  };

  return { delta, dismiss, dismissed };
}
