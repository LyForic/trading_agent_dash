import { useEffect } from 'react';
import { WeatherParticles } from './WeatherParticles';
import { AmbientMotion } from './AmbientMotion';
import { RoomAgentLayer, type RoomAgentState } from './RoomAgentLayer';
import { useSharedGaleWeather } from '@/lib/galeWeatherContext-hooks';
import type { AgentId } from '@/lib/types';

/**
 * Fixed world behind all content. The 16:9 game stage scales as one
 * unit behind the UI, so room art and sprites share one coordinate system.
 * Four stacked layers from back to front:
 *
 *   1. Room images — four `<img>`s absolutely positioned per room
 *      (gym/apex/gale/metheus). Each has opacity: 0 except the active
 *      one, driven by body[data-room].
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

export function WorldLayer({
  agents = [],
  activeRoom,
}: {
  agents?: RoomAgentState[];
  activeRoom: AgentId | null;
}) {
  const { current: weather } = useSharedGaleWeather();
  const visibleRooms = activeRoom
    ? ROOMS.filter((room) => room.id === 'gym' || room.id === activeRoom)
    : ROOMS.filter((room) => room.id === 'gym');

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
      <div className="gym-world-stage absolute overflow-hidden">
        {/* Room layer — four stacked images, one per room. The stage is a
            fixed 16:9 game world scaled to cover the viewport, so room art
            and scene sprites share one coordinate system. */}
        {visibleRooms.map((room) => (
          <img
            key={room.id}
            src={room.url}
            alt=""
            draggable={false}
            className={`gym-room-bg gym-room-bg--${room.id} absolute inset-0`}
          />
        ))}

        <RoomAgentLayer agents={agents} />

        {/* Time-of-day tint overlay — multiply blend so dusk/moonlit
            genuinely darken both room art and sprites. */}
        <div
          className="gym-tint-overlay absolute inset-0 transition-colors duration-500"
          aria-hidden
        />

        {/* Light-source glow — simulates sunset through window (dusk) or
            moonbeam (moonlit). Positioned center-top because most of our
            room art places windows along the back wall. */}
        <div
          className="gym-light-source absolute inset-0 transition-opacity duration-500"
          aria-hidden
        />

        {/* Ambient motion — dust motes everywhere + per-room warm hotspots
            that fade in with body[data-room]. */}
        <AmbientMotion activeRoom={activeRoom} />

        {/* Gale's particles are comparatively expensive. Mount them only
            inside Gale's room so Apex's battle animation gets the frame
            budget when it is the active room. */}
        {activeRoom === 'gale' && <WeatherParticles condition={weather?.condition ?? 'clouds'} />}
      </div>
    </div>
  );
}
