import { ArrowUpRight, Bell } from 'lucide-react';
import { SOCIAL_LINKS, trackPublicLabEvent } from '@/lib/publicLab';
import { SocialPlatformIcon } from './SocialPlatformIcon';

interface Props {
  surface: string;
  compact?: boolean;
}

export function FollowExperimentCta({ surface, compact = false }: Props) {
  const primary = SOCIAL_LINKS.find((link) => link.id === 'tiktok') ?? SOCIAL_LINKS[0];

  return (
    <div className={compact ? 'follow-experiment follow-experiment--compact' : 'follow-experiment'}>
      <div className="follow-experiment__copy">
        <span>Follow the experiment</span>
        {!compact && <p>Tomorrow's result continues the story.</p>}
      </div>
      <div className="follow-experiment__actions">
        <a
          className="follow-experiment__primary"
          href={primary.href}
          target="_blank"
          rel="noreferrer"
          aria-label="Follow @brandonnfongg"
          onClick={() => trackPublicLabEvent('follow_click', { surface, platform: primary.id })}
        >
          <Bell size={15} aria-hidden />
          <span>@brandonnfongg</span>
        </a>
        <div className="follow-experiment__links" aria-label="Follow platforms">
          {SOCIAL_LINKS.map((link) => (
            <a
              key={link.id}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Follow on ${link.label}`}
              title={`Follow on ${link.label}`}
              onClick={() => trackPublicLabEvent('follow_click', { surface, platform: link.id })}
            >
              <SocialPlatformIcon id={link.id} className="follow-experiment__icon" />
              <ArrowUpRight size={11} aria-hidden />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
