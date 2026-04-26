import { useState } from 'react';
import type { AgentId, PerformanceWindow } from './types';

const VALID_WINDOWS: ReadonlyArray<PerformanceWindow> = ['24h', '7d', 'lifetime'];

function readStored(key: string): PerformanceWindow {
  try {
    if (typeof localStorage === 'undefined') return '24h';
    const raw = localStorage.getItem(key);
    return VALID_WINDOWS.includes(raw as PerformanceWindow)
      ? (raw as PerformanceWindow)
      : '24h';
  } catch {
    return '24h';
  }
}

export function useAgentWindow(
  agentId: AgentId,
): [PerformanceWindow, (w: PerformanceWindow) => void] {
  const key = `gym:track-b:window:${agentId}`;
  const [window, setWindowState] = useState<PerformanceWindow>(() => readStored(key));
  const setWindow = (w: PerformanceWindow) => {
    setWindowState(w);
    try {
      localStorage.setItem(key, w);
    } catch {
      /* private mode / blocked storage — state still updates in-memory */
    }
  };
  return [window, setWindow];
}
