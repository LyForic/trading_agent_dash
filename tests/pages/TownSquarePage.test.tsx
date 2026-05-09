import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TownSquarePage } from '@/pages/TownSquarePage';

vi.mock('@/lib/useAgentData', async () => {
  const { mockCardViewModels, mockLeaderboard } = await import('@/lib/mockData');
  return {
    useAgentData: () => ({
      data: mockLeaderboard,
      cardViewModels: mockCardViewModels,
      source: 'mock',
      error: null,
      loading: false,
    }),
  };
});

vi.mock('@/lib/useVisitDelta', () => ({
  useVisitDelta: () => ({ delta: null, dismiss: vi.fn() }),
}));

class TestResizeObserver {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { width: 960, height: 540 } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as ResizeObserver,
    );
  }

  unobserve() {}
  disconnect() {}
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderTown() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TownSquarePage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const originalResizeObserver = window.ResizeObserver;
const originalScrollTo = Element.prototype.scrollTo;

describe('TownSquarePage movement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: TestResizeObserver,
    });
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
    Element.prototype.scrollTo = originalScrollTo;
    vi.useRealTimers();
  });

  it('walks along the top road before routing into an agent house', () => {
    renderTown();

    fireEvent.click(screen.getByRole('button', { name: "Enter Apex's room" }));

    const avatar = screen.getByRole('img', { name: 'Your avatar' });
    expect(avatar).toHaveClass('town-avatar--walking');
    expect(avatar).toHaveAttribute('src', '/sprites/player/rotations/west.png');
    expect(avatar).toHaveStyle({ left: '430px', top: '365px' });
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(avatar).toHaveAttribute('src', '/sprites/player/rotations/north.png');
    expect(avatar).toHaveStyle({ left: '430px', top: '310px' });
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    act(() => {
      vi.advanceTimersByTime(3_400);
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/apex');
  });

  it('routes Gale by going south first instead of cutting through the side yard', () => {
    renderTown();

    fireEvent.click(screen.getByRole('button', { name: "Enter Gale's room" }));

    const avatar = screen.getByRole('img', { name: 'Your avatar' });
    expect(avatar).toHaveClass('town-avatar--walking');
    expect(avatar).toHaveAttribute('src', '/sprites/player/rotations/south.png');
    expect(avatar).toHaveStyle({ left: '480px', top: '430px' });

    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(avatar).toHaveStyle({ left: '480px', top: '495px' });

    act(() => {
      vi.advanceTimersByTime(3_200);
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/gale');
  });
});
