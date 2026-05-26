import { Compass, FlaskConical } from 'lucide-react';

interface Props {
  onStart: () => void;
  onOpenLab: () => void;
}

export function WorldIntroPanel({ onStart, onOpenLab }: Props) {
  return (
    <div className="world-v2-intro-panel">
      <div className="world-v2-intro-lede">
        <span>Public experiment</span>
        <p>
          This is the public lab for Brandon's trading agents.
        </p>
        <p>
          Each character is an autonomous agent trading delayed public markets. Click an agent to see performance,
          field notes, and trade replays.
        </p>
        <p>
          Use the flask for today's scoreboard. Use the TV for the latest video. Come back tomorrow to see what
          changed.
        </p>
      </div>

      <div className="world-v2-intro-actions">
        <button type="button" className="world-v2-intro-primary" onClick={onStart}>
          <Compass size={16} aria-hidden />
          <span>Start exploring</span>
        </button>
        <button type="button" className="world-v2-intro-secondary" onClick={onOpenLab}>
          <FlaskConical size={16} aria-hidden />
          <span>Open Public Lab</span>
        </button>
      </div>
    </div>
  );
}
