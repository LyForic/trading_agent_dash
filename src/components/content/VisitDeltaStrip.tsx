import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState, type PointerEvent } from 'react';
import type { VisitDelta } from '@/lib/useVisitDelta';
import { formatPnl } from '@/lib/formatting';
import { SOCIAL_LINKS, trackPublicLabEvent } from '@/lib/publicLab';

/**
 * "Since your last visit" strip. Renders above the agent cards when the
 * user returns and new trades have settled since their prior session.
 * Null-safe — caller passes `delta = null` during first-ever visit, when
 * nothing has changed, or after dismissal.
 *
 * iOS-style notification. Desktop keeps a dismiss button; mobile dismisses
 * with the same upward swipe pattern as the agent sheet.
 */

function timeAgo(days: number): string {
  if (days < 1 / (24 * 60)) return 'just now';
  if (days < 1 / 24) {
    const minutes = Math.max(1, Math.round(days * 24 * 60));
    return `${minutes} min ago`;
  }
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }
  const rounded = Math.round(days);
  return `${rounded} day${rounded === 1 ? '' : 's'} ago`;
}

function pnlTone(value: number) {
  if (value > 0) return 'visit-delta-notification__pnl visit-delta-notification__pnl--gain';
  if (value < 0) return 'visit-delta-notification__pnl visit-delta-notification__pnl--loss';
  return 'visit-delta-notification__pnl';
}

function tradeCountLabel(count: number) {
  return `${count} trade${count === 1 ? '' : 's'}`;
}

export function VisitDeltaStrip({
  delta,
  onDismiss,
  allTimePct = null,
}: {
  delta: VisitDelta | null;
  onDismiss: () => void;
  allTimePct?: number | null;
}) {
  const primary = SOCIAL_LINKS.find((link) => link.id === 'tiktok') ?? SOCIAL_LINKS[0];
  const followCopy = allTimePct === null
    ? 'Watch the real $10k account, one lesson a day. follow @brandonnfongg'
    : allTimePct < 0
      ? `Watch a real $10k try to climb out of ${allTimePct.toFixed(1)}%, one lesson a day. follow @brandonnfongg`
      : `Watch a real $10k build on +${allTimePct.toFixed(1)}%, one lesson a day. follow @brandonnfongg`;
  const [expanded, setExpanded] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const awayLabel = delta ? timeAgo(delta.daysSince) : '';
  const collapsedAgentCount = 3;
  const visibleAgents = expanded ? delta?.perAgent ?? [] : delta?.perAgent.slice(0, collapsedAgentCount) ?? [];
  const hiddenAgentCount = Math.max(0, (delta?.perAgent.length ?? 0) - visibleAgents.length);
  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    dragStartY.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragStartY.current === null) return;
    const dragged = event.clientY - dragStartY.current;
    dragStartY.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragged < -42) onDismiss();
  };
  const handlePointerCancel = () => {
    dragStartY.current = null;
  };

  return (
    <AnimatePresence>
      {delta && (
        <motion.aside
          key="visit-delta"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="visit-delta-notification"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div className="visit-delta-notification__header">
            <span>Gym Live</span>
            <time>{awayLabel}</time>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="visit-delta-notification__close"
          >
            ×
          </button>
          <strong className="visit-delta-notification__title">While you were away</strong>
          <p className="visit-delta-notification__body">
            {delta.totalNewTrades} new settled trade{delta.totalNewTrades === 1 ? '' : 's'}.
            Account <span className={pnlTone(delta.totalPnlDelta)}>{formatPnl(delta.totalPnlDelta)}</span>.
          </p>
          <div className="visit-delta-notification__agents" aria-label="Agent changes while away">
            {visibleAgents.map((agent) => (
              <div key={agent.id} className="visit-delta-notification__agent-row">
                <span>{agent.name}</span>
                <span>{tradeCountLabel(agent.newTrades)}</span>
                <span className={pnlTone(agent.pnlDelta)}>{formatPnl(agent.pnlDelta)}</span>
              </div>
            ))}
          </div>
          {hiddenAgentCount > 0 || expanded ? (
            <button
              type="button"
              className="visit-delta-notification__expand"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? 'Show less' : `Show ${hiddenAgentCount} more`}
            </button>
          ) : null}
          <a
            href={primary.href}
            target="_blank"
            rel="noreferrer"
            className="visit-delta-notification__follow"
            onClick={() => trackPublicLabEvent('follow_click', {
              surface: 'visit_delta_strip',
              platform: primary.id,
              destination: primary.href,
            })}
          >
            {followCopy}
          </a>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
