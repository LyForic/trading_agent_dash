import { AbsoluteFill, Sequence } from 'remotion';
import { PhoneFrame } from './components/PhoneFrame';
import { TopCaption } from './components/TopCaption';
import { Pointer } from './components/Pointer';
import { Still } from './components/Still';

const W = 1080;
const STILL_WIDTH = 880;
const STILL_Y = 1100; // vertical center for the card image

// Pointer targets approximate the position of the 24h / 7d / Lifetime pills
// inside the captured card crop, in composition space.
const PILL_BAND_Y = STILL_Y + 240;
const TARGET_7D = { x: W / 2, y: PILL_BAND_Y };
const TARGET_LIFETIME = { x: W / 2 + 220, y: PILL_BAND_Y };

export function RosterPnL() {
  return (
    <PhoneFrame bg="#f3e9d2">
      {/* Beat 1 — default card, caption, pointer fades in and taps 7d */}
      <Sequence from={0} durationInFrames={120}>
        <Still src="onboarding-stills/roster-pnl/01-card-default.png" y={STILL_Y} width={STILL_WIDTH} />
        <Pointer
          startX={W / 2}
          startY={1500}
          targetX={TARGET_7D.x}
          targetY={TARGET_7D.y}
          fadeInAt={20}
          tapAt={70}
        />
      </Sequence>

      {/* Beat 2 — card swaps to 7d, pointer continues (same UI) to Lifetime */}
      <Sequence from={120} durationInFrames={120}>
        <Still src="onboarding-stills/roster-pnl/02-card-7d.png" y={STILL_Y} width={STILL_WIDTH} pop />
        <Pointer
          startX={TARGET_7D.x}
          startY={TARGET_7D.y}
          targetX={TARGET_LIFETIME.x}
          targetY={TARGET_LIFETIME.y}
          continuous
          tapAt={50}
          fadeOutAt={90}
        />
      </Sequence>

      {/* Beat 3 — card now Lifetime, hold */}
      <Sequence from={240} durationInFrames={90}>
        <Still src="onboarding-stills/roster-pnl/03-card-lifetime.png" y={STILL_Y} width={STILL_WIDTH} pop />
      </Sequence>

      {/* Caption persists across all beats — single TopCaption wrapper. */}
      <AbsoluteFill>
        <Sequence from={0} durationInFrames={330}>
          <CaptionShell>Track each agent across 24h, 7d, or lifetime</CaptionShell>
        </Sequence>
      </AbsoluteFill>
    </PhoneFrame>
  );
}

function CaptionShell({ children }: { children: string }) {
  // Single shared caption — entry plays once at frame 0, then static.
  return <TopCaption text={children} />;
}
