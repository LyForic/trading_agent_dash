import { Img, staticFile, useCurrentFrame, spring, useVideoConfig, interpolate } from 'remotion';

interface Props {
  src: string;
  /** X center in composition space (default: width/2). */
  x?: number;
  /** Y center in composition space. */
  y: number;
  /** Final rendered width in composition px. */
  width: number;
  /** Optional crossfade entry from frame N. */
  enterAt?: number;
  /** Optional spring scale-in pop. */
  pop?: boolean;
}

export function Still({ src, x, y, width, enterAt = 0, pop = false }: Props) {
  const frame = useCurrentFrame();
  const { fps, width: vw } = useVideoConfig();

  const enter = spring({
    frame: frame - enterAt,
    fps,
    config: { damping: 22, stiffness: 130, mass: 0.7 },
    durationInFrames: 18,
  });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const scale = pop ? interpolate(enter, [0, 1], [0.92, 1]) : 1;

  const cx = x ?? vw / 2;

  return (
    <Img
      src={staticFile(src)}
      style={{
        position: 'absolute',
        left: cx - width / 2,
        top: y - (width * 0.5),
        width,
        height: 'auto',
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        borderRadius: 32,
        boxShadow: '0 30px 80px -20px rgba(28, 24, 20, 0.55), 0 8px 24px rgba(28,24,20,0.18)',
      }}
    />
  );
}
