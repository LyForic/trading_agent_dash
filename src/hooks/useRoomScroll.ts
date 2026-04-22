import { useEffect, useRef } from 'react';
import type { AgentId } from '@/lib/types';

/**
 * Observes the given section and, when it crosses the 60% visibility
 * threshold, sets body[data-room="<agentId>"] so the world layer can
 * swap accent color + agent-specific desk prop via CSS selectors.
 * Returns a ref to attach to the section element.
 *
 * Per spec §5: one fixed world, three section moods. The observer is
 * the single coordinator — components don't have to track each other.
 */
export function useRoomScroll(room: AgentId) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            document.body.dataset.room = room;
          }
        }
      },
      { threshold: [0.6] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [room]);

  return ref;
}
