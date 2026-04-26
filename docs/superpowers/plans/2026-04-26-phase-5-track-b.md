# Phase 5 Track B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-agent P&L time-window filter + unified trade log + open-position rendering to the AgentCard, while fixing the AgentCard / InBattlePill nested-button HTML invalidity. Server-side delay enforcement via two new Supabase views.

**Architecture:** Three layers with clear boundaries. Data layer: two Supabase views (`agent_trades_public` for delay-floor projection, `agent_lifetime_stats` for per-agent rollup) + base-table SELECT revoke. State layer: `useAgentWindow(agentId)` hook backed by localStorage, lifted to `GymPage`. UI layer: time-filter pill (native radios) in expanded body; trade log replaces Latest Receipt panel; InBattlePill hoists to a sibling of the summary button so both stay native `<button>`. Open positions surface via the existing pill, populated from a separate query against `agent_trades_public` filtering `settled_at IS NULL AND pnl IS NULL` with server-side null filter on `entry_price`.

**Tech Stack:** TypeScript · React 19 · Vite · Tailwind v4 · Supabase JS · Vitest · React Testing Library + userEvent · Postgres views (no RPC for V1).

**Spec:** `docs/superpowers/specs/2026-04-26-phase-5-track-b-design.md` (commit `04d689c` on branch `phase-5-track-b`). Approved by Brandon 2026-04-26 after three Codex review passes.

---

## File Structure

**Created:**
- `supabase/migrations/20260426000000_track_b_views.sql` — public projection view + lifetime aggregate view + grants
- `supabase/migrations/20260426000001_revoke_base_anon_select.sql` — revoke base-table anon SELECT (after Edge Function repointed)
- `src/lib/useAgentWindow.ts` — per-agent window state hook (localStorage-backed)
- `src/components/content/AgentCardCollapsedRowInner.tsx` — pill-free split of CollapsedRow (so the parent layout can place the pill as a sibling, not a descendant)
- `src/components/content/TradeLog.tsx` — unified trade log component (replaces Latest Receipt panel)
- `src/components/content/TimeFilterPill.tsx` — native radio time-window selector
- `tests/lib/useAgentWindow.test.ts`
- `tests/components/TradeLog.test.tsx`
- `tests/components/TimeFilterPill.test.tsx`

**Modified:**
- `src/lib/types.ts` — add `TradeLogEntry`, `AgentLifetimeStats`, `PerformanceWindow`; make `OpenPosition.settles_at` and `entry_price_cents` nullable
- `src/lib/useAgentData.ts` — accept `windowsByAgent` arg; return `{ data, cardViewModels, source, error, loading }`; query views; per-agent memoized fetches
- `src/lib/mockData.ts` — add `mockTradeLog` (3/12/50 row distribution), `mockCardViewModels`, `mockLifetimeStats`; populate Metheus open
- `src/components/content/AgentCard.tsx` — restructure tree (hoist InBattlePill as sibling); drop `closest('[data-role="in-battle-pill"]')` guard; move `aria-expanded` to summary button; thread `currentWindow` + `setWindow`
- `src/components/content/AgentCardCollapsedRow.tsx` — delegate to `AgentCardCollapsedRowInner` (pill-free)
- `src/components/content/AgentCardExpandedBody.tsx` — replace Latest Receipt panel with `<TradeLog>`; add `<TimeFilterPill>` at top; thread `currentWindow` + `setWindow`
- `src/components/content/InBattlePill.tsx` — accept `agentId` prop; nullable `settlesAt`; `aria-disabled="true"`; `aria-describedby` on always-mounted tooltip; JSDoc on `onTap` reservation
- `src/pages/GymPage.tsx` — own per-agent `useAgentWindow` hooks; pass `windowsByAgent` to `useAgentData`; pass `currentWindow + setWindow` to each AgentCard
- `tests/components/AgentCard.test.tsx` — extend with no-nested-button + tab-order + aria-expanded checks
- `tests/components/InBattlePill.test.tsx` — extend with agentId accent + aria-disabled + nullable settlesAt
- `supabase/functions/leaderboard/index.ts:174,180` — repoint `from('agent_trades')` → `from('agent_trades_public')`

---

## Task 1: Add types

Foundational. Establishes the contract every other task references.

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Read current types**

Run: `cat src/lib/types.ts`
Confirm: existing exports include `Agent`, `OpenPosition`, `Receipt`, `LeaderboardResponse`, `AgentId`.

- [ ] **Step 2: Add `PerformanceWindow` type**

Edit `src/lib/types.ts`. After `export type AgentId = ...` (line 1), add:

```ts
export type PerformanceWindow = '24h' | '7d' | 'lifetime';
```

- [ ] **Step 3: Add `TradeLogEntry` type**

After the `Receipt` interface, add:

```ts
export interface TradeLogEntry {
  id: string;
  contract_ticker: string;
  side: 'yes' | 'no';
  entry_price_cents: number;     // present (non-null) — open rows excluded from log
  size: number;
  entered_at: string;
  settled_at: string;            // present (non-null)
  settle_price_cents: number;
  pnl: number;
  move_used: string | null;
}
```

- [ ] **Step 4: Add `AgentLifetimeStats` type**

After `TradeLogEntry`, add:

```ts
export interface AgentLifetimeStats {
  agent_id: AgentId;
  settled: number;
  wins: number;
  losses: number;
  breakeven: number;
  total_pnl: number;
  open_count: number;
}
```

- [ ] **Step 5: Make `OpenPosition` fields nullable**

Replace the existing `OpenPosition` interface with:

```ts
export interface OpenPosition {
  contract_ticker: string;
  entry_price_cents: number | null;  // nullable for type completeness; data layer suppresses null rows
  side: 'yes' | 'no';
  size: number;
  entered_at_delayed: string;
  settles_at: string | null;          // nullable: "In Battle" without countdown when unknown
}
```

- [ ] **Step 6: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors. (If errors surface in `useAgentData.ts` for `OpenPosition.entry_price_cents` literal `0`, leave them — Task 7 fixes that path. Confirm errors are limited to that area.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(track-b): add TradeLogEntry, AgentLifetimeStats, PerformanceWindow; OpenPosition nullables"
```

---

## Task 2: `useAgentWindow` hook + tests

**Files:**
- Create: `src/lib/useAgentWindow.ts`
- Create: `tests/lib/useAgentWindow.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/useAgentWindow.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAgentWindow } from '@/lib/useAgentWindow';

