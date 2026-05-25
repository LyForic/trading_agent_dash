import type { SocialLinkConfig } from '@/lib/publicLab';

interface Props {
  id: SocialLinkConfig['id'];
  className?: string;
}

export function SocialPlatformIcon({ id, className = 'world-v2-social-icon' }: Props) {
  if (id === 'instagram') return <InstagramOutlineIcon className={className} />;
  if (id === 'tiktok') return <TikTokOutlineIcon className={className} />;
  return <YouTubeOutlineIcon className={className} />;
}

function InstagramOutlineIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="5" y="5" width="14" height="14" rx="4" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="16.4" cy="7.8" r="0.7" />
    </svg>
  );
}

function TikTokOutlineIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M14.5 4v9.45a4.25 4.25 0 1 1-4.25-4.25c.38 0 .75.05 1.1.15v3.05a1.5 1.5 0 1 0 1.05 1.43V4h2.1Z" />
      <path d="M14.5 4c.5 2.45 2.05 4.05 4.5 4.45v3.05c-1.72-.03-3.24-.58-4.5-1.58" />
    </svg>
  );
}

function YouTubeOutlineIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="3.6" y="6.7" width="16.8" height="10.6" rx="3" />
      <path d="M10.4 9.7 14.9 12l-4.5 2.3V9.7Z" />
    </svg>
  );
}
