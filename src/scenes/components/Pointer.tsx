import { useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';

interface Props {
  /** Composition center is the fade-in start point per skill rules. */
  startX?: number;
  startY?: number;
  targetX: number;
  targetY: number;
  /** Frame at which the pointer fades in at center. */
  fadeInAt?: number;
  /** Frame at which the pointer arrives at the target and fires the ripple. */
  tapAt: number;
  /** When true, skip the fade-in (used for continuous taps on the same UI). */
  continuous?: boolean;
  /** When set, the pointer fades out at this frame. */
  fadeOutAt?: number;
}

export function Pointer({
  startX,
  startY,
  targetX,
  targetY,
  fadeInAt = 0,
  tapAt,
  continuous = false,
  fadeOutAt,
}: Props) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const cx = startX ?? width / 2;
  const cy = startY ?? height / 2;

  // Fade in at center (or already on screen if continuous).
  const fadeIn = continuous
    ? 1
    : spring({
        frame: frame - fadeInAt,
        fps,
        config: { damping: 18, stiffness: 180 },
        durationInFrames: 10,
      });

  // Move from start → target between fadeInAt+8 and tapAt.
  const moveStart = fadeInAt + (continuous ? 0 : 8);
  const moveDur = Math.max(1, tapAt - moveStart);
  const moveProgress = interpolate(frame, [moveStart, moveStart + moveDur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  const x = interpolate(moveProgress, [0, 1], [cx, targetX]);
  const y = interpolate(moveProgress, [0, 1], [cy, targetY]);

  // Press scale at tap.
  const press = interpolate(
    frame,
    [tapAt - 2, tapAt, tapAt + 6],
    [1, 0.78, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Ripple emanating from target after tap.
  const rippleProg = interpolate(frame, [tapAt, tapAt + 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rippleSize = interpolate(rippleProg, [0, 1], [40, 220]);
  const rippleOpacity = interpolate(rippleProg, [0, 1], [0.55, 0]);
  const rippleVisible = frame >= tapAt && frame <= tapAt + 28;

  // Fade out.
  const fadeOut =
    fadeOutAt != null
      ? interpolate(frame, [fadeOutAt, fadeOutAt + 8], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;

  const opacity = fadeIn * fadeOut;
  if (opacity <= 0.01 && !rippleVisible) return null;

  return (
    <>
      {rippleVisible && (
        <div
          style={{
            position: 'absolute',
            left: targetX - rippleSize / 2,
            top: targetY - rippleSize / 2,
            width: rippleSize,
            height: rippleSize,
            borderRadius: '50%',
            border: '4px solid rgba(248, 220, 130, 0.9)',
            opacity: rippleOpacity,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: x - 36,
          top: y - 12,
          width: 72,
          height: 72,
          opacity,
          transform: `scale(${press})`,
          transformOrigin: '36px 36px',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.35))',
        }}
      >
        <svg viewBox="0 0 64 64" width={72} height={72}>
          <defs>
            <radialGradient id="ptrGrad" cx="0.35" cy="0.3" r="0.85">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#f8e6b4" />
              <stop offset="100%" stopColor="#9b6e2b" />
            </radialGradient>
          </defs>
          <circle cx="28" cy="28" r="22" fill="url(#ptrGrad)" stroke="#1c1814" strokeWidth="2.5" />
          <circle cx="22" cy="22" r="6" fill="rgba(255,255,255,0.7)" />
        </svg>
      </div>
    </>
  );
}
