import type { AgentId } from '@/lib/types';
import { SpriteAnimator } from './SpriteAnimator';
import { ROOM_WORLD, moodForAgent, sceneSpriteForAgent } from './roomSceneConfig';

export interface RoomAgentState {
  id: AgentId;
  spriteUrl?: string;
  isInBattle: boolean;
  totalPnl: number;
}

type Facing = 'north' | 'south' | 'east' | 'west';

function spriteFor(agent: RoomAgentState, facing: Facing) {
  const fallback = `/sprites/${agent.id}/rotations/${facing}.png`;
  if (!agent.spriteUrl) return fallback;
  return agent.spriteUrl.replace(/\/rotations\/(north|south|east|west)\.png$/, `/rotations/${facing}.png`);
}

export function RoomAgentLayer({ agents }: { agents: RoomAgentState[] }) {
  return (
    <div className="room-agent-layer absolute inset-0 pointer-events-none" aria-hidden>
      {agents.map((agent) => {
        const mood = moodForAgent(agent);
        const sprite = sceneSpriteForAgent(agent.id, mood);
        if (!sprite) return null;
        const bagClassName = sprite.bagAnimation
          ? `room-agent-bag room-agent-bag--${sprite.bagAnimation}`
          : 'room-agent-bag';

        return (
          <span
            key={agent.id}
            className={`room-agent room-agent--${agent.id} room-agent--${mood}`}
            style={{
              left: `${(sprite.x / ROOM_WORLD.width) * 100}%`,
              top: `${(sprite.y / ROOM_WORLD.height) * 100}%`,
              width: `${(sprite.width / ROOM_WORLD.width) * 100}%`,
              height: `${(sprite.height / ROOM_WORLD.height) * 100}%`,
              ['--room-agent-accent' as string]: `var(--color-${agent.id})`,
              ['--room-agent-shadow-width' as string]: `${(sprite.shadowWidth / sprite.width) * 100}%`,
            }}
          >
            <span className="room-agent-shadow" />
            {sprite.fixtureSrc && (
              <img
                src={sprite.fixtureSrc}
                alt=""
                className="room-agent-fixture"
                draggable={false}
              />
            )}
            {sprite.bagSrc && (
              <img
                src={sprite.bagSrc}
                alt=""
                className={bagClassName}
                draggable={false}
              />
            )}
            {sprite.frameCount > 1 ? (
              <SpriteAnimator
                src={sprite.src}
                frameCount={sprite.frameCount}
                fps={sprite.fps}
              />
            ) : (
              <img
                src={spriteFor(agent, 'south')}
                alt=""
                className="room-agent-sprite"
                draggable={false}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
