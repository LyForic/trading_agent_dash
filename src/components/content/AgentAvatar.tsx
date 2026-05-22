import type { AgentId } from '@/lib/types';

interface Props {
  id: AgentId;
  name: string;
  spriteUrl?: string;
  size?: number;
}

const ACCENT_COLOR: Record<AgentId, string> = {
  apex: 'var(--color-apex)',
  gale: 'var(--color-gale)',
  metheus: 'var(--color-metheus)',
  bacon: 'var(--color-bacon)',
  nova: 'var(--color-nova)',
};

/**
 * Agent avatar slot. Renders a commissioned/PixelLab sprite if `spriteUrl`
 * is provided (crisp pixels via `image-rendering: pixelated`); otherwise
 * falls back to a color-silhouette with the agent's first initial.
 * Silhouette is the V1 baseline per spec §9.5 — ships with the product
 * launch even if sprites slip.
 */
export function AgentAvatar({ id, name, spriteUrl, size = 48 }: Props) {
  const style = { width: size, height: size } as const;

  if (spriteUrl) {
    return (
      <img
        src={spriteUrl}
        alt={name}
        data-agent={id}
        style={{ ...style, imageRendering: 'pixelated' }}
        className="rounded-lg"
      />
    );
  }

  // Silhouette is decorative; the enclosing card provides the agent's name
  // for screen readers, so the avatar itself is aria-hidden to avoid a
  // redundant "Gale G Gale" announcement.
  return (
    <div
      data-agent={id}
      aria-hidden="true"
      style={{
        ...style,
        backgroundColor: ACCENT_COLOR[id],
        fontSize: size * 0.45,
      }}
      className="rounded-lg flex items-center justify-center text-white font-bold select-none"
    >
      {name[0].toUpperCase()}
    </div>
  );
}
