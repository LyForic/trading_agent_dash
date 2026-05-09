import type { AgentId } from '@/lib/types';
import type { RoomAgentState } from './RoomAgentLayer';

export const ROOM_WORLD = {
  width: 960,
  height: 540,
};

export type AgentMood = 'battle' | 'idle' | 'slump';

export interface RoomSceneSprite {
  src: string;
  fixtureSrc?: string;
  bagSrc?: string;
  bagAnimation?: 'apex-punching-bag';
  frameCount: number;
  fps: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shadowWidth: number;
}

const APEX_SCENE: Record<AgentMood, RoomSceneSprite> = {
  battle: {
    src: '/sprites/apex/animations/battle-punch.png',
    fixtureSrc: '/sprites/apex/animations/battle-fixture.png',
    bagSrc: '/sprites/apex/animations/battle-bag.png',
    bagAnimation: 'apex-punching-bag',
    frameCount: 5,
    fps: 8,
    x: 758,
    y: 365,
    width: 130,
    height: 170,
    shadowWidth: 96,
  },
  idle: {
    src: '/sprites/apex/animations/idle-walk.png',
    frameCount: 6,
    fps: 7,
    x: 500,
    y: 328,
    width: 68,
    height: 78,
    shadowWidth: 46,
  },
  slump: {
    src: '/sprites/apex/animations/idle-walk.png',
    frameCount: 6,
    fps: 5,
    x: 430,
    y: 350,
    width: 68,
    height: 78,
    shadowWidth: 46,
  },
};

const METHEUS_SCENE: Record<AgentMood, RoomSceneSprite> = {
  battle: {
    src: '/sprites/metheus/animations/scroll-study.png',
    frameCount: 6,
    fps: 5,
    x: 710,
    y: 372,
    width: 130,
    height: 170,
    shadowWidth: 76,
  },
  idle: {
    src: '/sprites/metheus/animations/scroll-study.png',
    frameCount: 6,
    fps: 4,
    x: 710,
    y: 372,
    width: 130,
    height: 170,
    shadowWidth: 76,
  },
  slump: {
    src: '/sprites/metheus/animations/scroll-study.png',
    frameCount: 6,
    fps: 3,
    x: 690,
    y: 374,
    width: 130,
    height: 170,
    shadowWidth: 76,
  },
};

const GALE_SCENE: Record<AgentMood, RoomSceneSprite> = {
  battle: {
    src: '/sprites/gale/animations/weather-cast.png',
    frameCount: 6,
    fps: 7,
    x: 720,
    y: 372,
    width: 130,
    height: 170,
    shadowWidth: 78,
  },
  idle: {
    src: '/sprites/gale/animations/weather-cast.png',
    frameCount: 6,
    fps: 6,
    x: 720,
    y: 372,
    width: 130,
    height: 170,
    shadowWidth: 78,
  },
  slump: {
    src: '/sprites/gale/animations/weather-cast.png',
    frameCount: 6,
    fps: 5,
    x: 700,
    y: 374,
    width: 130,
    height: 170,
    shadowWidth: 78,
  },
};

export function moodForAgent(agent: RoomAgentState): AgentMood {
  if (agent.isInBattle) return 'battle';
  if (agent.totalPnl < 0) return 'slump';
  return 'idle';
}

export function sceneSpriteForAgent(agentId: AgentId, mood: AgentMood): RoomSceneSprite | null {
  if (agentId === 'apex') return APEX_SCENE[mood];
  if (agentId === 'metheus') return METHEUS_SCENE[mood];
  if (agentId === 'gale') return GALE_SCENE[mood];
  return null;
}
