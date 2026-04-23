import { useEffect } from 'react';
import { WeatherParticles } from './WeatherParticles';
import { AmbientMotion } from './AmbientMotion';
import { useGaleWeather } from '@/lib/useGaleWeather';

/**
 * Fixed world behind all content. Four stacked layers from back to front:
 *
 *   1. Room images — four `<div>`s absolutely positioned with
 *      background-image per room (gym/apex/gale/metheus). Each has
 *      opacity: 0 except the active one, driven by body[data-room].
 *      Gym is the hero/default when no room is focused. Crossfades via
 *      400ms opacity transition = the "door-step" feel without motion.
 *
 *   2. Time-of-day tint — one semi-transparent color overlay driven by
 *      body[data-mode]. Warm amber wash for dusk, cool navy for moonlit,
 *      transparent for daytime. Room art stays the constant; light
 *      changes.
 *
 *   3. Light-source glow — radial gradient simulating sun/moon through
 *      the back-wall window.
 *
 *   4. Weather particles — Gale-only; mounts always, fades in when
 *      body[data-room="gale"]. Condition comes from useGaleWeather which
 *      rotates Gale's five cities and falls back gracefully if the
 *      weather Edge Function isn't reachable.
 *
 *   + Visibility pause — toggles body.tab-hidden on visibilitychange so
 *     particle animations pause when the tab is hidden.
 *
 * All pixel art renders with image-rendering: pixelated for crisp scale.
 */

const ROOMS = [
  { id: 'gym', url: '/rooms/gym.png' },
  { id: 'apex', url: '/rooms/apex.png' },
  { id: 'gale', url: '/rooms/gale.png' },
  { id: 'metheus', url: '/rooms/metheus.png' },
] as const;

export function WorldLayer() {
  const { current: weather } = useGaleWeather();

  useEffect(() => {
    const onVisibility = () => {
      document.body.classList.toggle('tab-hidden', document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      {/* Room layer — four stacked background divs, one per room.
          Active visibility is controlled purely by body[data-room] via
          CSS; NO inline opacity here, because inline styles beat class
          selectors and would permanently pin a room to 0. */}
      {ROOMS.map((room) => (
        <div
          key={room.id}
          className={`gym-room-bg gym-room-bg--${room.id} absolute inset-0`}
          style={{
            backgroundImage: `url(${room.url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        />
      ))}

      {/* Time-of-day tint overlay — multiply blend so dusk/moonlit
          genuinely darken the art (like dim ambient light), rather than
          washing it out with a flat color. Driven by body[data-mode]. */}
      <div
        className="gym-tint-overlay absolute inset-0 transition-colors duration-500"
        aria-hidden
      />

      {/* Light-source glow — simulates sunset through window (dusk) or
          moonbeam (moonlit). Positioned center-top because most of our
          room art places windows along the back wall. Invisible in
          daytime. */}
      <div
        className="gym-light-source absolute inset-0 transition-opacity duration-500"
        aria-hidden
      />

      {/* Ambient motion — dust motes everywhere + per-room warm hotspots
          that fade in with body[data-room]. Cheap "this place is alive"
          layer without needing layered sprites. */}
      <AmbientMotion />

      {/* Weather particles in Gale's window rect. Always mounted; CSS
          opacity on body[data-room="gale"] controls visibility so the
          fade-in matches the room crossfade. Condition defaults to
          'clouds' while the hook is loading so the window isn't empty
          on first paint. */}
      <WeatherParticles condition={weather?.condition ?? 'clouds'} />
    </div>
  );
}
