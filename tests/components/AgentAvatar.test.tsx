import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentAvatar } from '@/components/content/AgentAvatar';

describe('AgentAvatar', () => {
  it('renders an img when spriteUrl provided', () => {
    render(<AgentAvatar id="apex" spriteUrl="/sprites/apex.png" name="Apex" />);
    expect(screen.getByRole('img', { name: 'Apex' })).toBeInTheDocument();
  });

  it('renders a silhouette with the first letter when no sprite', () => {
    render(<AgentAvatar id="gale" name="Gale" />);
    expect(screen.getByText('G')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('tags the silhouette with the agent id for CSS-based color theming', () => {
    const { container } = render(<AgentAvatar id="metheus" name="Metheus" />);
    const node = container.firstChild as HTMLElement;
    expect(node.dataset.agent).toBe('metheus');
  });
});
