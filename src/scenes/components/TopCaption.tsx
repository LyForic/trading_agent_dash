import { useCurrentFrame, spring, useVideoConfig, interpolate } from 'remotion';

interface Props {
  text: string;
  /** When true, the caption holds at its resting position with no entry animation. */
  staticEntry?: boolean;
}

export function TopCaption({ text, staticEntry = false }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = staticEntry
    ? 1
    : spring({
        frame,
        fps,
        config: { damping: 18, stiffness: 140, mass: 0.6 },
        durationInFrames: 14,
      });

  const opacity = staticEntry ? 1 : interpolate(enter, [0, 1], [0, 1]);
  const translateY = interpolate(enter, [0, 1], [60, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 100,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          fontSize: 54,
          fontWeight: 700,
          lineHeight: 1.15,
          color: '#1c1814',
          textAlign: 'center',
          padding: '0 80px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif',
          letterSpacing: '-0.02em',
          textShadow: '0 2px 14px rgba(255, 248, 230, 0.85)',
          maxWidth: 920,
        }}
      >
        {text}
      </div>
    </div>
  );
}