describe('useAgentWindow', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to "24h" when no value is stored', () => {
    const { result } = renderHook(() => useAgentWindow('apex'));
    expect(result.current[0]).toBe('24h');
  });

  it('reads "7d" from localStorage on mount', () => {
    window.localStorage.setItem('gym:track-b:window:apex', '7d');
    const { result } = renderHook(() => useAgentWindow('apex'));
    expect(result.current[0]).toBe('7d');
  });

  it('reads "lifetime" from localStorage on mount', () => {
    window.localStorage.setItem('gym:track-b:window:gale', 'lifetime');
    const { result } = renderHook(() => useAgentWindow('gale'));
    expect(result.current[0]).toBe('lifetime');
  });

  it('falls back to "24h" when localStorage holds garbage', () => {
    window.localStorage.setItem('gym:track-b:window:metheus', 'banana');
    const { result } = renderHook(() => useAgentWindow('metheus'));
    expect(result.current[0]).toBe('24h');
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useAgentWindow('apex'));
    act(() => result.current[1]('7d'));
    expect(result.current[0]).toBe('7d');
    expect(window.localStorage.getItem('gym:track-b:window:apex')).toBe('7d');
  });

  it('uses an agent-scoped key (apex change does not affect gale)', () => {
    const apex = renderHook(() => useAgentWindow('apex'));
    act(() => apex.result.current[1]('lifetime'));
    const gale = renderHook(() => useAgentWindow('gale'));
    expect(gale.result.current[0]).toBe('24h');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/useAgentWindow.test.ts`
Expected: FAIL with "Cannot find module '@/lib/useAgentWindow'".

- [ ] **Step 3: Implement the hook**

Create `src/lib/useAgentWindow.ts`:

```ts
import { useState } from 'react';
import type { AgentId, PerformanceWindow } from './types';

const VALID_WINDOWS: ReadonlyArray<PerformanceWindow> = ['24h', '7d', 'lifetime'];

function readStored(key: string): PerformanceWindow {
  try {
    if (typeof localStorage === 'undefined') return '24h';
    const raw = localStorage.getItem(key);
    return VALID_WINDOWS.includes(raw as PerformanceWindow)
      ? (raw as PerformanceWindow)
      : '24h';
  } catch {
    return '24h';
  }
}

export function useAgentWindow(
  agentId: AgentId,
): [PerformanceWindow, (w: PerformanceWindow) => void] {
  const key = `gym:track-b:window:${agentId}`;
  const [window, setWindowState] = useState<PerformanceWindow>(() => readStored(key));
  const setWindow = (w: PerformanceWindow) => {
    setWindowState(w);
    try {
      localStorage.setItem(key, w);
    } catch {
      /* private mode / blocked storage — state still updates in-memory */
    }
  };
  return [window, setWindow];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/useAgentWindow.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Run full suite to confirm no regressions**

Run: `npm test`
Expected: all green; new total = old + 6 (≥ 30).

- [ ] **Step 6: Commit**

```bash
git add src/lib/useAgentWindow.ts tests/lib/useAgentWindow.test.ts
git commit -m "feat(track-b): add useAgentWindow hook with localStorage persistence"
```

---

## Task 3: Migration 1a — public projection view + lifetime aggregate view

**Files:**
- Create: `supabase/migrations/20260426000000_track_b_views.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260426000000_track_b_views.sql`:

```sql
-- Track B migration 1a — create public delay-gated view + lifetime aggregate view.
-- Companion migration 1b (revoke base-table anon SELECT) ships AFTER the existing
-- leaderboard Edge Function is repointed at agent_trades_public, to avoid a
-- broken-Function window. Order: deploy 1a → deploy Edge Function update → deploy 1b.

-- 30-min-delayed projection of agent_trades for public/anon consumption.
create view agent_trades_public as
select id, agent_id, contract_ticker, side, entry_price, size,
       entered_at, settled_at, settle_price, pnl, move_used, created_at
from agent_trades
where entered_at <= now() - interval '30 minutes'
  and (settled_at is null or settled_at <= now() - interval '30 minutes');

grant select on agent_trades_public to anon;

-- Per-agent lifetime aggregates. Built ON the public view so the 30-min delay
-- floor applies to the rollup. Groups by agent_id; emits NO row for an agent
-- with zero rows in agent_trades_public — client must handle missing-row case.
create view agent_lifetime_stats as
select
  agent_id,
  count(*) filter (where pnl is not null)        as settled,
  count(*) filter (where pnl > 0)                as wins,
  count(*) filter (where pnl < 0)                as losses,
  count(*) filter (where pnl = 0)                as breakeven,
  coalesce(sum(pnl) filter (where pnl is not null), 0) as total_pnl,
  count(*) filter (where settled_at is null and pnl is null) as open_count
from agent_trades_public
group by agent_id;

grant select on agent_lifetime_stats to anon;
```

- [ ] **Step 2: Apply locally (or to staging)**

Run: `supabase db push`
Expected output: `applying migration 20260426000000_track_b_views.sql ... done`.

If `supabase db push` is unavailable (e.g., no local Supabase), apply via the SQL editor in Supabase Studio.

- [ ] **Step 3: Verify both views are anon-readable**

Set environment:
```bash
export SUPABASE_URL=https://zzfmmsuzzbbrfptmtmfu.supabase.co
export SUPABASE_ANON_KEY=<anon key from supabase dashboard>
```

Run:
```bash
curl -s -o /dev/null -w "agent_trades_public: %{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades_public?select=*&limit=5"

curl -s -o /dev/null -w "agent_lifetime_stats: %{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_lifetime_stats?select=*"
```

Expected: both return `200`.

- [ ] **Step 4: Verify base table is STILL anon-readable (intentional intermediate state)**

```bash
curl -s -o /dev/null -w "agent_trades base: %{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades?select=*&limit=5"
```

Expected: `200`. (Migration 1b in Task 5 will revoke this; this step confirms the system is in a valid intermediate state where the existing Edge Function still works.)

- [ ] **Step 5: Verify delay floor on the public view**

```bash
curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades_public?select=entered_at&order=entered_at.desc&limit=1" | jq '.[0].entered_at'
```

Expected: a timestamp at least 30 minutes in the past (or `null` if no rows yet pass the floor).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260426000000_track_b_views.sql
git commit -m "feat(track-b): migration 1a — agent_trades_public + agent_lifetime_stats views"
```

---

## Task 4: Update leaderboard Edge Function to query the public view

**Files:**
- Modify: `supabase/functions/leaderboard/index.ts:180`

- [ ] **Step 1: Read the current Edge Function call site**

Run: `sed -n '170,190p' supabase/functions/leaderboard/index.ts`
Confirm: line 180 has `.from('agent_trades')`.

- [ ] **Step 2: Repoint at `agent_trades_public`**

Edit `supabase/functions/leaderboard/index.ts`. Find the line:
```ts
          .from('agent_trades')
```
Replace with:
```ts
          .from('agent_trades_public')
```

If a second occurrence exists (per spec it was at lines 174 and 180), update both. Verify with `grep -n "from('agent_trades')" supabase/functions/leaderboard/index.ts` — must return zero matches after edit.

- [ ] **Step 3: Re-deploy the Edge Function**

Run: `supabase functions deploy leaderboard`
Expected: deploy success.

- [ ] **Step 4: Verify the Function still returns valid `LeaderboardResponse`**

```bash
curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/functions/v1/leaderboard" | jq '.agents | length'
```

Expected: `3`. (One row per agent.) Confirms the Function reads via the public view.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/leaderboard/index.ts
git commit -m "feat(track-b): leaderboard Edge Function reads via agent_trades_public"
```

---

## Task 5: Migration 1b — revoke base-table anon SELECT

**Files:**
- Create: `supabase/migrations/20260426000001_revoke_base_anon_select.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260426000001_revoke_base_anon_select.sql`:

```sql
-- Track B migration 1b — revoke anon SELECT on base agent_trades.
-- Order: this MUST run after migration 1a (views created) and after the
-- existing leaderboard Edge Function is repointed at agent_trades_public.
-- After this lands, the two public views are the only anon-readable paths
-- to trade data, enforcing the 30-min delay floor at the security boundary.
--
-- Rollback: `grant select on agent_trades to anon;` restores prior posture.

revoke select on agent_trades from anon;
```

- [ ] **Step 2: Apply**

Run: `supabase db push`
Expected: `applying migration 20260426000001_revoke_base_anon_select.sql ... done`.

- [ ] **Step 3: Verify base-table SELECT is now forbidden**

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades?select=*&limit=5"
```

Expected: `401` or `403`. The `apikey` + `Authorization` headers are required to prove this is a SELECT-revoked 401, not a missing-key 401.

- [ ] **Step 4: Verify both public views still work**

```bash
curl -s -o /dev/null -w "public: %{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades_public?select=*&limit=5"

curl -s -o /dev/null -w "lifetime: %{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_lifetime_stats?select=*"
```

Expected: both `200`.

- [ ] **Step 5: Verify Edge Function still works (uses the view post-Task 4)**

```bash
curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/functions/v1/leaderboard" | jq '.agents | length'
```

Expected: `3`. If `0` or error, the Function still references the base table — re-check Task 4.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260426000001_revoke_base_anon_select.sql
git commit -m "feat(track-b): migration 1b — revoke anon SELECT on base agent_trades"
```

---

## Task 6: A11y co-fix — restructure AgentCard, hoist InBattlePill

Ships BEFORE Task 11 (open-position rendering enables the InBattlePill) so that the moment opens go live, the HTML is already valid.

**Files:**
- Create: `src/components/content/AgentCardCollapsedRowInner.tsx`
- Modify: `src/components/content/AgentCard.tsx`
- Modify: `src/components/content/AgentCardCollapsedRow.tsx`
- Modify: `src/components/content/InBattlePill.tsx`
- Modify: `tests/components/AgentCard.test.tsx`
- Modify: `tests/components/InBattlePill.test.tsx`

**Acceptance criterion (from Brandon's review):** `InBattlePill.onTap` MUST have a JSDoc explicitly noting V1.1 reservation + `aria-disabled` no-op + the "drop `aria-disabled` when wiring" follow-up.

- [ ] **Step 1: Create `AgentCardCollapsedRowInner` (pill-free split)**

Create `src/components/content/AgentCardCollapsedRowInner.tsx`:

```tsx
import type { Agent } from '@/lib/types';
import { AgentAvatar } from './AgentAvatar';
import { formatPnl, formatWinRate } from '@/lib/formatting';

interface Props {
  agent: Agent;
}

/**
 * Pill-free version of the collapsed summary row. Lives INSIDE the summary
 * <button>; the InBattlePill renders as a sibling of that button (see
 * AgentCard) so neither nests inside the other.
 */
export function AgentCardCollapsedRowInner({ agent }: Props) {
  const isArrivingSoon = agent.state === 'arriving_soon';
  const isGain = agent.total_pnl >= 0;

  return (
    <div className="flex items-center gap-3 p-3">
      <AgentAvatar id={agent.id} name={agent.name} spriteUrl={agent.sprite_url} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline flex-wrap gap-2">
          <span
            className="text-base font-medium"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {agent.name}
          </span>
          {isArrivingSoon && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-border-default) 40%, transparent)',
                color: 'var(--color-ink-muted)',
              }}
            >
              Arriving soon
            </span>
          )}
        </div>
        <div
          className="text-xs truncate"
          style={{ color: 'var(--color-ink-muted)' }}
        >
          {agent.nickname}
        </div>
      </div>
      {!isArrivingSoon && (
        <div className="text-right">
          <div
            className="text-lg font-medium tabular-nums"
            style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
          >
            {formatPnl(agent.total_pnl)}
          </div>
          <div
            className="text-[11px] tabular-nums"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            {formatWinRate(agent.record.W, agent.record.settled)} WR
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `AgentCardCollapsedRow` to delegate (preserves any other consumer)**

Replace the contents of `src/components/content/AgentCardCollapsedRow.tsx` with:

```tsx
import type { Agent } from '@/lib/types';
import { AgentCardCollapsedRowInner } from './AgentCardCollapsedRowInner';

interface Props {
  agent: Agent;
  /** @deprecated InBattlePill now renders as a sibling of the summary button. */
  onBattleTap?: () => void;
}

export function AgentCardCollapsedRow({ agent }: Props) {
  return <AgentCardCollapsedRowInner agent={agent} />;
}
```

- [ ] **Step 3: Restructure `AgentCard`**

Replace the contents of `src/components/content/AgentCard.tsx` with:

```tsx
import type { Agent, PerformanceWindow } from '@/lib/types';
import { AgentCardCollapsedRowInner } from './AgentCardCollapsedRowInner';
import { AgentCardExpandedBody } from './AgentCardExpandedBody';
import { InBattlePill } from './InBattlePill';

interface Props {
  agent: Agent;
  expanded: boolean;
  onToggle: () => void;
  /** Per-agent time window controlling stats + trade log. Threaded down to the expanded body. */
  currentWindow: PerformanceWindow;
  setWindow: (w: PerformanceWindow) => void;
  /** Reserved for V1.1 Battle Arena handler. Currently unused (pill is aria-disabled). */
  onBattleTap?: () => void;
}

/**
 * AgentCard — the atomic unit of the roster.
 *
 * Tree shape (post-Track-B): the summary <button> and the InBattlePill are
 * SIBLINGS inside an `agent-card-row` flex container, so neither nests inside
 * the other. This fixes the prior nested-<button> HTML invalidity.
 */
export function AgentCard({
  agent,
  expanded,
  onToggle,
  currentWindow,
  setWindow,
  onBattleTap,
}: Props) {
  const canExpand = agent.state !== 'arriving_soon';
  const expandedBodyId = `agent-${agent.id}-expanded`;

  return (
    <article
      className="rounded-2xl border"
      style={{
        backgroundColor: 'var(--color-paper)',
        borderColor: 'var(--color-border-default)',
        boxShadow: '0 4px 12px rgba(62, 53, 41, 0.15)',
        color: 'var(--color-ink)',
      }}
    >
      <div className="agent-card-row" style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        <button
          type="button"
          onClick={() => { if (canExpand) onToggle(); }}
          className="agent-card-summary-btn flex-1 text-left focus:outline-2 focus:outline-offset-[-2px] rounded-2xl"
          style={{
            outlineColor: `var(--color-${agent.id})`,
            cursor: canExpand ? 'pointer' : 'default',
          }}
          aria-expanded={canExpand ? expanded : undefined}
          aria-controls={canExpand ? expandedBodyId : undefined}
          aria-label={
            canExpand
              ? `${expanded ? 'Collapse' : 'Expand'} ${agent.name}'s card`
              : `${agent.name}: arriving soon`
          }
        >
          <AgentCardCollapsedRowInner agent={agent} />
        </button>
        {agent.open_position && (
          <InBattlePill
            agentId={agent.id}
            settlesAt={agent.open_position.settles_at}
            onTap={onBattleTap}
          />
        )}
      </div>
      {expanded && canExpand && (
        <div id={expandedBodyId} className="px-3 pb-3 agent-card-expanded">
          <AgentCardExpandedBody
            agent={agent}
            currentWindow={currentWindow}
            setWindow={setWindow}
          />
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Update `InBattlePill` (agentId + nullable settlesAt + aria-disabled + JSDoc)**

Replace the contents of `src/components/content/InBattlePill.tsx` with:

```tsx
import { useState, useId } from 'react';
import type { AgentId } from '@/lib/types';

interface Props {
  /** Drives accent color via `var(--color-${agentId})`. Replaces the prior hardcoded Metheus accent. */
  agentId: AgentId;
  /** Settle timestamp (ISO). When null, the pill renders without a countdown — "In Battle" alone. */
  settlesAt: string | null;
  /**
   * Reserved for V1.1 Battle Arena handler. In Track B, the pill is
   * `aria-disabled` and `onClick` is a no-op even when this prop is supplied.
   * Drop `aria-disabled` (and the no-op behavior) when wiring this in V1.1.
   */
  onTap?: () => void;
}

const DELAY_COPY =
  'Entries and settlements shown after 30-minute delay. Mid-price updates live from Kalshi (public market data, no delay).';

/**
 * Status chip that doubles as the (future) invite to the Battle Arena overlay.
 * Tooltip is non-optional per spec §7 delay policy.
 *
 * Track B: rendered as a sibling of the AgentCard summary button (not a
 * descendant), preserving native <button> semantics on both. `aria-disabled`
 * is set because the Battle Arena route is V1.1 scope.
 */
export function InBattlePill({ agentId, settlesAt, onTap }: Props) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipId = useId();
  const settlesLabel = settlesAt
    ? new Date(settlesAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const ariaLabel = settlesLabel ? `In battle, settles ${settlesLabel}` : 'In battle';

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={() => { /* aria-disabled in Track B; no-op until V1.1 */ }}
        className="in-battle-pulse px-3 py-1 rounded-full text-xs font-medium border"
        style={{
          backgroundColor: `color-mix(in srgb, var(--color-${agentId}) 18%, transparent)`,
          color: `var(--color-${agentId})`,
          borderColor: `color-mix(in srgb, var(--color-${agentId}) 40%, transparent)`,
        }}
        aria-disabled="true"
        aria-label={ariaLabel}
        aria-describedby={tooltipId}
      >
        ● In Battle{settlesLabel ? ` · settles ${settlesLabel}` : ''}
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className="absolute top-full left-0 mt-2 w-64 p-2 text-xs rounded-md shadow-lg z-20 leading-snug"
        style={{
          backgroundColor: 'var(--color-ink)',
          color: 'var(--color-paper)',
          visibility: tooltipOpen ? 'visible' : 'hidden',
        }}
        aria-hidden={!tooltipOpen}
      >
        {DELAY_COPY}
      </div>
    </span>
  );
}
```

The tooltip is now always-mounted (visibility-toggled) so `aria-describedby` always points to a valid DOM target, satisfying assistive-tech expectations.

- [ ] **Step 5: Update existing `tests/components/InBattlePill.test.tsx`**

Replace the contents with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InBattlePill } from '@/components/content/InBattlePill';

describe('InBattlePill', () => {
  const futureTime = new Date('2026-04-22T20:00:00Z').toISOString();

  it('shows "In Battle" label with settles-at time when provided', () => {
    render(<InBattlePill agentId="metheus" settlesAt={futureTime} />);
    expect(screen.getByText(/In Battle/)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName(/In battle, settles/);
  });

  it('shows "In Battle" without countdown when settlesAt is null', () => {
    render(<InBattlePill agentId="apex" settlesAt={null} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName('In battle');
    expect(button.textContent).not.toMatch(/settles/);
  });

  it('reveals the 30-min delay tooltip on hover', async () => {
    const user = userEvent.setup();
    render(<InBattlePill agentId="metheus" settlesAt={futureTime} />);
    const pill = screen.getByRole('button', { name: /In battle/ });
    await user.hover(pill);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/30-minute delay/i);
  });

  it('is aria-disabled in Track B (Battle Arena handler is V1.1)', () => {
    render(<InBattlePill agentId="apex" settlesAt={null} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not invoke onTap when clicked (aria-disabled no-op)', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    render(<InBattlePill agentId="apex" settlesAt={null} onTap={onTap} />);
    await user.click(screen.getByRole('button'));
    expect(onTap).not.toHaveBeenCalled();
  });

  it('uses agentId-driven accent color (not hardcoded Metheus)', () => {
    const { rerender } = render(<InBattlePill agentId="apex" settlesAt={null} />);
    const apexPill = screen.getByRole('button');
    expect(apexPill.getAttribute('style')).toContain('var(--color-apex)');

    rerender(<InBattlePill agentId="gale" settlesAt={null} />);
    const galePill = screen.getByRole('button');
    expect(galePill.getAttribute('style')).toContain('var(--color-gale)');
  });
});
```

- [ ] **Step 6: Update `tests/components/AgentCard.test.tsx` for the restructure**

Open `tests/components/AgentCard.test.tsx`. Add (or extend) tests verifying the no-nested-button structure and aria-expanded location. Append:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AgentCard } from '@/components/content/AgentCard';
import type { Agent } from '@/lib/types';

const makeAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'apex',
  name: 'Apex',
  nickname: 'The Striker',
  market_label: 'Decision markets',
  total_pnl: 12.5,
  record: { W: 4, L: 2, BE: 0, settled: 6 },
  brier_7d: { value: 0, n: 0 },
  cities_or_tags: ['decision'],
  moves: [],
  open_position: null,
  latest_receipt: null,
  state: 'live',
  ...overrides,
});

describe('AgentCard a11y restructure', () => {
  const noop = () => undefined;

  it('does NOT nest <button> inside <button>', () => {
    const agent = makeAgent({
      open_position: {
        contract_ticker: 'KX-ABC',
        entry_price_cents: 67,
        side: 'yes',
        size: 25,
        entered_at_delayed: new Date().toISOString(),
        settles_at: null,
      },
    });
    const { container } = render(
      <AgentCard
        agent={agent}
        expanded={false}
        onToggle={noop}
        currentWindow="24h"
        setWindow={noop}
      />,
    );
    const buttons = container.querySelectorAll('button');
    buttons.forEach((b) => {
      const inner = b.querySelector('button');
      expect(inner).toBeNull();
    });
  });

  it('puts aria-expanded on the summary button (not the article)', () => {
    const agent = makeAgent();
    render(
      <AgentCard
        agent={agent}
        expanded={false}
        onToggle={noop}
        currentWindow="24h"
        setWindow={noop}
      />,
    );
    const summaryButton = screen.getByRole('button', { name: /Expand Apex's card/ });
    expect(summaryButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the InBattlePill as a sibling of the summary button when an open position exists', () => {
    const agent = makeAgent({
      open_position: {
        contract_ticker: 'KX-ABC',
        entry_price_cents: 67,
        side: 'yes',
        size: 25,
        entered_at_delayed: new Date().toISOString(),
        settles_at: null,
      },
    });
    const { container } = render(
      <AgentCard
        agent={agent}
        expanded={false}
        onToggle={noop}
        currentWindow="24h"
        setWindow={noop}
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const summaryButton = screen.getByRole('button', { name: /Expand Apex's card/ });
    const battleButton = screen.getByRole('button', { name: /In battle/ });
    expect(summaryButton).not.toBe(battleButton);
    expect(battleButton.parentElement?.parentElement).toBe(summaryButton.parentElement);
  });
});
```

If existing tests in `tests/components/AgentCard.test.tsx` reference props that no longer exist, update them to use the new prop signature (`currentWindow`, `setWindow`). For any existing test that passes `expanded` and `onToggle`, simply add stub `currentWindow="24h"` and `setWindow={noop}` props.

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: all green; new InBattlePill suite has 6 tests, AgentCard a11y suite has 3 new tests. Existing tests for InBattlePill that referenced `screen.getByText(/In Battle/)` may need a settle-time match update if they relied on the old format — adjust as needed.

- [ ] **Step 8: Run typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean. Pre-existing chunk-size warning OK.

- [ ] **Step 9: Commit**

```bash
git add src/components/content/AgentCard.tsx \
        src/components/content/AgentCardCollapsedRow.tsx \
        src/components/content/AgentCardCollapsedRowInner.tsx \
        src/components/content/InBattlePill.tsx \
        tests/components/AgentCard.test.tsx \
        tests/components/InBattlePill.test.tsx
git commit -m "fix(track-b): a11y co-fix — hoist InBattlePill, drop nested-<button> bug"
```

---

## Task 7: Rework `useAgentData` to accept `windowsByAgent`, return `cardViewModels`

The data-layer refactor. This is the largest single task. Memoize per-agent fetches on `[agentId, window]` so a flip on Apex doesn't refetch Gale and Metheus.

**Files:**
- Modify: `src/lib/useAgentData.ts`

**Acceptance criteria (from Brandon's review):**
- Per-agent fetches MUST memoize on `[agentId, windowsByAgent[agentId]]`, NOT on `windowsByAgent` object identity
- Client MUST handle missing `agent_lifetime_stats` row (zeroed fallback shape)

- [ ] **Step 1: Replace `useAgentData.ts` with the new shape**

Replace the contents of `src/lib/useAgentData.ts` with:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { AGENT_META, AGENT_IDS } from './agentMeta';
import { mockLeaderboard, mockTradeLog, mockCardViewModels } from './mockData';
import type {
  Agent,
  AgentId,
  AgentLifetimeStats,
  LeaderboardResponse,
  OpenPosition,
  PerformanceWindow,
  Receipt,
  TradeLogEntry,
} from './types';

type Source = 'live' | 'mock';

interface AgentTradeRow {
  id: string;
  agent_id: AgentId;
  contract_ticker: string;
  side: 'yes' | 'no';
  entry_price: number | null;
  size: number;
  entered_at: string;
  settled_at: string | null;
  settle_price: number | null;
  pnl: number | null;
  move_used: string | null;
  created_at: string;
}

interface LifetimeStatsRow {
  agent_id: AgentId;
  settled: number;
  wins: number;
  losses: number;
  breakeven: number;
  total_pnl: number;
  open_count: number;
}

const COLUMNS =
  'id,agent_id,contract_ticker,side,entry_price,size,entered_at,settled_at,settle_price,pnl,move_used,created_at';

const ZERO_LIFETIME: Omit<LifetimeStatsRow, 'agent_id'> = {
  settled: 0,
  wins: 0,
  losses: 0,
  breakeven: 0,
  total_pnl: 0,
  open_count: 0,
};

function lowerBoundFor(window: PerformanceWindow): string | null {
  if (window === 'lifetime') return null;
  const now = Date.now();
  const ms = window === '24h' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
  return new Date(now - ms).toISOString();
}

function rowToTradeLogEntry(r: AgentTradeRow): TradeLogEntry | null {
  if (r.settled_at === null || r.pnl === null || r.entry_price === null || r.settle_price === null) {
    return null;
  }
  return {
    id: r.id,
    contract_ticker: r.contract_ticker,
    side: r.side,
    entry_price_cents: r.entry_price,
    size: r.size,
    entered_at: r.entered_at,
    settled_at: r.settled_at,
    settle_price_cents: r.settle_price,
    pnl: r.pnl,
    move_used: r.move_used,
  };
}

function buildAgent(
  id: AgentId,
  lifetime: LifetimeStatsRow,
  latestReceipt: AgentTradeRow | null,
  openPos: OpenPosition | null,
): Agent {
  const meta = AGENT_META[id];
  const latest_receipt: Receipt | null =
    latestReceipt && latestReceipt.settled_at !== null && latestReceipt.pnl !== null
      ? {
          id: `${id.toUpperCase().slice(0, 3)}-${latestReceipt.id.slice(0, 8).toUpperCase()}`,
          contract_ticker: latestReceipt.contract_ticker,
          side: latestReceipt.side,
          entry_price_cents: latestReceipt.entry_price ?? 0,
          settle_price_cents: latestReceipt.settle_price ?? 0,
          size: latestReceipt.size,
          pnl: latestReceipt.pnl,
          settled_at: latestReceipt.settled_at,
        }
      : null;

  return {
    id,
    name: meta.name,
    nickname: meta.nickname,
    market_label: meta.market_label,
    sprite_url: meta.sprite_url,
    total_pnl: lifetime.total_pnl,
    record: { W: lifetime.wins, L: lifetime.losses, BE: lifetime.breakeven, settled: lifetime.settled },
    brier_7d: { value: 0, n: 0 },
    cities_or_tags: meta.cities_or_tags,
    moves: meta.moves,
    open_position: openPos,
    latest_receipt,
    state: lifetime.settled > 0 ? 'live' : 'pending',
  };
}

export interface AgentCardViewModel {
  total_pnl: number;
  record: { W: number; L: number; BE: number; settled: number };
  tradeLog: TradeLogEntry[];        // capped at 25 for display
  windowSettledCount: number;       // full count from the window's settled rows
}

export interface UseAgentDataResult {
  data: LeaderboardResponse;
  cardViewModels: Record<AgentId, AgentCardViewModel>;
  source: Source;
  error: string | null;
  loading: boolean;
}

interface PerAgentCache {
  window: PerformanceWindow;
  vm: AgentCardViewModel;
}

const EMPTY_VM: AgentCardViewModel = {
  total_pnl: 0,
  record: { W: 0, L: 0, BE: 0, settled: 0 },
  tradeLog: [],
  windowSettledCount: 0,
};

export function useAgentData(
  windowsByAgent: Record<AgentId, PerformanceWindow>,
): UseAgentDataResult {
  const [data, setData] = useState<LeaderboardResponse>(mockLeaderboard);
  const [cardViewModels, setCardViewModels] = useState<Record<AgentId, AgentCardViewModel>>(
    mockCardViewModels,
  );
  const [source, setSource] = useState<Source>('mock');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  // Per-agent fetch cache keyed by [agentId, window]. Memoized so a window flip
  // on Apex does NOT trigger a refetch on Gale/Metheus. The ref outlives renders;
  // the effect only re-runs queries for agents whose window changed.
  const cacheRef = useRef<Partial<Record<AgentId, PerAgentCache>>>({});

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase not configured — using mock data');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // --- Lifetime aggregate (single query for all agents) ---
        const { data: lifetimeRows, error: lifetimeErr } = await supabase!
          .from('agent_lifetime_stats')
          .select('*');
        if (lifetimeErr) throw lifetimeErr;

        const lifetimeByAgent: Record<AgentId, LifetimeStatsRow> = {} as Record<AgentId, LifetimeStatsRow>;
        for (const id of AGENT_IDS) {
          const row = (lifetimeRows ?? []).find((r) => r.agent_id === id) as LifetimeStatsRow | undefined;
          // Brand-new agent with zero rows in agent_trades_public produces no
          // row from `group by agent_id`. Fall back to the zeroed shape.
          lifetimeByAgent[id] = row ?? { agent_id: id, ...ZERO_LIFETIME };
        }

        // --- Per-agent: latest receipt + open position + per-window log/stats ---
        const agents = await Promise.all(
          AGENT_IDS.map(async (id) => {
            const window = windowsByAgent[id] ?? '24h';

            // Latest receipt
            const { data: receiptRows, error: receiptErr } = await supabase!
              .from('agent_trades_public')
              .select(COLUMNS)
              .eq('agent_id', id)
              .not('pnl', 'is', null)
              .order('settled_at', { ascending: false })
              .limit(1);
            if (receiptErr) throw receiptErr;
            const latestReceipt = (receiptRows?.[0] as AgentTradeRow | undefined) ?? null;

            // Open position — separate query, server-side null filter, ordered by entered_at DESC
            const { data: openRows, error: openErr } = await supabase!
              .from('agent_trades_public')
              .select(COLUMNS)
              .eq('agent_id', id)
              .is('settled_at', null)
              .is('pnl', null)
              .not('entry_price', 'is', null)
              .order('entered_at', { ascending: false })
              .limit(5);
            if (openErr) throw openErr;
            const eligibleOpens = (openRows ?? []) as AgentTradeRow[];
            const latestOpen = eligibleOpens[0] ?? null;
            if (eligibleOpens.length > 1) {
              // eslint-disable-next-line no-console
              console.warn(`[useAgentData] ${id}: ${eligibleOpens.length} eligible opens; using latest`);
            }
            const open_position: OpenPosition | null = latestOpen
              ? {
                  contract_ticker: latestOpen.contract_ticker,
                  entry_price_cents: latestOpen.entry_price,        // non-null by server filter
                  side: latestOpen.side,
                  size: latestOpen.size,
                  entered_at_delayed: latestOpen.entered_at,
                  settles_at: null,                                  // V1: market metadata source not available
                }
              : null;

            // Per-window card view model (memoized per-agent)
            const cached = cacheRef.current[id];
            let vm: AgentCardViewModel;
            if (cached && cached.window === window) {
              vm = cached.vm;
            } else {
              vm = await fetchCardViewModel(id, window, lifetimeByAgent[id]);
              cacheRef.current[id] = { window, vm };
            }

            return { agent: buildAgent(id, lifetimeByAgent[id], latestReceipt, open_position), vm };
          }),
        );

        if (cancelled) return;

        const newViewModels: Record<AgentId, AgentCardViewModel> = {} as Record<AgentId, AgentCardViewModel>;
        for (const { agent, vm } of agents) {
          newViewModels[agent.id] = vm;
        }

        setData({
          updated_at: new Date().toISOString(),
          agents: agents.map((a) => a.agent),
        });
        setCardViewModels(newViewModels);
        setSource('live');
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Effect re-runs when ANY agent's window changes; the per-agent cache
    // ensures we only refetch the agent whose window actually flipped.
  }, [windowsByAgent.apex, windowsByAgent.gale, windowsByAgent.metheus]);

  return { data, cardViewModels, source, error, loading };
}

async function fetchCardViewModel(
  id: AgentId,
  window: PerformanceWindow,
  lifetime: LifetimeStatsRow,
): Promise<AgentCardViewModel> {
  if (window === 'lifetime') {
    // Stats from aggregate view (already fetched). Display rows: latest 25 closed.
    const { data: rows, error } = await supabase!
      .from('agent_trades_public')
      .select(COLUMNS)
      .eq('agent_id', id)
      .not('pnl', 'is', null)
      .order('settled_at', { ascending: false })
      .limit(25);
    if (error) throw error;
    const tradeLog = (rows ?? [])
      .map(rowToTradeLogEntry)
      .filter((e): e is TradeLogEntry => e !== null);
    return {
      total_pnl: lifetime.total_pnl,
      record: { W: lifetime.wins, L: lifetime.losses, BE: lifetime.breakeven, settled: lifetime.settled },
      tradeLog,
      windowSettledCount: lifetime.settled,
    };
  }

  // 24h or 7d: fetch all settled rows in window, aggregate client-side. Bounded row counts.
  const lowerBound = lowerBoundFor(window)!;
  const { data: rows, error } = await supabase!
    .from('agent_trades_public')
    .select(COLUMNS)
    .eq('agent_id', id)
    .not('pnl', 'is', null)
    .gte('settled_at', lowerBound)
    .order('settled_at', { ascending: false });
  if (error) throw error;

  const closed = (rows ?? []) as AgentTradeRow[];
  let total_pnl = 0;
  let W = 0;
  let L = 0;
  let BE = 0;
  for (const r of closed) {
    const p = r.pnl ?? 0;
    total_pnl += p;
    if (p > 0) W += 1;
    else if (p < 0) L += 1;
    else BE += 1;
  }
  const tradeLog = closed
    .slice(0, 25)
    .map(rowToTradeLogEntry)
    .filter((e): e is TradeLogEntry => e !== null);

  return {
    total_pnl,
    record: { W, L, BE, settled: closed.length },
    tradeLog,
    windowSettledCount: closed.length,
  };
}

export { EMPTY_VM };
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: errors related to mock data exports (`mockTradeLog`, `mockCardViewModels`) — those land in Task 8. All other types should resolve.

- [ ] **Step 3: Commit (defer running tests until Task 8 wires mock data)**

```bash
git add src/lib/useAgentData.ts
git commit -m "feat(track-b): rework useAgentData with windowsByAgent + cardViewModels (per-agent memoized)"
```

---

## Task 8: Update mock data — `mockTradeLog`, `mockCardViewModels`, `mockLifetimeStats`

**Files:**
- Modify: `src/lib/mockData.ts`

**Acceptance criterion (from Brandon's review):** `mockTradeLog` MUST have a row distribution that exercises 24h / 7d / Lifetime UI paths distinctly. Targets: at least 3 rows per agent in last 24h, ~12 rows per agent in last 7d, ~50 rows per agent lifetime.

- [ ] **Step 1: Read current `mockData.ts`**

Run: `cat src/lib/mockData.ts`
Confirm exports: `mockLeaderboard`. Note: existing structure may differ slightly; preserve any utilities you find.

- [ ] **Step 2: Add `mockTradeLog`, `mockCardViewModels`, `mockLifetimeStats` exports**

Append to `src/lib/mockData.ts` (or restructure — keep existing `mockLeaderboard` working):

```ts
import type {
  AgentId,
  AgentLifetimeStats,
  TradeLogEntry,
} from './types';
import type { AgentCardViewModel } from './useAgentData';

const TICKERS = ['KXFEDDECISION-26MAY', 'KXNYCMAYOR-26NOV', 'KXTECHEARN-26Q2'];

function makeRow(
  id: string,
  agentId: AgentId,
  hoursAgo: number,
  pnl: number,
  side: 'yes' | 'no' = 'yes',
): TradeLogEntry {
  const settledAt = new Date(Date.now() - hoursAgo * 3600 * 1000);
  const enteredAt = new Date(settledAt.getTime() - 30 * 60 * 1000);  // 30-min holding default
  const ticker = TICKERS[Math.floor(Math.abs(pnl)) % TICKERS.length];
  return {
    id: `${agentId}-${id.padStart(8, '0')}`,
    contract_ticker: ticker,
    side,
    entry_price_cents: 67,
    size: 25,
    entered_at: enteredAt.toISOString(),
    settled_at: settledAt.toISOString(),
    settle_price_cents: pnl >= 0 ? 71 : 64,
    pnl,
    move_used: null,
  };
}

function generateLog(agentId: AgentId): TradeLogEntry[] {
  const rows: TradeLogEntry[] = [];
  // 24h: 3+ rows distributed within 24h
  for (let i = 0; i < 4; i++) {
    rows.push(makeRow(`24h${i}`, agentId, 1 + i * 5, (i % 2 === 0 ? 1 : -1) * (1 + i * 0.5)));
  }
  // 24h-7d window: ~9 more so 7d total = ~13
  for (let i = 0; i < 9; i++) {
    rows.push(makeRow(`7d${i}`, agentId, 25 + i * 12, (i % 3 === 0 ? -1 : 1) * (2 + i * 0.3)));
  }
  // 7d-lifetime: ~37 more so lifetime total = ~50
  for (let i = 0; i < 37; i++) {
    rows.push(makeRow(`life${i}`, agentId, 7 * 24 + 6 + i * 24, (i % 4 === 0 ? -1 : 1) * (1 + (i % 5))));
  }
  // Sort newest-first
  rows.sort((a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime());
  return rows;
}

export const mockTradeLog: Record<AgentId, TradeLogEntry[]> = {
  apex: generateLog('apex'),
  gale: generateLog('gale'),
  metheus: generateLog('metheus'),
};

function aggregate(rows: TradeLogEntry[], hoursWindow: number | null) {
  const cutoff = hoursWindow !== null ? Date.now() - hoursWindow * 3600 * 1000 : null;
  const inWindow = cutoff === null
    ? rows
    : rows.filter((r) => new Date(r.settled_at).getTime() >= cutoff);
  let total_pnl = 0;
  let W = 0;
  let L = 0;
  let BE = 0;
  for (const r of inWindow) {
    total_pnl += r.pnl;
    if (r.pnl > 0) W += 1;
    else if (r.pnl < 0) L += 1;
    else BE += 1;
  }
  return { total_pnl, record: { W, L, BE, settled: inWindow.length }, inWindow };
}

function buildVm(agentId: AgentId): AgentCardViewModel {
  // 24h is the default window for the card view model
  const { total_pnl, record, inWindow } = aggregate(mockTradeLog[agentId], 24);
  return {
    total_pnl,
    record,
    tradeLog: inWindow.slice(0, 25),
    windowSettledCount: inWindow.length,
  };
}

export const mockCardViewModels: Record<AgentId, AgentCardViewModel> = {
  apex: buildVm('apex'),
  gale: buildVm('gale'),
  metheus: buildVm('metheus'),
};

function buildLifetimeStats(agentId: AgentId): AgentLifetimeStats {
  const { total_pnl, record } = aggregate(mockTradeLog[agentId], null);
  return {
    agent_id: agentId,
    settled: record.settled,
    wins: record.W,
    losses: record.L,
    breakeven: record.BE,
    total_pnl,
    open_count: agentId === 'metheus' ? 1 : 0,
  };
}

export const mockLifetimeStats: Record<AgentId, AgentLifetimeStats> = {
  apex: buildLifetimeStats('apex'),
  gale: buildLifetimeStats('gale'),
  metheus: buildLifetimeStats('metheus'),
};
```

- [ ] **Step 3: Update existing `mockLeaderboard` so Metheus has an open position**

Find the Metheus entry in `mockLeaderboard.agents` and update `open_position`:

```ts
open_position: {
  contract_ticker: 'KXTECHEARN-26Q2',
  entry_price_cents: 67,
  side: 'yes',
  size: 25,
  entered_at_delayed: new Date(Date.now() - 45 * 60 * 1000).toISOString(),  // 45 min ago
  settles_at: null,                                                          // V1 default
},
```

(Keep Apex and Gale `open_position: null`.)

- [ ] **Step 4: Run typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean. The `useAgentData` import path resolves; all existing tests pass.

- [ ] **Step 5: Run dev server smoke test**

Run: `npm run dev` (in background or another terminal)
Visit: `http://localhost:5173/gym`
Expected: Three agent cards render (mock data, since Supabase may be live or mocked depending on env). No JS console errors. Metheus's card shows an "In Battle" pill.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mockData.ts
git commit -m "feat(track-b): mock data for trade log + card view models + lifetime stats"
```

---

## Task 9: Time-filter pill component + GymPage hook lift

**Files:**
- Create: `src/components/content/TimeFilterPill.tsx`
- Create: `tests/components/TimeFilterPill.test.tsx`
- Modify: `src/pages/GymPage.tsx`

- [ ] **Step 1: Write failing tests for `TimeFilterPill`**

Create `tests/components/TimeFilterPill.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeFilterPill } from '@/components/content/TimeFilterPill';

describe('TimeFilterPill', () => {
  it('renders three radio options', () => {
    render(
      <TimeFilterPill agentId="apex" agentName="Apex" currentWindow="24h" setWindow={() => undefined} />,
    );
    expect(screen.getByRole('radio', { name: /24h/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /7d/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Lifetime/ })).toBeInTheDocument();
  });

  it('marks the current window as checked', () => {
    render(
      <TimeFilterPill agentId="apex" agentName="Apex" currentWindow="7d" setWindow={() => undefined} />,
    );
    expect(screen.getByRole('radio', { name: /7d/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /24h/ })).not.toBeChecked();
  });

  it('calls setWindow when a different option is selected', async () => {
    const user = userEvent.setup();
    const setWindow = vi.fn();
    render(
      <TimeFilterPill agentId="apex" agentName="Apex" currentWindow="24h" setWindow={setWindow} />,
    );
    await user.click(screen.getByRole('radio', { name: /Lifetime/ }));
    expect(setWindow).toHaveBeenCalledWith('lifetime');
  });

  it('uses an agent-scoped name attribute so multiple groups coexist', () => {
    const { container } = render(
      <TimeFilterPill agentId="metheus" agentName="Metheus" currentWindow="24h" setWindow={() => undefined} />,
    );
    const radios = container.querySelectorAll('input[type="radio"]');
    radios.forEach((r) => expect(r.getAttribute('name')).toBe('window-metheus'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/components/TimeFilterPill.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `TimeFilterPill`**

Create `src/components/content/TimeFilterPill.tsx`:

```tsx
import type { AgentId, PerformanceWindow } from '@/lib/types';

interface Props {
  agentId: AgentId;
  agentName: string;
  currentWindow: PerformanceWindow;
  setWindow: (w: PerformanceWindow) => void;
}

const WINDOWS: ReadonlyArray<PerformanceWindow> = ['24h', '7d', 'lifetime'];

const LABELS: Record<PerformanceWindow, string> = {
  '24h': '24h',
  '7d': '7d',
  lifetime: 'Lifetime',
};

/**
 * Native radio-input segmented control. Free keyboard nav (arrow keys to cycle,
 * Tab to leave the group), free aria-checked, free form semantics. CSS hides
 * the radio circle and styles the <label>'s child <span> as the segment.
 */
export function TimeFilterPill({ agentId, agentName, currentWindow, setWindow }: Props) {
  return (
    <fieldset
      className="time-filter-pill flex items-center gap-1 rounded-full border px-1 py-0.5"
      style={{
        borderColor: 'var(--color-border-default)',
        backgroundColor: 'var(--color-paper-raised)',
      }}
      aria-label="Time window"
    >
      <legend className="sr-only">Time window for {agentName}'s stats and trade log</legend>
      {WINDOWS.map((w) => (
        <label
          key={w}
          className="time-filter-pill__option relative cursor-pointer text-xs font-medium px-2 py-1 rounded-full"
          style={{
            color:
              currentWindow === w
                ? 'var(--color-ink)'
                : 'var(--color-ink-muted)',
            outline:
              currentWindow === w
                ? `1px solid color-mix(in srgb, var(--color-${agentId}) 55%, transparent)`
                : 'none',
            backgroundColor:
              currentWindow === w
                ? `color-mix(in srgb, var(--color-${agentId}) 15%, transparent)`
                : 'transparent',
          }}
        >
          <input
            type="radio"
            name={`window-${agentId}`}
            value={w}
            checked={currentWindow === w}
            onChange={() => setWindow(w)}
            className="sr-only"
          />
          <span>{LABELS[w]}</span>
        </label>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/components/TimeFilterPill.test.tsx`
Expected: PASS, 4/4.

- [ ] **Step 5: Update `GymPage` to own per-agent `useAgentWindow` hooks**

Edit `src/pages/GymPage.tsx`. At the top of the `GymPage` function (after the existing hook calls), add:

```tsx
import { useAgentWindow } from '@/lib/useAgentWindow';
import type { AgentId, PerformanceWindow } from '@/lib/types';
```

Inside the component:

```tsx
const [apexWindow, setApexWindow] = useAgentWindow('apex');
const [galeWindow, setGaleWindow] = useAgentWindow('gale');
const [metheusWindow, setMetheusWindow] = useAgentWindow('metheus');

const windowsByAgent = useMemo<Record<AgentId, PerformanceWindow>>(
  () => ({ apex: apexWindow, gale: galeWindow, metheus: metheusWindow }),
  [apexWindow, galeWindow, metheusWindow],
);

const setWindowForAgent = (id: AgentId): ((w: PerformanceWindow) => void) => {
  if (id === 'apex') return setApexWindow;
  if (id === 'gale') return setGaleWindow;
  return setMetheusWindow;
};

const currentWindowForAgent = (id: AgentId): PerformanceWindow => windowsByAgent[id];
```

(Add `useMemo` to the React imports if not already present.)

Update the existing `useAgentData()` call:
```ts
const { data, source, error: dataError } = useAgentData(windowsByAgent);
```

Update the `<AgentCard ... />` render around line 224 to thread the new props:
```tsx
<AgentCard
  agent={agent}
  expanded={focusId === agent.id}
  onToggle={() => setFocusId(focusId === agent.id ? null : agent.id)}
  currentWindow={currentWindowForAgent(agent.id)}
  setWindow={setWindowForAgent(agent.id)}
/>
```

(Match the existing prop names for `expanded` / `onToggle`; this snippet shows both new and existing.)

- [ ] **Step 6: Run typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean. All tests pass.

- [ ] **Step 7: Run dev server smoke**

Run: `npm run dev`
Visit: `http://localhost:5173/gym`, expand any agent card.
Expected: Time-filter pill renders inside expanded body. Clicking 7d / Lifetime updates localStorage (verify in devtools Application > Local Storage).

- [ ] **Step 8: Commit**

```bash
git add src/components/content/TimeFilterPill.tsx \
        tests/components/TimeFilterPill.test.tsx \
        src/pages/GymPage.tsx
git commit -m "feat(track-b): TimeFilterPill component + GymPage hook lift"
```

---

## Task 10: Unified trade log component (replaces Latest Receipt panel)

**Files:**
- Create: `src/components/content/TradeLog.tsx`
- Create: `tests/components/TradeLog.test.tsx`
- Modify: `src/components/content/AgentCardExpandedBody.tsx`

- [ ] **Step 1: Write failing tests for `TradeLog`**

Create `tests/components/TradeLog.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TradeLog } from '@/components/content/TradeLog';
import type { TradeLogEntry } from '@/lib/types';

const makeEntry = (id: string, pnl: number): TradeLogEntry => ({
  id,
  contract_ticker: 'KXFEDDECISION-26MAY',
  side: 'yes',
  entry_price_cents: 67,
  size: 25,
  entered_at: new Date('2026-04-25T20:00:00Z').toISOString(),
  settled_at: new Date('2026-04-25T20:30:00Z').toISOString(),
  settle_price_cents: pnl >= 0 ? 71 : 64,
  pnl,
  move_used: null,
});

describe('TradeLog', () => {
  it('shows window count in header', () => {
    const rows = [makeEntry('apex-1', 2), makeEntry('apex-2', -1)];
    render(<TradeLog rows={rows} windowSettledCount={2} window="24h" hasOpenPosition={false} />);
    expect(screen.getByText(/Trades/)).toBeInTheDocument();
    expect(screen.getByText(/24h/)).toBeInTheDocument();
    expect(screen.getByText(/2 settled/)).toBeInTheDocument();
  });

  it('shows "Latest 25 of N" footer when windowSettledCount > 25', () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeEntry(`apex-${i}`, i % 3 === 0 ? -1 : 1));
    render(<TradeLog rows={rows} windowSettledCount={143} window="lifetime" hasOpenPosition={false} />);
    expect(screen.getByText(/Latest 25 of 143/)).toBeInTheDocument();
  });

  it('does NOT show the footer when windowSettledCount <= 25', () => {
    const rows = [makeEntry('apex-1', 2)];
    render(<TradeLog rows={rows} windowSettledCount={1} window="24h" hasOpenPosition={false} />);
    expect(screen.queryByText(/Latest \d+ of/)).not.toBeInTheDocument();
  });

  it('shows empty state copy when no rows', () => {
    render(<TradeLog rows={[]} windowSettledCount={0} window="24h" hasOpenPosition={false} />);
    expect(screen.getByText(/No settled trades in 24h\. Try 7d\./i)).toBeInTheDocument();
  });

  it('uses "no settled trades" copy (not "no trades") when an open position exists', () => {
    render(<TradeLog rows={[]} windowSettledCount={0} window="24h" hasOpenPosition={true} />);
    expect(screen.getByText(/No settled trades/i)).toBeInTheDocument();
    expect(screen.queryByText(/No trades(?! settled)/i)).not.toBeInTheDocument();
  });

  it('empty-state suggests 7d for 24h window, lifetime for 7d window', () => {
    const { rerender } = render(
      <TradeLog rows={[]} windowSettledCount={0} window="24h" hasOpenPosition={false} />,
    );
    expect(screen.getByText(/Try 7d/)).toBeInTheDocument();

    rerender(<TradeLog rows={[]} windowSettledCount={0} window="7d" hasOpenPosition={false} />);
    expect(screen.getByText(/Try Lifetime/)).toBeInTheDocument();
  });

  it('empty-state at lifetime gives no escape hatch', () => {
    render(<TradeLog rows={[]} windowSettledCount={0} window="lifetime" hasOpenPosition={false} />);
    expect(screen.getByText(/No settled trades yet\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Try/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/components/TradeLog.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `TradeLog`**

Create `src/components/content/TradeLog.tsx`:

```tsx
import type { PerformanceWindow, TradeLogEntry } from '@/lib/types';
import { formatPnl } from '@/lib/formatting';

interface Props {
  rows: TradeLogEntry[];
  windowSettledCount: number;
  window: PerformanceWindow;
  hasOpenPosition: boolean;
}

const WINDOW_LABEL: Record<PerformanceWindow, string> = {
  '24h': '24h',
  '7d': '7d',
  lifetime: 'Lifetime',
};

const NEXT_WINDOW: Partial<Record<PerformanceWindow, string>> = {
  '24h': '7d',
  '7d': 'Lifetime',
};

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function shortReceiptId(id: string) {
  // mockTradeLog uses `<agentId>-<padded>`; live data uses raw uuid. Take first 8 hex chars.
  const hex = id.split('-').slice(-1)[0];
  return hex.slice(0, 8).toUpperCase();
}

function FirstRow({ row }: { row: TradeLogEntry }) {
  const isGain = row.pnl >= 0;
  return (
    <div
      className="p-3 rounded-lg border"
      style={{
        backgroundColor: 'var(--color-paper-raised)',
        borderColor: 'var(--color-border-default)',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
          {shortReceiptId(row.id)}
        </span>
        <span
          className="text-sm font-medium tabular-nums"
          style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
        >
          {formatPnl(row.pnl)}
        </span>
      </div>
      <div className="text-xs tabular-nums truncate" style={{ color: 'var(--color-ink)' }}>
        {row.contract_ticker} · {row.side.toUpperCase()} {row.entry_price_cents}¢→{row.settle_price_cents}¢ · size {row.size} · {fmtTime(row.settled_at)}
      </div>
    </div>
  );
}

function LedgerRow({ row }: { row: TradeLogEntry }) {
  const isGain = row.pnl >= 0;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs tabular-nums">
      <span className="font-mono text-[10px] flex-shrink-0" style={{ color: 'var(--color-ink-muted)' }}>
        {shortReceiptId(row.id)}
      </span>
      <span className="truncate flex-1" style={{ color: 'var(--color-ink)' }}>
        {row.side.toUpperCase()} {row.entry_price_cents}¢→{row.settle_price_cents}¢
      </span>
      <span className="flex-shrink-0" style={{ color: 'var(--color-ink-muted)' }}>
        {row.size}
      </span>
      <span
        className="flex-shrink-0 font-medium"
        style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
      >
        {formatPnl(row.pnl)}
      </span>
      <span className="flex-shrink-0 text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
        {fmtTime(row.settled_at)}
      </span>
    </div>
  );
}

export function TradeLog({ rows, windowSettledCount, window, hasOpenPosition }: Props) {
  if (windowSettledCount === 0) {
    const noun = hasOpenPosition ? 'No settled trades' : 'No settled trades';
    const next = NEXT_WINDOW[window];
    const trySuggestion = next ? ` Try ${next}.` : '';
    const lifetimeCopy = window === 'lifetime' ? 'No settled trades yet.' : `${noun} in ${WINDOW_LABEL[window]}.${trySuggestion}`;
    return (
      <div
        className="text-center text-xs py-6"
        style={{ color: 'var(--color-ink-muted)' }}
      >
        {lifetimeCopy}
      </div>
    );
  }

  const [first, ...rest] = rows;
  const showFooter = windowSettledCount > 25;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-ink-muted)' }}>
        <span>Trades · {WINDOW_LABEL[window]}</span>
        <span>{windowSettledCount} settled</span>
      </div>
      <FirstRow row={first} />
      {rest.length > 0 && (
        <div className="divide-y" style={{ borderColor: 'var(--color-border-default)' }}>
          {rest.map((row) => (
            <LedgerRow key={row.id} row={row} />
          ))}
        </div>
      )}
      {showFooter && (
        <div className="text-[10px] text-right" style={{ color: 'var(--color-ink-muted)' }}>
          Latest 25 of {windowSettledCount}
        </div>
      )}
      <p className="text-[9px] mt-1 leading-tight" style={{ color: 'var(--color-ink-muted)' }}>
        Settlements shown after 30-minute delay.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/components/TradeLog.test.tsx`
Expected: PASS, 7/7.

- [ ] **Step 5: Wire `TradeLog` into `AgentCardExpandedBody`**

Edit `src/components/content/AgentCardExpandedBody.tsx`. Update the `Props` interface:

```tsx
import type { Agent, PerformanceWindow } from '@/lib/types';
import type { AgentCardViewModel } from '@/lib/useAgentData';
import { TradeLog } from './TradeLog';
import { TimeFilterPill } from './TimeFilterPill';
// (preserve existing imports)

interface ExpandedBodyProps {
  agent: Agent;
  currentWindow: PerformanceWindow;
  setWindow: (w: PerformanceWindow) => void;
  cardViewModel: AgentCardViewModel;
}

export function AgentCardExpandedBody({ agent, currentWindow, setWindow, cardViewModel }: ExpandedBodyProps) {
  // ...existing weather + receipt logic stays the same...
  // (keep the activeCity, weather, etc.)
```

At the top of the returned JSX (before the Market+Status grid), insert:

```tsx
<TimeFilterPill
  agentId={agent.id}
  agentName={agent.name}
  currentWindow={currentWindow}
  setWindow={setWindow}
/>
```

Replace the entire `{receipt && <div ...>...</div>}` block (lines ~189-252 of the existing component) with:

```tsx
<TradeLog
  rows={cardViewModel.tradeLog}
  windowSettledCount={cardViewModel.windowSettledCount}
  window={currentWindow}
  hasOpenPosition={agent.open_position !== null}
/>
```

Update the `Record` block to read from `cardViewModel.record` instead of `agent.record`:

```tsx
{cardViewModel.record.settled > 0 && (
  <div>
    <div
      className="text-[10px] uppercase tracking-wide"
      style={{ color: 'var(--color-ink-muted)' }}
    >
      Record
    </div>
    <div className="tabular-nums">
      {cardViewModel.record.W}W / {cardViewModel.record.L}L / {cardViewModel.record.BE}BE ·{' '}
      {cardViewModel.record.settled} settled
    </div>
  </div>
)}
```

- [ ] **Step 6: Update `AgentCard` to thread `cardViewModel` through**

Edit `src/components/content/AgentCard.tsx`. Add to `Props`:

```tsx
cardViewModel: AgentCardViewModel;
```

Pass it to the expanded body:
```tsx
<AgentCardExpandedBody
  agent={agent}
  currentWindow={currentWindow}
  setWindow={setWindow}
  cardViewModel={cardViewModel}
/>
```

Remember to import `AgentCardViewModel` from `@/lib/useAgentData`.

- [ ] **Step 7: Update `GymPage` to pass `cardViewModel` to each AgentCard**

In `src/pages/GymPage.tsx`, update the destructure of `useAgentData`:

```tsx
const { data, cardViewModels, source, error: dataError } = useAgentData(windowsByAgent);
```

In the `<AgentCard ... />` render:

```tsx
<AgentCard
  agent={agent}
  expanded={focusId === agent.id}
  onToggle={() => setFocusId(focusId === agent.id ? null : agent.id)}
  currentWindow={currentWindowForAgent(agent.id)}
  setWindow={setWindowForAgent(agent.id)}
  cardViewModel={cardViewModels[agent.id]}
/>
```

- [ ] **Step 8: Run typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

- [ ] **Step 9: Run dev server visual smoke**

Run: `npm run dev`. Expand each card; flip the time filter. Verify:
- Trade log renders rows; first row is visually emphasized
- Empty state appears for `lifetime` agent with 0 mock trades (not applicable with current mock distribution; check with manual override if desired)
- "Latest 25 of N" footer shows for `lifetime` (since mock has ~50 rows)

- [ ] **Step 10: Commit**

```bash
git add src/components/content/TradeLog.tsx \
        src/components/content/AgentCardExpandedBody.tsx \
        src/components/content/AgentCard.tsx \
        src/pages/GymPage.tsx \
        tests/components/TradeLog.test.tsx
git commit -m "feat(track-b): unified trade log replaces Latest Receipt panel; TimeFilterPill wired"
```

---

## Task 11: Open-position rendering end-to-end

The data path was already wired in Task 7 (`open_position` populated from latest eligible row, server-filtered). Task 6 fixed the InBattlePill structurally. This task is the final integration: confirm the InBattlePill renders for Metheus's mock open, exercises the visual + a11y paths, and that switching windows does NOT affect open-position visibility.

**Files:**
- (No new files; integration verification of Tasks 6/7/8.)

- [ ] **Step 1: Run dev server**

Run: `npm run dev`. Visit `http://localhost:5173/gym`.

- [ ] **Step 2: Verify Metheus shows the In Battle pill on collapsed view**

Expected: Metheus card shows "● In Battle" (no countdown — `settles_at: null` in mock). Pill is on the right side of the row, sibling to the summary button.

- [ ] **Step 3: Verify clicking Metheus's name/area expands but pill click is no-op**

- Click anywhere on Metheus's name/avatar → card expands.
- Click the In Battle pill → no expansion change (was bug previously where pill click bubbled). Pill is `aria-disabled` → no Battle Arena route either (that's V1.1).

- [ ] **Step 4: Verify keyboard tab order via DevTools (or manual Tab)**

- Tab into the page, verify Tab reaches: Apex summary button → Apex pill (none if no open) → Gale summary button → Gale pill (none) → Metheus summary button → Metheus In Battle pill → next page element.

- [ ] **Step 5: Flip Metheus window 24h → 7d → Lifetime**

- Expand Metheus's card, change time filter to 7d.
- The In Battle pill remains visible (open position is independent of window).
- Trade log + stats reflow.
- Apex and Gale do NOT refetch (verify in Network tab — only Metheus's queries fire). This validates Brandon's per-agent memoization acceptance criterion.

- [ ] **Step 6: Verify with Playwright MCP at desktop viewport (1440×900) and mobile (390×844)**

If a Playwright MCP browser is available (see prior session pattern), navigate to the app, screenshot at both viewports, confirm visual placement.

If Playwright is unavailable, manual eyeball at desktop browser + browser DevTools mobile-emulator (iPhone 13 = 390×844).

- [ ] **Step 7: Run full test suite + build**

Run: `npm test && npm run build`
Expected: all green; build clean (pre-existing chunk warning OK).

- [ ] **Step 8: Commit (verification-only commit allowed empty if no code changes)**

```bash
git commit --allow-empty -m "test(track-b): verify open-position end-to-end rendering"
```

---

## Task 12: Test-pass + Playwright visual verify (the spec testing matrix)

Final verification gate. Run through the spec's testing matrix; record results.

**Files:**
- (No new files; create a checklist artifact at the end if useful.)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass. New total ≈ 24 + 6 (useAgentWindow) + 4 (TimeFilterPill) + 7 (TradeLog) + extensions to AgentCard + InBattlePill = ~45+ tests.

- [ ] **Step 2: Run typecheck + build + lint**

Run: `npx tsc --noEmit && npm run build && npm run lint`
Expected: typecheck clean. Build clean (pre-existing chunk warning). Lint may have 10 pre-existing errors carried over; **no NEW lint errors** introduced by Track B. If new errors appear, fix them.

- [ ] **Step 3: Walk the testing matrix from the spec**

For each row in the spec's testing matrix (`docs/superpowers/specs/2026-04-26-phase-5-track-b-design.md` § Testing matrix), verify behavior in dev (or unit test). Cases include:
- 0 trades in 24h, has lifetime → empty state, state stays `'live'`
- Open + 0 closed in 24h → pill renders, copy says "no settled"
- Trade entered 29 min ago → row absent (server-filtered)
- Trade entered 31 min ago, `entry_price` null → suppressed (no pill)
- Lifetime > 25 closed rows → "Latest 25 of N" footer
- Filter switch 24h → 7d → Lifetime → reflows without flicker
- Cross-agent persistence → reload preserves both
- `isSupabaseConfigured = false` → mock fallback intact

- [ ] **Step 4: Run the curl security tests**

```bash
echo "Base table SELECT (must be 401/403):"
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades?select=*&limit=1"

echo "Public view (must be 200):"
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades_public?select=*&limit=1"

echo "Lifetime stats (must be 200):"
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_lifetime_stats?select=*"

echo "Edge Function (must be 200, 3 agents):"
curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/functions/v1/leaderboard" | jq '.agents | length'
```

Expected: 401/403, 200, 200, 3.

- [ ] **Step 5: Open PR**

Push the branch and open a PR:
```bash
git push -u origin phase-5-track-b
gh pr create --title "Phase 5 Track B: P&L filter + trade log + opens + a11y co-fix" --body "$(cat <<'EOF'
## Summary
- 24h / 7d / Lifetime time-window filter on AgentCard (pill in expanded body)
- Unified trade log replaces Latest Receipt panel (first row carries trust-receipt visual)
- Open positions render via the existing InBattlePill, populated from latest eligible row in agent_trades_public
- Nested-button HTML invalidity fixed: InBattlePill hoists to a sibling of the summary button
- Server-side delay enforcement via two new Supabase views; existing leaderboard Edge Function repointed; base-table anon SELECT revoked
- Per-agent memoized fetches: a window flip on Apex doesn't refetch Gale or Metheus

## Test plan
- [ ] `npm test` passes (≥45 tests)
- [ ] `npm run build` clean
- [ ] No new lint errors
- [ ] curl tests verify base-table 401, public-view 200, lifetime-view 200, Edge Function 200
- [ ] Manual Playwright/browser verify at 1440×900 + 390×844: filter pill, trade log empty/full states, In Battle pill, keyboard tab order
- [ ] Cross-agent localStorage persistence verified across reloads

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Mark plan complete**

Plan is complete when the PR is open and CI is green. Brandon reviews + squash-merges.

---

## Self-review checklist

- [x] **Spec coverage:** every locked decision in the spec maps to a task. Filter scope (Task 9 + 10), pill placement (Task 9 + 10), trade log unification (Task 10), empty state (Task 10), open-position detection (Task 7 + 11), InBattlePill restructure (Task 6), data flow split (Task 7), aggregate view + lifetime accuracy (Tasks 3 + 7), `settled_at` window filter (Task 7), state lifecycle from full closed (Task 7), native radios (Task 9), security boundary 1a/1b/Edge-Function-update (Tasks 3, 4, 5).
- [x] **Brandon's review additions:** migration split 1a/1b is explicit (Tasks 3 + 4 + 5); mock distribution targets 3/12/50 are encoded in Task 8; materialized-view note remains in spec deferred section.
- [x] **Brandon's plan-acceptance-criteria:** memoization on `[agentId, window]` (Task 7 step 1); missing-row fallback for `agent_lifetime_stats` (Task 7 step 1, `ZERO_LIFETIME`); JSDoc on `InBattlePill.onTap` (Task 6 step 4).
- [x] **Placeholder scan:** no "TBD", "TODO", or "implement later" outside intentional code-comment context (delay copy, V1.1 reservation noted in JSDoc).
- [x] **Type consistency:** `PerformanceWindow`, `TradeLogEntry`, `AgentLifetimeStats`, `AgentCardViewModel`, `OpenPosition` nullables, `Agent.open_position`, `useAgentData` return — all internally consistent across tasks.
- [x] **Code completeness:** every code step contains the actual code; no "see Task N" cross-references; commit messages are concrete.
