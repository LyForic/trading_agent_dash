import { describe, it, expect, vi, beforeEach } from 'vitest';

const { channelMock, removeChannelMock, onMock, subscribeMock, handlers, channel } = vi.hoisted(() => {
  const handlers: Array<(payload: unknown) => void> = [];
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, callback: (payload: unknown) => void) => {
      handlers.push(callback);
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return {
    channel,
    handlers,
    channelMock: vi.fn(() => channel),
    removeChannelMock: vi.fn(),
    onMock: channel.on,
    subscribeMock: channel.subscribe,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: channelMock,
    removeChannel: removeChannelMock,
  },
  isSupabaseConfigured: true,
}));

import {
  isKnownPublicTradeEvent,
  PUBLIC_TRADE_EVENT_TABLE,
  subscribeToPublicTradeEvents,
} from '@/lib/publicTradeEvents';

describe('public trade realtime events', () => {
  beforeEach(() => {
    handlers.length = 0;
    channelMock.mockClear();
    removeChannelMock.mockClear();
    onMock.mockClear();
    subscribeMock.mockClear();
  });

  it('recognizes only configured public agent ids', () => {
    expect(isKnownPublicTradeEvent({ new: { agent_id: 'nova' }, old: {}, eventType: 'INSERT' } as never)).toBe(true);
    expect(isKnownPublicTradeEvent({ new: { agent_id: 'bacon' }, old: {}, eventType: 'INSERT' } as never)).toBe(true);
    expect(isKnownPublicTradeEvent({ new: { agent_id: 'unknown' }, old: {}, eventType: 'INSERT' } as never)).toBe(false);
  });

  it('subscribes to the sanitized public event table and filters payloads', () => {
    const onEvent = vi.fn();
    const unsubscribe = subscribeToPublicTradeEvents(onEvent, 'test-settled');

    expect(channelMock).toHaveBeenCalledWith(expect.stringMatching(/^test-settled-/));
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: PUBLIC_TRADE_EVENT_TABLE },
      expect.any(Function),
    );
    expect(subscribeMock).toHaveBeenCalled();

    handlers[0]?.({ new: { agent_id: 'nova' }, old: {}, eventType: 'INSERT' });
    handlers[0]?.({ new: { agent_id: 'private-test-agent' }, old: {}, eventType: 'INSERT' });
    expect(onEvent).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(removeChannelMock).toHaveBeenCalledWith(channel);
  });
});
