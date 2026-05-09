import { useMemo } from 'react';
import type { AgentId } from '@/lib/types';

/**
 * AmbientMotion — low-cost "the room is alive" pass. Two always-mounted
 * layers that sit between the time-of-day tint and the weather particles:
 *
 *   1. Dust motes — a small population of drifting particles rendered
 *      across every room. Seeded RNG for stable positions across renders.
 *      Catches sunlight in daytime, reads as "this place has air moving."
 *
 *   2. Per-room warm hotspots — one soft radial per room matched to a
 *      plausible in-scene light source (study lamp, gym chandelier,
 *      dojo monitors). Each one fades in only when its room is active,
 *      same pattern as the existing light-source glow but position-
 *      specific. Breathing opacity keyframe makes it subtly alive.
 *
 * Without layered room sprites we can't animate specific props (plant
 * sway, monitor flicker, etc.) — those wait on Phase 5 art. These
 * additive ambient effects ship the "living room" feel today without
 * touching asset pipeline.
 *
 * All animations share `.ambient-motion` so the existing
 * body.tab-hidden rule pauses them off-screen. Respects
 * prefers-reduced-motion via the global transition-zeroing rule.
 */

const MOTE_COUNT = 8;

interface MoteSpec {
  key: string;
  leftPct: number;
  topPct: number;
  delayS: number;
  durationS: number;
  sizePx: number;
}

function useSeededMotes(): MoteSpec[] {
  return useMemo(() => {
    const rand = mulberry32(0x9e3779b9);
    const out: MoteSpec[] = [];
    for (let i = 0; i < MOTE_COUNT; i++) {
      out.push({
        key: `mote-${i}`,
        leftPct: rand() * 100,
        topPct: 20 + rand() * 60,
        delayS: rand() * 10,
        durationS: 18 + rand() * 14,
        sizePx: 1.5 + rand() * 2,
      });
    }
    return out;
  }, []);
}

export function AmbientMotion({ activeRoom }: { activeRoom: AgentId | null }) {
  const motes = useSeededMotes();
  const activeHotspot = activeRoom ?? 'gym';

  return (
    <>
      <div aria-hidden className="dust-motes absolute inset-0 pointer-events-none">
        {motes.map((m) => (
          <span
            key={m.key}
            className="dust-mote ambient-motion absolute"
            style={{
              left: `${m.leftPct}%`,
              top: `${m.topPct}%`,
              width: `${m.sizePx}px`,
              height: `${m.sizePx}px`,
              animationDelay: `${m.delayS}s`,
              animationDuration: `${m.durationS}s`,
            }}
          />
        ))}
      </div>

      {/* Per-room hotspots — radial glows placed at plausible in-scene
          light sources. Only the room with data-room matching fades in. */}
      {activeHotspot === 'gym' && (
        <div
          aria-hidden
          className="room-hotspot room-hotspot--gym ambient-motion absolute inset-0 pointer-events-none"
        />
      )}
      {activeHotspot === 'apex' && (
        <div
          aria-hidden
          className="room-hotspot room-hotspot--apex ambient-motion absolute inset-0 pointer-events-none"
        />
      )}
      {activeHotspot === 'metheus' && (
        <div
          aria-hidden
          className="room-hotspot room-hotspot--metheus ambient-motion absolute inset-0 pointer-events-none"
        />
      )}
    </>
  );
}

function mulberry32(seed: number) {
  let s = seed;
  return function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
