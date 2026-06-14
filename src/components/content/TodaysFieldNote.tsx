import { BookOpen } from 'lucide-react';
import { useAgentLearning } from '@/lib/useAgentLearning';
import { insightEvidenceList, insightSampleSize, type AgentTradeInsight } from '@/lib/agentInsights';
import type { AgentId, AgentLearningPost } from '@/lib/types';

interface Props {
  agentId: AgentId;
  onOpenHistory: (options?: { noteId?: string; surface?: string }) => void;
  scopeLabel?: string;
  reconciliation?: string | null;
  insight?: AgentTradeInsight | null;
}

function formatAsOf(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function excerpt(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= 150) return compact;
  return `${compact.slice(0, 149).trimEnd()}...`;
}

function chipsFor(post: AgentLearningPost) {
  return [post.category, post.viewer_angle, post.why_it_matters ? 'Why it matters' : null, post.tomorrow_watch ? 'Tomorrow watch' : null]
    .filter((chip, index, all): chip is string => Boolean(chip) && all.indexOf(chip) === index)
    .slice(0, 3);
}

function insightLabel(kind: AgentTradeInsight['kind']) {
  return kind
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function TodaysFieldNote({ agentId, onOpenHistory, scopeLabel, reconciliation, insight }: Props) {
  const { posts, loading, error } = useAgentLearning(agentId);
  const latest = posts[0] ?? null;

  if (insight) {
    const evidence = insightEvidenceList(insight).slice(0, 3);
    const sampleSize = insightSampleSize(insight);

    return (
      <button
        type="button"
        className="todays-field-note"
        onClick={() => onOpenHistory({ surface: 'data_insight' })}
        aria-label={`Open ${agentId} data insight`}
      >
        <BookOpen size={15} aria-hidden />
        <div className="todays-field-note__body">
          <div className="todays-field-note__head">
            <span>Data Insight</span>
            <time>{insight.confidence} confidence</time>
          </div>
          {scopeLabel && <span className="todays-field-note__scope">{scopeLabel}</span>}
          <strong>{insight.headline}</strong>
          <p>{insight.summary}</p>
          {evidence.length > 0 && (
            <ul className="todays-field-note__evidence" aria-label="Insight evidence">
              {evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <p className="todays-field-note__reconcile">{insight.nextRule}</p>
          <div className="todays-field-note__chips">
            <span>{insightLabel(insight.kind)}</span>
            <span>{sampleSize} sample{sampleSize === 1 ? '' : 's'}</span>
            {insight.sourceLabel && <span>{insight.sourceLabel}</span>}
            <span>Next rule</span>
          </div>
        </div>
      </button>
    );
  }

  if (loading) {
    return (
      <section className="todays-field-note todays-field-note--pending" aria-label="Today's field note">
        <span>Today's Field Note</span>
        <strong>Loading latest lesson...</strong>
      </section>
    );
  }

  if (error || !latest) {
    return (
      <section className="todays-field-note todays-field-note--pending" aria-label="Today's field note">
        <div>
          <span>Today's Field Note</span>
          <strong>{error ? 'Notes unavailable' : 'No public note yet'}</strong>
        </div>
        <p>{error ? 'The field-note feed is temporarily unavailable.' : 'This agent has not posted a public learning note yet.'}</p>
      </section>
    );
  }

  return (
    <button
      type="button"
      className="todays-field-note"
      onClick={() => onOpenHistory({ surface: 'todays_field_note', noteId: latest.id })}
      aria-label={`Open ${agentId} field notes`}
    >
      <BookOpen size={15} aria-hidden />
      <div className="todays-field-note__body">
        <div className="todays-field-note__head">
          <span>Today's Field Note</span>
          <time dateTime={latest.made_at}>As of {formatAsOf(latest.made_at)}</time>
        </div>
        {scopeLabel && <span className="todays-field-note__scope">{scopeLabel}</span>}
        <strong>{latest.title}</strong>
        <p>{excerpt(latest.body)}</p>
        {reconciliation && <p className="todays-field-note__reconcile">{reconciliation}</p>}
        {chipsFor(latest).length > 0 && (
          <div className="todays-field-note__chips">
            {chipsFor(latest).map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
