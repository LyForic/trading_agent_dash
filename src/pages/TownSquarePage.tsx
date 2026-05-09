import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TownAmbientLayer } from '@/components/world/TownAmbientLayer';
import { useAgentData } from '@/lib/useAgentData';
import { useVisitDelta } from '@/lib/useVisitDelta';
import type { AgentId } from '@/lib/types';

const WORLD_W = 960;
const WORLD_H = 540;
const AVATAR_SIZE = 48;
const AVATAR_SPAWN = { x: 480, y: 365 };
const WALK_SPEED_WORLD_PX_PER_SEC = 118;
const ROUTE_DELAY_MS = 240;

type DestinationId = 'gym' | AgentId | 'comingSoon';
type Facing = 'north' | 'south' | 'east' | 'west';
type Point = { x: number; y: number };

interface Destination {
  id: DestinationId;
  label: string;
  ariaLabel: string;
  route?: string;
  disabled?: boolean;
  hitbox: { x: number; y: number; w: number; h: number };
  target: { x: number; y: number };
}

const DESTINATIONS: Destination[] = [
  {
    id: 'gym',
    label: 'Trading Gym',
    ariaLabel: 'Enter the Trading Gym communal roster',
    route: '/gym',
    hitbox: { x: 345, y: 35, w: 270, h: 180 },
    target: { x: 480, y: 235 },
  },
  {
    id: 'apex',
    label: 'Apex',
    ariaLabel: "Enter Apex's room",
    route: '/apex',
    hitbox: { x: 70, y: 115, w: 190, h: 145 },
    target: { x: 181, y: 270 },
  },
  {
    id: 'metheus',
    label: 'Metheus',
    ariaLabel: "Enter Metheus's room",
    route: '/metheus',
    hitbox: { x: 668, y: 115, w: 190, h: 145 },
    target: { x: 760, y: 274 },
  },
  {
    id: 'gale',
    label: 'Gale',
    ariaLabel: "Enter Gale's room",
    route: '/gale',
    hitbox: { x: 110, y: 330, w: 195, h: 145 },
    target: { x: 220, y: 475 },
  },
  {
    id: 'comingSoon',
    label: 'Coming soon',
    ariaLabel: 'Future agent home coming soon',
    disabled: true,
    hitbox: { x: 655, y: 322, w: 210, h: 155 },
    target: { x: 755, y: 472 },
  },
];

// Hand-authored road waypoints. Keep these on visible dirt/stone paths so
// the decorative avatar avoids trees, fences, and the plaza lamp.
const DESTINATION_PATHS: Record<DestinationId, Point[]> = {
  // Route around the lamp instead of walking through its post.
  gym: [
    { x: 435, y: 352 },
    { x: 410, y: 315 },
    { x: 430, y: 270 },
    { x: 480, y: 235 },
  ],
  apex: [
    { x: 430, y: 365 },
    { x: 430, y: 310 },
    { x: 300, y: 310 },
    { x: 181, y: 310 },
    { x: 181, y: 270 },
  ],
  metheus: [
    { x: 530, y: 365 },
    { x: 530, y: 310 },
    { x: 650, y: 310 },
    { x: 760, y: 310 },
    { x: 760, y: 274 },
  ],
  gale: [
    { x: 480, y: 430 },
    { x: 480, y: 495 },
    { x: 390, y: 505 },
    { x: 280, y: 500 },
    { x: 220, y: 475 },
  ],
  comingSoon: [
    { x: 480, y: 430 },
    { x: 480, y: 495 },
    { x: 610, y: 500 },
    { x: 705, y: 490 },
    { x: 755, y: 472 },
  ],
};

function directionOf(from: Point, to: Point): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  return dy > 0 ? 'south' : 'north';
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function durationForSegment(from: Point, to: Point): number {
  const raw = (distanceBetween(from, to) / WALK_SPEED_WORLD_PX_PER_SEC) * 1000;
  return Math.round(Math.max(260, Math.min(raw, 1300)));
}

