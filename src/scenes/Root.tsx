import { Composition } from 'remotion';
import { RosterPnL } from './RosterPnL';
import { BattleArena } from './BattleArena';
import { TradeLog } from './TradeLog';
import { TimeOfDay } from './TimeOfDay';

const FPS = 30;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="roster-pnl"
        component={RosterPnL}
        durationInFrames={330}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="battle-arena"
        component={BattleArena}
        durationInFrames={300}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="trade-log"
        component={TradeLog}
        durationInFrames={210}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="time-of-day"
        component={TimeOfDay}
        durationInFrames={310}
        fps={FPS}
        width={1080}
        height={1920}
      />
    </>
  );
}
