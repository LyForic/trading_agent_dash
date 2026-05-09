import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpriteAnimator } from '@/components/world/SpriteAnimator';

describe('SpriteAnimator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances one clipped atlas frame at a time', () => {
    vi.useFakeTimers();
    const { container } = render(
      <SpriteAnimator src="/sprites/apex/animations/battle-punch.png" frameCount={5} fps={10} />,
    );

    const viewport = container.querySelector('.sprite-animator');
    const sheet = container.querySelector('.sprite-animator__sheet') as HTMLImageElement;

    expect(viewport).toHaveAttribute('data-frame', '0');
    expect(sheet.style.width).toBe('500%');
    expect(sheet.style.transform).toBe('translate3d(-0%, 0, 0)');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(viewport).toHaveAttribute('data-frame', '1');
    expect(sheet.style.transform).toBe('translate3d(-20%, 0, 0)');
  });
});
