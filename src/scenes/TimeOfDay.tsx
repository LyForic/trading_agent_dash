import { AbsoluteFill, Sequence, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { PhoneFrame } from './components/PhoneFrame';
import { TopCaption } from './components/TopCaption';
import { Pointer } from './components/Pointer';

const W = 1080;
const H = 1920;

// Cog sits top-right in the captured viewport.
const COG = { x: 970, y: 220 };
// Popover buttons sit roughly mid-right after opening.
const MOON_BTN = { x: 720, y: 520 };

export function TimeOfDay() {
  return (
    <PhoneFrame bg="#e7d6b6">
      {/* Beat 1: cog highlight + tap */}
      <Sequence from={0} durationInFrames={70}>
        <FullScreenStill src="onboarding-stills/time-of-day/05-daytime.png" />
        <Pointer
          startX={W / 2}
          startY={H / 2}
          targetX={COG.x}
          targetY={COG.y}
          fadeInAt={6}
          tapAt={48}
        />
      </Sequence>

      {/* Beat 2: popover open, pointer continues to Moonlit */}
      <Sequence from={70} durationInFrames={80}>
        <FullScreenStill src="onboarding-stills/time-of-day/02-popover-open.png" />
        <Pointer
          startX={COG.x}
          startY={COG.y}
          targetX={MOON_BTN.x}
          targetY={MOON_BTN.y}
          continuous
          tapAt={45}
          fadeOutAt={70}
        />
      </Sequence>

      {/* Beat 3: world flips to moonlit */}
      <Sequence from={150} durationInFrames={80}>
        <FullScreenStill src="onboarding-stills/time-of-day/03-moonlit.png" />
      </Sequence>

      {/* Beat 4: dusk */}
      <Sequence from={230} durationInFrames={80}>
        <FullScreenStill src="onboarding-stills/time-of-day/04-dusk.png" />
      </Sequence>

      <AbsoluteFill>
        <Sequence from={0} durationInFrames={310}>
          <TopCaption text="Set the gym's mood — daytime, dusk, or moonlit" />
        </Sequence>
      </AbsoluteFill>
    </PhoneFrame>
  );
}

function FullScreenStill({ src }: { src: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 130 }, durationInFrames: 14 });
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  return (
    <Img
      src={staticFile(src)}
      style={{
        position: 'absolute',
        left: 60,
        top: 200,
        width: W - 120,
        height: 'auto',
        opacity,
        borderRadius: 36,
        boxShadow: '0 30px 80px -20px rgba(28, 24, 20, 0.55), 0 8px 24px rgba(28,24,20,0.18)',
      }}
    />
  );
}
