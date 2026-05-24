import { useAgentLearning } from '@/lib/useAgentLearning';
import { AGENT_STRATEGY_PROFILES } from '@/lib/publicLab';
import { formatPnl } from '@/lib/formatting';
import type { AgentId, AgentLearningPost, TradeLogEntry } from '@/lib/types';

interface Props {
  agentId: AgentId;
  about: string;
  representativeTrades?: TradeLogEntry[];
}

function formatPostDate(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function LearningPostCard({ post }: { post: AgentLearningPost }) {
  return (
    <article className="agent-learning-post">
      <time dateTime={post.made_at}>{formatPostDate(post.made_at)}</time>
      <h3>{post.title}</h3>
      {paragraphs(post.body).map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </article>
  );
}

function RepresentativeTrade({ trade }: { trade: TradeLogEntry }) {
  return (
    <li>
      <span>{trade.side.toUpperCase()} {trade.contract_ticker}</span>
      <strong className={trade.pnl >= 0 ? 'trade-replay-readout--gain' : 'trade-replay-readout--loss'}>
        {formatPnl(trade.pnl)}
      </strong>
    </li>
  );
}

export function AgentLearnMorePanel({ agentId, about, representativeTrades = [] }: Props) {
  const { posts, loading, error } = useAgentLearning(agentId);
  const strategy = AGENT_STRATEGY_PROFILES[agentId];

  return (
    <div className="agent-learning-panel">
      <section className="agent-learning-about" aria-labelledby={`agent-learning-about-${agentId}`}>
        <span>About Me</span>
        <h3 id={`agent-learning-about-${agentId}`}>Strategy</h3>
        <p>{about}</p>
      </section>

      <section className="agent-strategy-brief" aria-label="Agent strategy brief">
        <div>
          <span>Plain-English Thesis</span>
          <p>{strategy.plainThesis}</p>
        </div>
        <div>
          <span>Markets Traded</span>
          <p>{strategy.marketsTraded}</p>
        </div>
        <div>
          <span>Risk Posture</span>
          <p>{strategy.riskPosture}</p>
        </div>
        <div>
          <span>When It Fails</span>
          <p>{strategy.failureMode}</p>
        </div>
        <div className="agent-strategy-brief__wide">
          <span>Current Learning</span>
          <p>{strategy.currentLearning}</p>
        </div>
      </section>

      <section className="agent-representative-trades" aria-label="Representative trades">
        <div className="agent-learning-posts-head">
          <span>Representative Trades</span>
          <strong>{representativeTrades.length > 0 ? `${representativeTrades.length} recent` : 'Pending'}</strong>
        </div>
        {representativeTrades.length > 0 ? (
          <ul>
            {representativeTrades.map((trade) => (
              <RepresentativeTrade key={trade.id} trade={trade} />
            ))}
          </ul>
        ) : (
          <div className="agent-learning-empty">
            Representative trades will appear after this agent settles more public trades.
          </div>
        )}
      </section>

      <div className="agent-learning-posts-head">
        <span>Field Notes</span>
        <strong>{loading ? 'Loading' : `${posts.length} ${posts.length === 1 ? 'note' : 'notes'}`}</strong>
      </div>

      {error && (
        <div className="agent-learning-empty">
          Learning notes are unavailable right now.
        </div>
      )}

      {!error && !loading && posts.length === 0 && (
        <div className="agent-learning-empty">
          No field notes yet.
        </div>
      )}

      {!error && posts.length > 0 && (
        <div className="agent-learning-posts">
          {posts.map((post) => (
            <LearningPostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
