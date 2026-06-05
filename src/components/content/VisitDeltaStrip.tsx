import { motion, AnimatePresence } from 'framer-motion';
import type { VisitDelta } from '@/lib/useVisitDelta';
import { formatPnl } from '@/lib/formatting';
import { SOCIAL_LINKS, trackPublicLabEvent } from '@/lib/publicLab';

/**
 * "Since your last visit" strip. Renders above the agent cards when the
 * user returns and new trades have settled since their prior session.
 * Null-safe — caller passes `delta = null` during first-ever visit, when
 * nothing has changed, or after dismissal.
 *
 * Paper pill so it reads on any world mode; dismissible X commits a new
 * snapshot so the strip stays away until more trades land.
 */

function timeAgo(days: number): string {
  if (days < 1 / 24) return 'just now';
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}h ago`;
  }
  const rounded = Math.round(days);
  return `${rounded} day${rounded === 1 ? '' : 's'} ago`;
}

export function VisitDeltaStrip({
  delta,
  onDismiss,
}: {
  delta: VisitDelta | null;
  onDismiss: () => void;
}) {
  const primary = SOCIAL_LINKS.find((link) => link.id === 'tiktok') ?? SOCIAL_LINKS[0];

  return (
    <AnimatePresence>
      {delta && (
        <motion.aside
          key="visit-delta"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="rounded-xl border px-3 py-2 text-[12px] grid gap-2"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-paper) 88%, transparent)',
            borderColor: 'var(--color-border-default)',
            color: 'var(--color-ink)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="font-medium">
                Since you were last here: {delta.totalNewTrades} new settled trade
                {delta.totalNewTrades === 1 ? '' : 's'} · account {formatPnl(delta.totalPnlDelta)}
              <span style={{ color: 'var(--color-ink-muted)' }}>
                {' '}· away {timeAgo(delta.daysSince)}
              </span>
              </div>
              <div
                className="mt-0.5 tabular-nums"
                style={{ color: 'var(--color-ink-muted)' }}
              >
                {delta.perAgent.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && <span> · </span>}
                    <span style={{ color: 'var(--color-ink)' }}>{a.name}</span>{' '}
                    <span
                      style={{
                        color:
                          a.pnlDelta > 0
                            ? 'var(--color-gain)'
                            : a.pnlDelta < 0
                            ? 'var(--color-loss)'
                            : 'var(--color-ink-muted)',
                      }}
                    >
                      {formatPnl(a.pnlDelta)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 px-1.5 py-0.5 rounded-md text-base leading-none"
              style={{
                color: 'var(--color-ink-muted)',
                backgroundColor: 'transparent',
              }}
            >
              ×
            </button>
          </div>
          <a
            href={primary.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 font-semibold no-underline"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-gain) 18%, var(--color-paper-raised))',
              color: 'var(--color-ink)',
            }}
            onClick={() => trackPublicLabEvent('follow_click', {
              surface: 'visit_delta_strip',
              platform: primary.id,
              destination: primary.href,
            })}
          >
            Down about 35% - follow @brandonnfongg
          </a>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
