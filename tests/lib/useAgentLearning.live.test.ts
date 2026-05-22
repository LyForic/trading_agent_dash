import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { fromMock, limitMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
  isSupabaseConfigured: true,
}));

import { useAgentLearning } from '@/lib/useAgentLearning';

describe('useAgentLearning live mode', () => {
  beforeEach(() => {
    fromMock.mockReset();
    limitMock.mockReset();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: limitMock,
          }),
        }),
      }),
    });
  });

  it('fetches published learning posts for the selected agent', async () => {
    limitMock.mockResolvedValue({
      data: [
        {
          id: 'note-1',
          agent_id: 'bacon',
          title: 'Contract timing fixed',
          body: 'Replay now ends at the actual contract close.',
          made_at: '2026-05-22T22:00:00Z',
          source: 'bacon_bot',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useAgentLearning('bacon'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fromMock).toHaveBeenCalledWith('agent_learning_posts_public');
    expect(result.current.posts).toEqual([
      {
        id: 'note-1',
        agent_id: 'bacon',
        title: 'Contract timing fixed',
        body: 'Replay now ends at the actual contract close.',
        made_at: '2026-05-22T22:00:00Z',
        source: 'bacon_bot',
      },
    ]);
  });
});