export function TownSquarePage() {
  const navigate = useNavigate();
  const { data, source } = useAgentData({ apex: '24h', gale: '24h', metheus: '24h' });
  const { delta } = useVisitDelta(data, source);

  const viewportRef = useRef<HTMLDivElement>(null);
  const routeTimerRef = useRef<number | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });
  const [avatarPos, setAvatarPos] = useState(AVATAR_SPAWN);
  const [avatarFacing, setAvatarFacing] = useState<Facing>('south');
  const [isWalking, setIsWalking] = useState(false);
  const [moveDurationMs, setMoveDurationMs] = useState(0);
  const [activeDestination, setActiveDestination] = useState<DestinationId | null>(null);

  useEffect(() => {
    document.body.dataset.route = 'town-square';
    delete document.body.dataset.room;
    delete document.body.dataset.focus;
    return () => {
      delete document.body.dataset.route;
      if (routeTimerRef.current !== null) {
        window.clearTimeout(routeTimerRef.current);
      }
      if (segmentTimerRef.current !== null) {
        window.clearTimeout(segmentTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return 1;
    return Math.max(viewport.w / WORLD_W, viewport.h / WORLD_H);
  }, [viewport]);

  const worldDisplay = useMemo(
    () => ({ w: WORLD_W * scale, h: WORLD_H * scale }),
    [scale],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const targetScroll = AVATAR_SPAWN.x * scale - viewport.w / 2;
    el.scrollLeft = Math.max(0, Math.min(worldDisplay.w - viewport.w, targetScroll));
  }, [scale, viewport.w, worldDisplay.w]);

  const walkTo = useCallback(
    (destination: Destination) => {
      if (isWalking || destination.disabled) return;
      if (routeTimerRef.current !== null) window.clearTimeout(routeTimerRef.current);
      if (segmentTimerRef.current !== null) window.clearTimeout(segmentTimerRef.current);

      setIsWalking(true);
      setActiveDestination(destination.id);

      const el = viewportRef.current;
      if (el) {
        const targetScroll = destination.target.x * scale - viewport.w / 2;
        el.scrollTo({
          left: Math.max(0, Math.min(worldDisplay.w - viewport.w, targetScroll)),
          behavior: 'smooth',
        });
      }

      const path = DESTINATION_PATHS[destination.id] ?? [destination.target];
      let current = avatarPos;
      let index = 0;

      const advance = () => {
        const next = path[index];
        if (!next) {
          setMoveDurationMs(0);
          routeTimerRef.current = window.setTimeout(() => {
            if (destination.route) {
              navigate(destination.route, { state: { from: '/' } });
            } else {
              setIsWalking(false);
              setActiveDestination(null);
            }
          }, ROUTE_DELAY_MS);
          return;
        }

        const duration = durationForSegment(current, next);
        setAvatarFacing(directionOf(current, next));
        setMoveDurationMs(duration);
        setAvatarPos(next);

        segmentTimerRef.current = window.setTimeout(() => {
          current = next;
          index += 1;
          advance();
        }, duration);
      };

      advance();
    },
    [avatarPos, isWalking, navigate, scale, viewport.w, worldDisplay.w],
  );

  const newTradesLabel = delta
    ? `${delta.totalNewTrades} new trade${delta.totalNewTrades === 1 ? '' : 's'}`
    : `${data.agents.length} agents online`;

  return (
    <>
      <div ref={viewportRef} className="town-viewport" aria-label="Trading Gym town map">
        <div
          className="town-canvas"
          style={{ width: worldDisplay.w, height: worldDisplay.h }}
        >
          <div
            className="town-world"
            style={{
              width: WORLD_W,
              height: WORLD_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <img
              src="/rooms/town-overworld.png"
              alt=""
              className="town-map-image"
              draggable={false}
            />
            <TownAmbientLayer />
            <div className="town-mode-wash" aria-hidden />
            <div className="town-lamp-glow ambient-motion" aria-hidden />

            {DESTINATIONS.map((destination) => (
              <button
                key={destination.id}
                type="button"
                className={`town-destination-hit town-destination-hit--${destination.id}${
                  activeDestination === destination.id ? ' town-destination-hit--active' : ''
                }`}
                aria-label={destination.ariaLabel}
                data-agent-name={destination.label}
                disabled={destination.disabled || isWalking}
                onClick={() => walkTo(destination)}
                style={{
                  left: destination.hitbox.x,
                  top: destination.hitbox.y,
                  width: destination.hitbox.w,
                  height: destination.hitbox.h,
                }}
              >
                <span className="town-destination-label">{destination.label}</span>
              </button>
            ))}

            <img
              src={`/sprites/player/rotations/${avatarFacing}.png`}
              alt="Your avatar"
              className={`town-avatar${isWalking ? ' town-avatar--walking' : ' town-avatar--idle'}`}
              draggable={false}
              style={{
                left: avatarPos.x,
                top: avatarPos.y,
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                zIndex: 3000 + Math.round(avatarPos.y),
                ['--town-avatar-move-ms' as string]: `${moveDurationMs}ms`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="town-hud" aria-hidden="false">
        <motion.aside
          className="town-status-card"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          <p className="town-status-eyebrow">Lyforic Plaza</p>
          <h1>Trading Gym</h1>
          <p>{newTradesLabel}</p>
        </motion.aside>
      </div>
    </>
  );
}
