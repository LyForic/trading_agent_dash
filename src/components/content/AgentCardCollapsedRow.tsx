import type { Agent } from '@/lib/types';
import { AgentCardCollapsedRowInner } from './AgentCardCollapsedRowInner';

interface Props {
  agent: Agent;
  /** @deprecated InBattlePill now renders as a sibling of the summary button. */
  onBattleTap?: () => void;
}

export function AgentCardCollapsedRow({ agent }: Props) {
  return <AgentCardCollapsedRowInner agent={agent} />;
}
