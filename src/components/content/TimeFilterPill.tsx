import type { AgentId, PerformanceWindow } from '@/lib/types';

interface Props {
  agentId: AgentId;
  agentName: string;
  currentWindow: PerformanceWindow;
  setWindow: (w: PerformanceWindow) => void;
}

const WINDOWS: ReadonlyArray<PerformanceWindow> = ['24h', '7d', 'lifetime'];

const LABELS: Record<PerformanceWindow, string> = {
  '24h': '24h',
  '7d': '7d',
  lifetime: 'Lifetime',
};

/**
 * Native radio-input segmented control. Free keyboard nav (arrow keys to cycle,
 * Tab to leave the group), free aria-checked, free form semantics. CSS hides
 * the radio circle and styles the <label>'s child <span> as the segment.
 */
export function TimeFilterPill({ agentId, agentName, currentWindow, setWindow }: Props) {
  return (
    <fieldset
      className="time-filter-pill"
      style={{
        ['--agent-accent' as string]: `var(--color-${agentId})`,
      }}
      aria-label="Time window"
    >
      <legend className="sr-only">Time window for {agentName}'s stats and trade log</legend>
      {WINDOWS.map((w) => (
        <label
          key={w}
          className={`time-filter-pill__option${
            currentWindow === w ? ' time-filter-pill__option--active' : ''
          }`}
        >
          <input
            type="radio"
            name={`window-${agentId}`}
            value={w}
            checked={currentWindow === w}
            onChange={() => setWindow(w)}
            className="sr-only"
          />
          <span>{LABELS[w]}</span>
        </label>
      ))}
    </fieldset>
  );
}
