import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';

interface Props {
  /** Tinted backdrop hue. */
  bg?: string;
  children: ReactNode;
}

/**
 * Tinted backdrop with a subtle vignette. The skill rejects full-screen
 * phone mockups; this is just an ambient field for floating UI pieces.
 */
export function PhoneFrame({ bg = '#f3e9d2', children }: Props) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 20%, ${bg} 0%, ${shade(bg, -8)} 65%, ${shade(bg, -16)} 100%)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

function shade(hex: string, percent: number) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + (percent / 100) * 255));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + (percent / 100) * 255));
  const b = Math.max(0, Math.min(255, (num & 0xff) + (percent / 100) * 255));
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}
