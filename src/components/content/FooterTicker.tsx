import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LeaderboardResponse } from '@/lib/types';
import { formatPnl, formatWinRate } from '@/lib/formatting';

/**
 * Kinetic footer carousel replacing the three static bet-count pills. Rotates
 * every 5 seconds through aggregate metrics so the bottom of the page keeps
 * signaling "this thing is live" even when the agent cards are static.
 *
 * Items are built from the same `LeaderboardResponse` that App uses, so the
 * ticker refreshes automatically when live data lands. Pauses on hover —
 * respects prefers-reduced-motion via the global transition-zeroing rule in
 * globals.css.
 *
 * If fewer than two items have data yet (early launch / empty agents), the
 * ticker renders statically without rotating — avoids a single-item
 * oscillator.
 */

const ROTATION_MS = 5000;

interface TickerItem {
  key: string;
  label: string;
  value: string;
  color?: string;
}

function buildItems(data: LeaderboardResponse): TickerItem[] {
  const agents = data.agents.filter((a) => a.state !== 'arriving_soon');
  const totalSettled = agents.reduce((s, a) => s + a.record.settled, 0);
  const totalPnl = agents.reduce((s, a) => s + a.total_pnl, 0);
  const totalW = agents.reduce((s, a) => s + a.record.W, 0);
  const totalL = agents.reduce((s, a) => s + a.record.L, 0);

  const latestAgent = agents
    .filter((a) => a.latest_receipt)
    .sort(
      (a, b) =>
        new Date(b.latest_receipt!.settled_at).getTime() -
        new Date(a.latest_receipt!.settled_at).getTime(),
    )[0];

  const items: TickerItem[] = [
    { key: 'settled', label: 'Trades settled', value: `${totalSettled}` },
    {
      key: 'pnl',
      label: 'Net P&L',
      value: formatPnl(totalPnl),
      color: totalPnl >= 0 ? 'var(--color-gain)' : 'var(--color-loss)',
    },
  ];

  if (totalW + totalL > 0) {
    items.push({
      key: 'wr',
      label: 'Lifetime WR',
      value: formatWinRate(totalW, totalW + totalL),
    });
  }

  if (latestAgent?.latest_receipt) {
    const r = latestAgent.latest_receipt;
    const tag = r.pnl > 0 ? 'W' : r.pnl < 0 ? 'L' : 'BE';
    items.push({
      key: 'last',
      label: 'Last',
      value: `${latestAgent.name} ${tag} ${formatPnl(r.pnl)}`,
      color:
        r.pnl > 0 ? 'var(--color-gain)' : r.pnl < 0 ? 'var(--color-loss)' : 'var(--color-ink)',
    });
  }

  return items;
}

export function FooterTicker({ data }: { data: LeaderboardResponse }) {
  const items = useMemo(() => buildItems(data), [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % items.length),
      ROTATION_MS,
    );
    return () => window.clearInterval(id);
  }, [paused, items.length]);

  if (items.length === 0) return null;
  const item = items[Math.min(index, items.length - 1)];

  return (
    <footer
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="mt-6 px-4 py-3 rounded-xl border text-center text-[13px]"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-paper) 82%, transparent)',
        borderColor: 'var(--color-border-default)',
        color: 'var(--color-ink)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      aria-live="polite"
    >
      <div className="h-5 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="tabular-nums"
          >
            <span style={{ color: 'var(--color-ink-muted)' }}>{item.label}: </span>
            <span style={{ color: item.color ?? 'var(--color-ink)', fontWeight: 500 }}>
              {item.value}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      {items.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {items.map((it, i) => (
            <span
              key={it.key}
              className="inline-block w-1 h-1 rounded-full"
              style={{
                backgroundColor: 'var(--color-ink)',
                opacity: i === index ? 0.85 : 0.25,
                transition: 'opacity 200ms',
              }}
            />
          ))}
        </div>
      )}
    </footer>
  );
}
