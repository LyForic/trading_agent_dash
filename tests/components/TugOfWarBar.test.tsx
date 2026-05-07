import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TugOfWarBar } from '@/components/battle/TugOfWarBar';

describe('TugOfWarBar', () => {
  it('centers when current price equals entry', () => {
    const { getByTestId } = render(
      <TugOfWarBar entryPriceCents={50} currentPriceCents={50} side="yes" />,
    );
    const fill = getByTestId('battle-tug-fill');
    expect(fill).toHaveAttribute('data-direction', 'center');
    expect(fill).toHaveStyle({ transform: 'translateX(0%) scaleX(0)' });
  });

  it('pushes right when the move favors the agent', () => {
    const { getByTestId } = render(
      <TugOfWarBar entryPriceCents={50} currentPriceCents={66} side="yes" />,
    );
    const fill = getByTestId('battle-tug-fill');
    expect(fill).toHaveAttribute('data-direction', 'right');
    expect(fill).toHaveAttribute('data-favors-agent', 'true');
  });

  it('pushes left when the move goes against the agent', () => {
    const { getByTestId } = render(
      <TugOfWarBar entryPriceCents={50} currentPriceCents={66} side="no" />,
    );
    const fill = getByTestId('battle-tug-fill');
    expect(fill).toHaveAttribute('data-direction', 'left');
    expect(fill).toHaveAttribute('data-favors-agent', 'false');
  });
});
