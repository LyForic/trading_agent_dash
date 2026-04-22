import type { Move } from '@/lib/types';

/**
 * Pill representing one of an agent's strategies. Unlocked moves show
 * their name; locked moves show "???" — per spec §2, the content unlock
 * loop: viewers learn what moves mean by watching the @brandonnfongg
 * content that explains each one.
 */
export function MovePill({ move }: { move: Move }) {
  return (
    <span
      className="px-2 py-0.5 rounded-md text-xs border"
      style={{
        backgroundColor: move.locked ? 'transparent' : 'var(--color-paper-raised)',
        color: move.locked ? 'var(--color-ink-muted)' : 'var(--color-ink)',
        borderColor: 'var(--color-border-default)',
      }}
    >
      {move.locked ? '???' : move.name}
    </span>
  );
}
