import type { Agent, PerformanceWindow } from '@/lib/types';
import type { AgentCardViewModel } from '@/lib/useAgentData';
import { MovePill } from './MovePill';
import { TradeLog } from './TradeLog';
import { TimeFilterPill } from './TimeFilterPill';
import { useSharedGaleWeather } from '@/lib/galeWeatherContext';
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
    <div
      className="mt-3 pt-3 border-t space-y-3 text-sm"
      style={{ borderColor: 'var(--color-border-default)' }}
    >
      <TimeFilterPill
        agentId={agent.id}
        agentName={agent.name}
        currentWindow={currentWindow}
        setWindow={setWindow}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Market
          </div>
          <div>{agent.market_label}</div>
        </div>
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Status
          </div>
          <div className="capitalize">
            {/* Delay policy §7.1: any surface implying live trade data
                must use "In Battle", not "Live", so the 30-min delay is
                consistent across every visible string. */}
            {agent.open_position
              ? 'In Battle'
              : agent.state === 'arriving_soon'
                ? 'Arriving soon'
                : 'Idle'}
          </div>
        </div>
      </div>

      {cardViewModel.record.settled > 0 && (
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Record
          </div>
          <div className="tabular-nums">
            {cardViewModel.record.W}W / {cardViewModel.record.L}L / {cardViewModel.record.BE}BE ·{' '}
            {cardViewModel.record.settled} settled
          </div>
        </div>
      )}

      {agent.brier_7d.n > 0 && (
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Brier · 7d
          </div>
          <div className="tabular-nums flex items-center gap-2">
            {agent.brier_7d.value.toFixed(3)}
            {agent.brier_7d.n < 20 && (
              <span
                className="px-2 py-0.5 text-[10px] rounded"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-border-default) 40%, transparent)',
                  color: 'var(--color-ink-muted)',
                }}
              >
                Low sample · n={agent.brier_7d.n}
              </span>
            )}
          </div>
        </div>
      )}

      {agent.id === 'gale' && weather && (
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Window
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-base" aria-hidden>
              {WEATHER_ICON[weather.condition]}
            </span>
            <span className="tabular-nums">
              {weather.label}{' '}
              <span style={{ color: 'var(--color-ink-muted)' }}>
                · {weather.temp_f}°F · {weather.condition}
              </span>
            </span>
            {weatherSource === 'fallback' && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-border-default) 50%, transparent)',
                  color: 'var(--color-ink-muted)',
                }}
                title="Live data temporarily unavailable; showing last-known fallback."
              >
                cached
              </span>
            )}
          </div>
        </div>
      )}

      {agent.cities_or_tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.cities_or_tags.map((t) => {
            const isActive = activeCity === t;
            return (
              <span
                key={t}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide"
                style={{
                  backgroundColor: isActive
                    ? `color-mix(in srgb, var(--color-${agent.id}) 22%, var(--color-paper-raised))`
                    : 'var(--color-paper-raised)',
                  color: isActive ? 'var(--color-ink)' : 'var(--color-ink-muted)',
                  outline: isActive
                    ? `1px solid color-mix(in srgb, var(--color-${agent.id}) 55%, transparent)`
                    : 'none',
                }}
                title={isActive ? 'Currently watching this city' : undefined}
              >
                {t}
              </span>
            );
          })}
        </div>
      )}

      {agent.moves.length > 0 && (
        <div className="flex flex-wrap gap-1">
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
