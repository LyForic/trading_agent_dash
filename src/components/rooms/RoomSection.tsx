import type { ReactNode } from 'react';
import type { AgentId } from '@/lib/types';
import { useRoomScroll } from '@/hooks/useRoomScroll';

/**
 * Observer wrapper around each agent's card. Size-neutral — the section
 * takes the natural height of its child so the roster stays tightly
 * stacked (Phase 2 density). The IntersectionObserver in useRoomScroll
 * still fires as you scroll through the cards, setting body[data-room]
 * so the World Layer can react.
 *
 * Prior implementation forced min-h-[60vh] which regressed card density.
 * Room "walking" as a scroll gesture lands properly once the three
 * agent-room background PNGs are commissioned/generated; until then,
 * this wrapper's job is just to tell the world *which agent's card is
 * currently in view* so room-specific treatments can swap in later.
 */
export function RoomSection({
  room,
  children,
}: {
  room: AgentId;
  children: ReactNode;
}) {
  const ref = useRoomScroll(room);
  return (
    <section ref={ref as React.RefObject<HTMLElement>} data-room={room}>
      {children}
    </section>
  );
}
