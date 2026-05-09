import type { CSSProperties } from 'react';

type FxStyle = CSSProperties & Record<`--${string}`, string | number | undefined>;

interface PositionedFx {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  delay?: string;
  duration?: string;
}

const SMOKES = [
  { x: 807, y: 98, scale: 0.46, delay: '-0.5s', duration: '3.8s' },
  { x: 292, y: 338, scale: 0.38, delay: '-2.2s', duration: '4.4s' },
];

const WIND_STREAKS: PositionedFx[] = [
  { src: '/fx/town-wind-streak-1.png', x: 115, y: 286, width: 42, height: 18, duration: '6.5s', delay: '-1.5s' },
  { src: '/fx/town-wind-streak-2.png', x: 385, y: 238, width: 44, height: 23, duration: '7.2s', delay: '-4.1s' },
  { src: '/fx/town-wind-streak-3.png', x: 630, y: 286, width: 50, height: 18, duration: '6.9s', delay: '-2.6s' },
  { src: '/fx/town-wind-streak-4.png', x: 250, y: 470, width: 38, height: 30, duration: '7.6s', delay: '-5.3s' },
  { src: '/fx/town-wind-streak-5.png', x: 545, y: 444, width: 36, height: 33, duration: '8.1s', delay: '-3.4s' },
  { src: '/fx/town-wind-streak-6.png', x: 785, y: 300, width: 42, height: 29, duration: '7.4s', delay: '-6.1s' },
];

const LEAVES: Array<PositionedFx & { dx: string; dy: string; rotate: string }> = [
  { src: '/fx/town-leaf-1.png', x: 78, y: 66, width: 14, height: 14, duration: '9.6s', delay: '-0.6s', dx: '62px', dy: '42px', rotate: '92deg' },
  { src: '/fx/town-leaf-2.png', x: 820, y: 62, width: 13, height: 13, duration: '10.4s', delay: '-4.5s', dx: '-74px', dy: '48px', rotate: '-110deg' },
  { src: '/fx/town-leaf-3.png', x: 605, y: 142, width: 12, height: 11, duration: '8.8s', delay: '-2.2s', dx: '48px', dy: '38px', rotate: '86deg' },
  { src: '/fx/town-leaf-4.png', x: 190, y: 448, width: 12, height: 12, duration: '11.2s', delay: '-7.2s', dx: '70px', dy: '-28px', rotate: '130deg' },
  { src: '/fx/town-leaf-5.png', x: 730, y: 430, width: 13, height: 11, duration: '10.8s', delay: '-3.1s', dx: '-62px', dy: '-22px', rotate: '-100deg' },
  { src: '/fx/town-leaf-6.png', x: 335, y: 358, width: 12, height: 12, duration: '9.8s', delay: '-5.9s', dx: '40px', dy: '20px', rotate: '76deg' },
  { src: '/fx/town-leaf-7.png', x: 880, y: 198, width: 12, height: 13, duration: '12s', delay: '-8.1s', dx: '-68px', dy: '34px', rotate: '-125deg' },
  { src: '/fx/town-leaf-8.png', x: 468, y: 68, width: 13, height: 11, duration: '10.6s', delay: '-6.8s', dx: '58px', dy: '30px', rotate: '118deg' },
];

const BIRDS = [
  { x: -70, y: 92, width: 34, height: 27, dx: '1090px', dy: '-26px', duration: '18s', delay: '-5s', scale: 1 },
  { x: 996, y: 162, width: 28, height: 23, dx: '-1110px', dy: '18px', duration: '22s', delay: '-13s', scale: -1 },
];

const BUTTERFLIES = [
  { x: 370, y: 372, width: 16, height: 16, duration: '5.8s', delay: '-0.7s' },
  { x: 96, y: 292, width: 15, height: 15, duration: '6.6s', delay: '-2.4s' },
  { x: 718, y: 242, width: 16, height: 16, duration: '6.2s', delay: '-4.1s' },
];

