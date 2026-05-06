import { buildBattlePreview } from '@/lib/battleProjection';
import type { Agent } from '@/lib/types';
import { AgentAvatar } from '@/components/content/AgentAvatar';
import { TugOfWarBar } from './TugOfWarBar';

interface Props {
  agent: Agent;
  titleId?: string;
  now?: Date;
}

function formatClock(ts: string | null): string {
  if (!ts) return 'Unknown';
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatMinutesAgo(ts: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(ts).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h ago` : `${hours}h ${rem}m ago`;
}

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 36 - ((value - min) / range) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg className="battle-sparkline" viewBox="0 0 100 40" role="img" aria-label="Preview price path">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BattleArena({ agent, titleId, now = new Date() }: Props) {
  const open = agent.open_position;

  if (!open) {
    return (
      <section className="battle-arena" aria-label="No active battle">
        <p className="battle-kicker">Battle Arena</p>
        <h2 id={titleId} className="battle-title">No active battle</h2>
        <p className="battle-copy">
          {agent.name} is idle. Settled trades appear in the trade log after the 30-minute delay.
        </p>
      </section>
    );
  }

  const preview = buildBattlePreview(open, now);
  const entryPriceCents = open.entry_price_cents ?? 1;

  return (
    <section className="battle-arena" aria-label={`${agent.name} battle arena`}>
      <div className="battle-header">
        <p className="battle-kicker">Battle Arena</p>
        <h2 id={titleId} className="battle-title">{agent.name} is in battle</h2>
        <p className="battle-ticker">{open.contract_ticker}</p>
      </div>

      <div className="battle-stage">
        <div className="battle-combatant">
          <AgentAvatar id={agent.id} name={agent.name} spriteUrl={agent.sprite_url} size={54} />
          <span>{agent.name}</span>
        </div>
        <div className="battle-meter-stack">
          <TugOfWarBar
            entryPriceCents={entryPriceCents}
            currentPriceCents={preview.currentPriceCents}
            side={open.side}
          />
          <Sparkline values={preview.sparkline} />
        </div>
        <div className="battle-combatant battle-market">
          <span className="battle-market-icon" aria-hidden>?</span>
          <span>Market</span>
        </div>
      </div>

      <dl className="battle-grid">
        <div>
          <dt>Side</dt>
          <dd>{open.side.toUpperCase()}</dd>
        </div>
        <div>
          <dt>Entry</dt>
          <dd>{entryPriceCents}c</dd>
        </div>
        <div>
          <dt>Preview</dt>
          <dd>{preview.currentPriceCents}c</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{open.size}</dd>
        </div>
        <div>
          <dt>Entered</dt>
          <dd>{formatMinutesAgo(open.entered_at_delayed, now)}</dd>
        </div>
        <div>
          <dt>Settles</dt>
          <dd>{formatClock(open.settles_at)}</dd>
        </div>
      </dl>

      <p className="battle-copy">
        Entry details are shown after the 30-minute delay floor. Public market prices can update live
        once a Kalshi quote feed is connected; this build shows an entry-anchored preview, not a private live signal.
      </p>
    </section>
  );
}
