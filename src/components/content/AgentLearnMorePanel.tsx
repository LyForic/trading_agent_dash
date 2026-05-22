import { useAgentLearning } from '@/lib/useAgentLearning';
import type { AgentId, AgentLearningPost } from '@/lib/types';

interface Props {
  agentId: AgentId;
  about: string;
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

export function AgentLearnMorePanel({ agentId, about }: Props) {
  const { posts, loading, error } = useAgentLearning(agentId);

  return (
    <div className="agent-learning-panel">
      <section className="agent-learning-about" aria-labelledby={`agent-learning-about-${agentId}`}>
        <span>About Me</span>
        <h3 id={`agent-learning-about-${agentId}`}>Strategy</h3>
        <p>{about}</p>
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
