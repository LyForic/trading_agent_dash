import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from 'remotion';
import { PhoneFrame } from './components/PhoneFrame';
import { TopCaption } from './components/TopCaption';

const W = 1080;

export function TradeLog() {
  return (
    <PhoneFrame bg="#ecdcc0">
      <Sequence from={0} durationInFrames={210}>
        <ScrollingLog />
      </Sequence>

      <AbsoluteFill>
        <Sequence from={0} durationInFrames={210}>
          <TopCaption text="Every settled trade and open position, in one log" />
        </Sequence>
      </AbsoluteFill>
    </PhoneFrame>
  );
}

function ScrollingLog() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 24, stiffness: 130 }, durationInFrames: 18 });
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  // Slow auto-scroll to telegraph the list is scrollable.
  const scroll = interpolate(frame, [40, 200], [0, -260], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: W / 2 - 400,
        top: 360,
        width: 800,
        height: 1320,
        overflow: 'hidden',
        borderRadius: 28,
        background: '#fbf4e2',
        boxShadow: '0 30px 80px -20px rgba(28, 24, 20, 0.55), 0 8px 24px rgba(28,24,20,0.18)',
        opacity,
        padding: 8,
      }}
    >
      <Img
        src={staticFile('onboarding-stills/trade-log/01-log.png')}
        style={{
          width: '100%',
          height: 'auto',
          transform: `translateY(${scroll}px)`,
          display: 'block',
        }}
      />
    </div>
  );
}
