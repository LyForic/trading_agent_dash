import { useMemo } from 'react';
import type { WeatherCondition } from '@/lib/useGaleWeather';

/**
 * Weather particles rendered inside Gale's window rect. Mounts unconditionally
 * so the CSS opacity transition on body[data-room="gale"] can fade it in
 * smoothly — same pattern as the time-of-day tint layer.
 *
 * Window rect coords are percentages of the full viewport (the WorldLayer
 * container is fixed inset-0), tuned to the centered window in gale.png.
 * Tweak WINDOW_RECT if the room art changes.
 *
 * Rain / snow / storm generate a population of positioned divs with CSS
 * keyframe animations. Cloud and mist are translucent opacity breathers
 * over the window. Clear renders nothing.
 *
 * All animations share the `.ambient-motion` class so the
 * `body.tab-hidden .ambient-motion` rule in globals.css pauses them when
 * the tab is hidden.
 */

const WINDOW_RECT = {
  top: '10%',
  left: '25%',
  width: '50%',
  height: '45%',
};

interface DropSpec {
  key: string;
  leftPct: number;
  delayS: number;
  durationS: number;
  sizePx: number;
}

function useSeededDrops(count: number, seed: string): DropSpec[] {
  return useMemo(() => {
    const rand = mulberry32(hashString(seed));
    const out: DropSpec[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        key: `${seed}-${i}`,
        leftPct: rand() * 100,
        delayS: rand() * 2,
        durationS: 0.6 + rand() * 0.8,
        sizePx: 1 + rand() * 1.2,
      });
    }
    return out;
  }, [count, seed]);
}

function useSeededFlakes(count: number, seed: string): DropSpec[] {
  return useMemo(() => {
    const rand = mulberry32(hashString(seed));
    const out: DropSpec[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        key: `${seed}-${i}`,
        leftPct: rand() * 100,
        delayS: rand() * 6,
        durationS: 4 + rand() * 4,
        sizePx: 2 + rand() * 2,
      });
    }
    return out;
  }, [count, seed]);
}

export function WeatherParticles({ condition }: { condition: WeatherCondition }) {
  return (
    <div
      aria-hidden
      className="weather-window absolute pointer-events-none overflow-hidden"
      style={WINDOW_RECT}
    >
      {(condition === 'rain' || condition === 'storm') && (
        <RainLayer dense={condition === 'storm'} />
      )}
      {condition === 'snow' && <SnowLayer />}
      {condition === 'storm' && <StormFlash />}
      {condition === 'mist' && <MistLayer />}
      {condition === 'clouds' && <CloudsLayer />}
    </div>
  );
}

function RainLayer({ dense }: { dense: boolean }) {
  const drops = useSeededDrops(dense ? 60 : 40, dense ? 'storm' : 'rain');
  return (
    <>
      {drops.map((d) => (
        <span
          key={d.key}
          className="raindrop ambient-motion absolute"
          style={{
            left: `${d.leftPct}%`,
            top: '-10%',
            width: `${d.sizePx}px`,
            height: `${d.sizePx * 10}px`,
            animationDelay: `${d.delayS}s`,
            animationDuration: `${d.durationS}s`,
          }}
        />
      ))}
    </>
  );
}

function SnowLayer() {
  const flakes = useSeededFlakes(35, 'snow');
  return (
    <>
      {flakes.map((f) => (
        <span
          key={f.key}
          className="snowflake ambient-motion absolute"
          style={{
            left: `${f.leftPct}%`,
            top: '-10%',
            width: `${f.sizePx}px`,
            height: `${f.sizePx}px`,
            animationDelay: `${f.delayS}s`,
            animationDuration: `${f.durationS}s`,
          }}
        />
      ))}
    </>
  );
}

function StormFlash() {
  return <div className="storm-flash ambient-motion absolute inset-0" />;
}

function MistLayer() {
  return <div className="mist-layer ambient-motion absolute inset-0" />;
}

function CloudsLayer() {
  return <div className="clouds-layer ambient-motion absolute inset-0" />;
}

// Tiny deterministic RNG so the drop positions are stable across renders —
// avoids the particles "jittering" when any parent re-renders.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
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