const CLOUD_SHADOWS = [
  { x: -40, y: 38, width: 280, height: 104, duration: '46s', delay: '-11s', opacity: 0.34 },
  { x: 236, y: 176, width: 340, height: 112, duration: '54s', delay: '-26s', opacity: 0.28 },
  { x: 620, y: 370, width: 300, height: 90, duration: '50s', delay: '-6s', opacity: 0.24 },
];

export function TownAmbientLayer() {
  return (
    <div className="town-ambient-layer" aria-hidden>
      {CLOUD_SHADOWS.map((shadow, index) => (
        <span
          key={`cloud-${index}`}
          className="town-cloud-shadow ambient-motion"
          style={fxStyle({
            left: shadow.x,
            top: shadow.y,
            width: shadow.width,
            height: shadow.height,
            '--town-fx-duration': shadow.duration,
            '--town-fx-delay': shadow.delay,
            '--town-fx-opacity': shadow.opacity,
          })}
        />
      ))}

      {SMOKES.map((smoke, index) => (
        <span
          key={`smoke-${index}`}
          className="town-smoke-puff ambient-motion"
          style={fxStyle({
            left: smoke.x,
            top: smoke.y,
            width: Math.round(64 * smoke.scale),
            height: Math.round(64 * smoke.scale),
            '--town-smoke-scale': smoke.scale,
            '--town-smoke-frame-width': `${Math.round(64 * smoke.scale)}px`,
            '--town-fx-duration': smoke.duration,
            '--town-fx-delay': smoke.delay,
          })}
        />
      ))}

      {WIND_STREAKS.map((wind, index) => (
        <img
          key={wind.src}
          src={wind.src}
          alt=""
          className="town-wind-streak ambient-motion"
          draggable={false}
          style={fxStyle({
            left: wind.x,
            top: wind.y,
            width: wind.width,
            height: wind.height,
            '--town-fx-duration': wind.duration,
            '--town-fx-delay': wind.delay,
            '--town-wind-dx': `${34 + index * 7}px`,
          })}
        />
      ))}

      {LEAVES.map((leaf, index) => (
        <img
          key={`${leaf.src}-${index}`}
          src={leaf.src}
          alt=""
          className="town-drifting-leaf ambient-motion"
          draggable={false}
          style={fxStyle({
            left: leaf.x,
            top: leaf.y,
            width: leaf.width,
            height: leaf.height,
            '--town-fx-duration': leaf.duration,
            '--town-fx-delay': leaf.delay,
            '--town-leaf-dx': leaf.dx,
            '--town-leaf-dy': leaf.dy,
            '--town-leaf-rotate': leaf.rotate,
          })}
        />
      ))}

      {BIRDS.map((bird, index) => (
        <span
          key={`bird-${index}`}
          className="town-bird-flight ambient-motion"
          style={fxStyle({
            left: bird.x,
            top: bird.y,
            width: bird.width,
            height: bird.height,
            '--town-flight-dx': bird.dx,
            '--town-flight-dy': bird.dy,
            '--town-fx-duration': bird.duration,
            '--town-fx-delay': bird.delay,
            '--town-flight-scale': bird.scale,
            '--town-frame-width': `${bird.width}px`,
          })}
        />
      ))}

      {BUTTERFLIES.map((butterfly, index) => (
        <span
          key={`butterfly-${index}`}
          className="town-butterfly ambient-motion"
          style={fxStyle({
            left: butterfly.x,
            top: butterfly.y,
            width: butterfly.width,
            height: butterfly.height,
            '--town-fx-duration': butterfly.duration,
            '--town-fx-delay': butterfly.delay,
            '--town-frame-width': `${butterfly.width}px`,
          })}
        />
      ))}
    </div>
  );
}

function fxStyle(style: FxStyle): FxStyle {
  return style;
}
