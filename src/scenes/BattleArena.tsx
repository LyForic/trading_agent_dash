import { AbsoluteFill, Sequence } from 'remotion';
import { PhoneFrame } from './components/PhoneFrame';
import { TopCaption } from './components/TopCaption';
import { Pointer } from './components/Pointer';
import { Still } from './components/Still';

const W = 1080;
const STILL_WIDTH = 880;

export function BattleArena() {
  return (
    <PhoneFrame bg="#e7d6b6">
      {/* Beat 1 — agent card with the In Battle pill, pointer fades in and taps the pill */}
      <Sequence from={0} durationInFrames={120}>
        <Still src="onboarding-stills/battle-arena/01-card-with-pill.png" y={1100} width={STILL_WIDTH} />
        <Pointer
          startX={W / 2}
          startY={1500}
          targetX={W / 2 + 40}
          targetY={1340}
          fadeInAt={20}
          tapAt={75}
          fadeOutAt={95}
        />
      </Sequence>

      {/* Beat 2 — bottom sheet only, slides up and holds */}
      <Sequence from={120} durationInFrames={180}>
        <SlideUpSheet />
      </Sequence>

      <AbsoluteFill>
        <Sequence from={0} durationInFrames={300}>
          <TopCaption text="Tap a live battle to see the price action" />
        </Sequence>
      </AbsoluteFill>
    </PhoneFrame>
  );
}

import { useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from 'remotion';

function SlideUpSheet() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 140 }, durationInFrames: 22 });
  const ty = interpolate(enter, [0, 1], [900, 0]);

  return (
    <Img
      src={staticFile('onboarding-stills/battle-arena/04-sheet-only.png')}
      style={{
        position: 'absolute',
        left: W / 2 - 460,
        bottom: -30,
        width: 920,
        height: 'auto',
        transform: `translateY(${ty}px)`,
        borderRadius: '32px 32px 0 0',
        boxShadow: '0 -20px 60px rgba(0, 0, 0, 0.35)',
      }}
    />
  );
}
