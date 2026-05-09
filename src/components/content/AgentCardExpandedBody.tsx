import type { ReactNode } from 'react';
import type { Agent, PerformanceWindow } from '@/lib/types';
import type { AgentCardViewModel } from '@/lib/useAgentData';
import { MovePill } from './MovePill';
import { TradeLog } from './TradeLog';
import { TimeFilterPill } from './TimeFilterPill';
import { useSharedGaleWeather } from '@/lib/galeWeatherContext-hooks';
import type { WeatherCondition } from '@/lib/useGaleWeather';

interface Props {
  agent: Agent;
  currentWindow: PerformanceWindow;
  setWindow: (w: PerformanceWindow) => void;
  cardViewModel: AgentCardViewModel;
}

/** Emoji per OpenWeather condition bucket — keeps the badge compact and
 *  gives users a glanceable cue that "this room has live weather." */
const WEATHER_ICON: Record<WeatherCondition, string> = {
  rain: '🌧️',
  storm: '⛈️',
  snow: '❄️',
  clouds: '☁️',
  mist: '🌫️',
  clear: '☀️',
};

function StatBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="agent-stat-block">
      <div className="agent-stat-label">{label}</div>
      <div className="agent-stat-value">{children}</div>
    </div>
  );
}

/**
 * Full detail body shown when an AgentCard is expanded. Layered blocks:
 *   1. TimeFilterPill (24h / 7d / Lifetime)
 *   2. Market + status grid
 *   3. Record (W/L/BE · N settled) — sourced from per-window cardViewModel
 *   4. Brier score + Low-sample badge when n < 20
 *   5. Cities / tags row
 *   6. Moves row (locked + unlocked pills)
 *   7. Unified TradeLog — replaces the prior single "Latest receipt" panel,
 *      shows up to 25 settled trades for the active window with a
 *      "Latest 25 of N" footer when the window has more.
 */
export function AgentCardExpandedBody({ agent, currentWindow, setWindow, cardViewModel }: Props) {
  const { current: weather, source: weatherSource } = useSharedGaleWeather();
  // Only mount the weather badge for Gale — she owns the weather market.
  // If the hook hasn't returned a snapshot yet (first 100ms) we fall back
  // to the city list. Once weather lands we highlight her active city.
  const activeCity = agent.id === 'gale' ? weather?.city ?? null : null;

  return (
    <div className="agent-detail-panel">
      <TimeFilterPill
        agentId={agent.id}
        agentName={agent.name}
        currentWindow={currentWindow}
        setWindow={setWindow}
      />

      <div className="agent-stat-grid">
        <StatBlock label="Market">{agent.market_label}</StatBlock>
        <StatBlock label="Status">
          <span className="capitalize">
            {/* Delay policy §7.1: any surface implying live trade data
                must use "In Battle", not "Live", so the 30-min delay is
                consistent across every visible string. */}
            {agent.open_position
              ? 'In Battle'
              : agent.state === 'arriving_soon'
                ? 'Arriving soon'
                : 'Idle'}
          </span>
        </StatBlock>

        {cardViewModel.record.settled > 0 && (
          <StatBlock label="Record">
            <span className="tabular-nums">
              {cardViewModel.record.W}W / {cardViewModel.record.L}L / {cardViewModel.record.BE}BE ·{' '}
              {cardViewModel.record.settled} settled
            </span>
          </StatBlock>
        )}

        {agent.brier_7d.n > 0 && (
          <StatBlock label="Brier · 7d">
            <span className="agent-stat-inline tabular-nums">
              {agent.brier_7d.value.toFixed(3)}
              {agent.brier_7d.n < 20 && (
                <span className="agent-badge">
                  Low sample · n={agent.brier_7d.n}
                </span>
              )}
            </span>
          </StatBlock>
        )}

        {agent.id === 'gale' && weather && (
          <StatBlock label="Window">
            <span className="agent-stat-inline">
              <span className="agent-weather-icon" aria-hidden>
                {WEATHER_ICON[weather.condition]}
              </span>
              <span className="tabular-nums">
                {weather.label}{' '}
                <span className="agent-muted">
                  · {weather.temp_f}°F · {weather.condition}
                </span>
              </span>
              {weatherSource === 'fallback' && (
                <span
                  className="agent-badge"
                  title="Live data temporarily unavailable; showing last-known fallback."
                >
                  cached
                </span>
              )}
            </span>
          </StatBlock>
        )}
      </div>

      {agent.cities_or_tags.length > 0 && (
        <div className="agent-tags">
          {agent.cities_or_tags.map((t) => {
            const isActive = activeCity === t;
            return (
              <span
                key={t}
                className={`agent-tag${isActive ? ' agent-tag--active' : ''}`}
                title={isActive ? 'Currently watching this city' : undefined}
              >
                {t}
              </span>
            );
          })}
        </div>
      )}

      {agent.moves.length > 0 && (
        <div className="agent-moves">
          {agent.moves.map((m, i) => (
            <MovePill key={i} move={m} />
          ))}
        </div>
      )}

      <TradeLog
        rows={cardViewModel.tradeLog}
        windowSettledCount={cardViewModel.windowSettledCount}
        window={currentWindow}
        hasOpenPosition={agent.open_position !== null}
      />
    </div>
  );
}
