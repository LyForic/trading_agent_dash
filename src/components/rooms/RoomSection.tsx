import type { ReactNode } from 'react';
import type { AgentId } from '@/lib/types';
import { useRoomScroll } from '@/hooks/useRoomScroll';

/**
 * Full-height section wrapper. When scrolled into 60% view it sets
 * body[data-room], which triggers the WorldLayer to swap its accent
 * aura and reveal the room's desk prop (VR gauge / window / hourglass).
 *
 * min-h-[60vh] per spec §5 — deliberately tall enough that scrolling
 * between agents feels like walking between rooms on a mobile screen.
 * Content (the AgentCard) is centered vertically so the cozy world
 * elements (window, lamp, prop) breathe around it.
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
    <section
      ref={ref as React.RefObject<HTMLElement>}
      data-room={room}
      className="min-h-[60vh] flex flex-col justify-center"
    >
      {children}
    </section>
  );
}
