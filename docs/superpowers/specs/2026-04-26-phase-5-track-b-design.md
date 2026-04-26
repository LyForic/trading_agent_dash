---
title: "Phase 5 Track B — Agent-card P&L filter, trade log, opens, a11y"
type: design-spec
status: ready-for-review
created: 2026-04-26
updated: 2026-04-26
owner: Brandon
project: lyforic/trading-gym
phase: 5
tracks: ["P&L-filter (#2)", "trade-log (#3)", "open-position (#6)", "nested-button-a11y"]
---

# Phase 5 Track B — Design Spec

## Overview

Track B adds **performance-window-scoped trust** and **active-position visibility** to the AgentCard surface, while fixing a quietly-shipped HTML invalidity bug. Bundle scope:

- **#2 — P&L time filter:** 24h / 7d / Lifetime toggle on the agent card; rescopes P&L, WR, Record, AND the trade log.
- **#3 — Trade log:** Unified log replaces the existing single-row "Latest receipt" panel; first row preserves trust-receipt visual emphasis.
- **#6 — Open-position rendering:** Detects opens from `agent_trades` rows where `settled_at IS NULL AND pnl IS NULL`; renders via existing `InBattlePill`.
- **A11y co-fix:** AgentCard's outer `<button>` contains InBattlePill's inner `<button>` — invalid HTML. Restructure as siblings.

Bundle coherence: all four items touch `useAgentData` raw rows + AgentCard component shape. Same PR avoids three separate AgentCard rebases.

## Locked decisions (Brainstorm 2026-04-26 + Codex review passes)

| # | Decision | Rationale |
|---|---|---|
| (a) | **Filter scope coupled** — 24h/7d/Lifetime rescopes BOTH stats and log | One window, one truth. Simpler mental model. Cozy-game frame. |
| (b) | **Time-filter pill in expanded body only** — collapsed row stays at 96px | Default 24h is invisible UI for most users. Mobile density sacred. |
| (c) | **Trade log unifies with Latest Receipt panel** (Codex c4) | Same trade displayed twice today; one panel uses less mobile sheet height. |
| (d) | **Soft hint empty state with warm copy** (Codex d3) | Truthful (no auto-fallback lying about window selection); cozy-tone copy avoids dashboard-zero feel. |
| (#6) | **Latest eligible open row, no aggregation** | Singular pill, singular invitation. Aggregation across markets is dishonest. |
| (#6) | **Server-side delay enforcement (Supabase view)** | Sub-30-min rows must not reach client (network-panel leak). Solves delay policy ONCE, not three times in components. |
| (#6) | **`OpenPosition.settles_at` becomes nullable** | Don't fabricate from `entered_at + duration`; Apex's post-freeze 15-min markets make naive math unsafe. |
| (#6) | **`OpenPosition.entry_price_cents` becomes nullable; rows missing entry_price are filtered server-side** | Same "no fake data" rule as `settles_at`. `0¢` displayed for unknown is dishonest. Filter applied IN the Supabase query (`.not('entry_price', 'is', null)`) before order/limit, so a run of null rows can't hide an older usable open. |
| (#6) | **Separate open-position query ordered `entered_at DESC`** | Closed-row ordering by `settled_at` would push open rows (NULL `settled_at`) to the end. Open detection deserves its own projection. |
| (a11y) | **Hoist InBattlePill as sibling (Codex e3)** | Both stay native `<button>`. No `role="button"` workarounds. Drop the existing click-bubble guard. |
| (a11y) | **InBattlePill `onTap` inert in Track B** with `aria-disabled="true"` | Battle Arena handler is V1.1 scope. Inert + `aria-disabled` is honest; an unwired focusable button is a no-op trap. |
| (data flow) | **Split `useAgentData` return: `data` (global, lifetime-locked) + `cardViewModels` (per-agent windowed)** | Global surfaces (`TrustStrip`, `FooterTicker`, `VisitDeltaStrip`) keep accurate "Lifetime WR" labels. AgentCard reads from per-agent windowed view models. |
| (lifetime accuracy) | **Server-side aggregate view `agent_lifetime_stats` for lifetime rollups** | PostgREST `count: 'exact'` returns COUNT only — NOT SUM(pnl) or W/L/BE buckets. An aggregate view does the rollup with `count(*) filter (where pnl > 0)` etc., grants anon SELECT, and returns one row per agent. Eliminates the `.limit(500)` truncation risk Codex flagged. |
| (windowed scope) | **Closed-row windows filter by `settled_at`, not `entered_at`** | "Trades in 24h" means trades that SETTLED in the last 24h, not entries that opened in the last 24h. Filter dimension matches the user-facing label. |
| (state lifecycle) | **`agent.state` derives from FULL closed trades, not the windowed slice** | An agent with lifetime history but 0 settles in 24h must NOT flip to `state: 'pending'`. Lifecycle is global; windowed stats are scoped. |
| (UI) | **Native `<input type="radio">` for time-filter pill** | Free keyboard nav (arrow keys), free `aria-checked`, free form semantics. Custom `role="radio"` would require manual roving focus implementation. |
| (security) | **Revoke anon SELECT on base `agent_trades`; only `agent_trades_public` and `agent_lifetime_stats` are anon-readable** | Without this, anon clients bypass the public view by querying the base table directly — leaking sub-30-min rows. The view alone is not a security boundary. |
| (Edge Function) | **Update existing `leaderboard` Edge Function to query `agent_trades_public` instead of base table** | Existing Function uses anon key on base `agent_trades` (functions/leaderboard/index.ts:174,180). The base-table revoke would break it silently otherwise. |

## Architecture

Three layers, each with a clear boundary.

### Data layer (Supabase + types)
- New Supabase view `agent_trades_public` enforces 30-min delay at the boundary. Anon SELECT revoked on base `agent_trades`; granted only on the view.
- New Supabase aggregate view `agent_lifetime_stats` rolls up per-agent lifetime totals server-side.
- New exported `TradeLogEntry` and `AgentLifetimeStats` types (UI-facing, decoupled from DB row shape).
- `OpenPosition.settles_at` and `OpenPosition.entry_price_cents` both become nullable.

### State layer (per-agent window)
- localStorage-backed, key per agent: `gym:track-b:window:<agentId>`. Default `'24h'`.
- Hook `useAgentWindow(agentId)` lifted to `GymPage`; current window + setter passed via props.

### UI layer
- Collapsed row: InBattlePill hoists to sibling of summary `<button>`.
- Expanded body: time-filter pill at top; "Latest receipt" panel REPLACED by unified trade log.
- Open positions: detected from `settled_at IS NULL AND pnl IS NULL`, latest eligible row, separate query with server-side null-filter.

### Boundary discipline
- **P&L window** scopes closed-trade truth (stats + log) — applied per-agent in `cardViewModels`.
- **Open position** is current state, scoped by delay only — independent of the window.
- **Global surfaces** (`TrustStrip`, `FooterTicker`, `VisitDeltaStrip`) consume `data` (lifetime-locked aggregates from the aggregate view) — never per-agent windowed.
- **Lifecycle (`agent.state`)** derives from full closed trades — never from the windowed slice.

## Data layer

### Supabase migration

`supabase/migrations/20260426000000_agent_trades_public.sql` (timestamp filled at create time):

```sql
-- 1. Revoke base-table anon access. The public view becomes the only anon-readable path.
revoke select on agent_trades from anon;

-- 2. 30-min-delayed projection of agent_trades for public/anon consumption.
create view agent_trades_public as
select id, agent_id, contract_ticker, side, entry_price, size,
       entered_at, settled_at, settle_price, pnl, move_used, created_at
from agent_trades
where entered_at <= now() - interval '30 minutes'
  and (settled_at is null or settled_at <= now() - interval '30 minutes');

grant select on agent_trades_public to anon;

-- 3. Per-agent lifetime aggregates. Rolls up server-side so the client doesn't
-- need to fetch every row to compute totals (PostgREST count:'exact' returns
-- COUNT only — not SUM/filtered counts). Built ON the public view so the
-- 30-min delay floor applies to the rollup too.
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

**Security note:** This migration's correctness depends on (a) revoking base-table anon SELECT and (b) building `agent_lifetime_stats` ON `agent_trades_public` (not on base) so the delay floor applies. Verify post-deploy with these curl tests:

```bash
# Must return 401/403 — base-table SELECT is revoked
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades?select=*"

# Must return 200 with delay-respecting rows only
curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_trades_public?select=*&limit=5"

# Must return 200 with one row per agent
curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/agent_lifetime_stats?select=*"
```

The `apikey` and `Authorization` headers are required — without them, a 401 only proves "missing key," not "base SELECT revoked."

### Type changes (`src/lib/types.ts`)

```ts
// New, exported
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

export interface AgentLifetimeStats {
  agent_id: AgentId;
  settled: number;
  wins: number;
  losses: number;
  breakeven: number;
  total_pnl: number;
  open_count: number;
}

// Updated
export interface OpenPosition {
  contract_ticker: string;
  entry_price_cents: number | null;  // nullable for type completeness; the data layer filters null rows out
  side: 'yes' | 'no';
  size: number;
  entered_at_delayed: string;
  settles_at: string | null;          // nullable: "In Battle" without countdown when unknown
}
```

### `useAgentData.ts` shape

```ts
export interface AgentCardViewModel {
  // Per-agent, scoped to current window
  total_pnl: number;
  record: { W: number; L: number; BE: number; settled: number };
  tradeLog: TradeLogEntry[];        // closed rows in window, capped at 25 for display
  windowSettledCount: number;       // full count for the window (for "Latest 25 of N" footer)
}

export interface UseAgentDataResult {
  data: LeaderboardResponse;                              // global, lifetime-locked aggregates
  cardViewModels: Record<AgentId, AgentCardViewModel>;    // per-agent windowed
  source: Source;
  error: string | null;
  loading: boolean;
}
```

`useAgentData(windowsByAgent: Record<AgentId, PerformanceWindow>)` accepts the per-agent windows from `GymPage`. Internally:

- **Lifetime stats (for `data.agents[].total_pnl` / `record` / `state`):** ONE query for all agents:
  ```ts
  supabase.from('agent_lifetime_stats').select('*');
  ```
  Returns one row per agent with `total_pnl`, `wins`, `losses`, `breakeven`, `settled`, `open_count`. NOT scoped by window. `agent.state = settled > 0 ? 'live' : 'pending'`.

- **Latest receipt (for `data.agents[].latest_receipt`):** one query per agent for the most recent settled row:
  ```ts
  supabase.from('agent_trades_public')
    .select(COLUMNS).eq('agent_id', id)
    .not('pnl', 'is', null).order('settled_at', { ascending: false }).limit(1);
  ```

- **Open positions (for `data.agents[].open_position`):** one query per agent for the latest eligible open row:
  ```ts
  supabase.from('agent_trades_public')
    .select(COLUMNS).eq('agent_id', id)
    .is('settled_at', null).is('pnl', null)
    .not('entry_price', 'is', null)        // server-side filter; can't be after limit
    .order('entered_at', { ascending: false }).limit(5);  // small N for warning logging
  ```

- **Per-agent windowed log + stats (for `cardViewModels`):**
  - For `'24h'` and `'7d'`: ONE query per agent that fetches all rows with `settled_at >= now() - <interval>`, ordered `settled_at DESC`. No row limit (24h/7d row counts are bounded). Stats computed client-side from the result; `tradeLog` = first 25 rows; `windowSettledCount` = full result length.
  - For `'lifetime'`: TWO queries per agent — (i) `agent_lifetime_stats` row (already fetched above; reused), and (ii) `agent_trades_public.select(COLUMNS).eq('agent_id', id).not('pnl', 'is', null).order('settled_at', { ascending: false }).limit(25)` for display rows. Stats from the aggregate view; `tradeLog` from the limited fetch; `windowSettledCount = lifetimeStats.settled`.

`agent.state` derives from the **lifetime aggregate** (does the agent have any closed row ever?), NOT from `cardViewModels.<id>.record.settled`.

### Rationale: views (vs RPC)

Two views (`agent_trades_public` for projection + `agent_lifetime_stats` for rollup) cover all V1 needs without RPC complexity. Views are stable, cacheable, RLS-aware, and don't require Edge Function deploy. RPC reserved for if/when we need parameterized rollups (e.g., a `get_window_stats(agent_id, lower_bound)` RPC if 24h/7d row counts ever cross 10k per agent).

## Per-agent window state + time-filter pill

### State hook

`src/lib/useAgentWindow.ts`:

```ts
export type PerformanceWindow = '24h' | '7d' | 'lifetime';

export function useAgentWindow(agentId: AgentId): [PerformanceWindow, (w: PerformanceWindow) => void] {
  const key = `gym:track-b:window:${agentId}`;
  const [window, setWindowState] = useState<PerformanceWindow>(() => {
    try {
      if (typeof localStorage === 'undefined') return '24h';
      const raw = localStorage.getItem(key);
      return raw === '7d' || raw === 'lifetime' ? raw : '24h';
    } catch {
      return '24h';   // private mode / blocked storage
    }
  });
  const setWindow = (w: PerformanceWindow) => {
    setWindowState(w);
    try { localStorage.setItem(key, w); } catch { /* ignore */ }
  };
  return [window, setWindow];
}
```

Type renamed from `Window` → `PerformanceWindow` to avoid shadowing the DOM global. Both `getItem` and `setItem` wrapped in try/catch.

No eager writes — first `setWindow` call writes through. Default `'24h'` if nothing stored.

Lifted ownership: hook called once per agent in `GymPage` (current `App.tsx` is just router/providers); the resulting `windowsByAgent: Record<AgentId, PerformanceWindow>` map is passed to `useAgentData(windowsByAgent)` and individual `currentWindow + setWindow` are passed via props through `AgentCard` → `AgentCardExpandedBody`.

### Time-filter pill UI

Native `<input type="radio">` group rendered at top of expanded body, before the Market+Status grid:

```tsx
<fieldset className="time-filter-pill" aria-label="Time window">
  <legend className="sr-only">Time window for {agent.name}'s stats and trade log</legend>
  {(['24h', '7d', 'lifetime'] as const).map((w) => (
    <label key={w}>
      <input
        type="radio"
        name={`window-${agent.id}`}
        value={w}
        checked={currentWindow === w}
        onChange={() => setWindow(w)}
      />
      <span>{w === 'lifetime' ? 'Lifetime' : w}</span>
    </label>
  ))}
</fieldset>
```

Native radios give free keyboard nav (arrow keys to cycle, Tab to leave the group), free `aria-checked` semantics, and free form semantics. CSS hides the actual radio circle and styles the `<label>`'s child `<span>` as the segmented control. Selected segment outline: `1px solid color-mix(in srgb, var(--color-${agentId}) 55%, transparent)`.

Tab order: time-filter pill is first interactive control inside expanded body, before any tags/moves.

### Window-aware aggregation

Server-side: each agent's per-window query passes `settled_at >= now() - <interval>` for `'24h'` and `'7d'` (filter dimension is **`settled_at`**, matching the user-facing "trades that settled in the last 24h" framing). Lifetime omits the filter and uses `agent_lifetime_stats` for stats + a 25-row `settled_at DESC` query for display.

Client-side: `cardViewModels[agentId]` populated per the rules above. `total_pnl` and `record.W/L/BE/settled` from the aggregate (view OR client-aggregate-from-rows), NOT from the 25-row display fetch.

Display `tradeLog` capped to most recent 25 rows; `windowSettledCount` is the full count for the header copy ("Latest 25 of 143" footer).

## A11y co-fix (InBattlePill restructure)

### Tree change

Before:
```tsx
<article>
  <button onClick={toggleExpansion}>
    <AgentCardCollapsedRow>
      ...<InBattlePill> <button>...</button> </InBattlePill>
    </AgentCardCollapsedRow>
  </button>
</article>
```

After:
```tsx
<article>
  <div className="agent-card-row">
    <button
      className="agent-card-summary-btn"
      onClick={toggleExpansion}
      aria-expanded={canExpand ? expanded : undefined}
      aria-controls={`agent-${agent.id}-expanded`}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${agent.name}'s card`}
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
    <div id={`agent-${agent.id}-expanded`} className="px-3 pb-3 agent-card-expanded">
      <AgentCardExpandedBody ... />
    </div>
  )}
</article>
```

Changes:
- `AgentCardCollapsedRow` splits into `AgentCardCollapsedRowInner` (no pill) + the layout shell. The `data-role="in-battle-pill"` wrapper is removed entirely.
- `closest('[data-role="in-battle-pill"]')` guard in AgentCard's `toggleExpansion` is dropped (not needed — pill is no longer a descendant of the summary button).
- `aria-expanded` moves from `<article>` to the **summary button** itself. `aria-controls` references the expanded-body id.

### Layout

`.agent-card-row`:
```css
display: flex;
align-items: center;
gap: 8px;
position: relative;     /* tooltip anchor for InBattlePill */
```

Summary button takes `flex: 1`. Pill is fixed-content-width on the right (~120px when settle known, ~70px when null).

At 375px width: name truncates with ellipsis; pill never crowds beyond 120px.

### Tab order

Tab → summary button → InBattlePill (when present) → next agent's summary button. Both have visible focus rings via `outline: 2px solid var(--color-${agentId})` on `:focus-visible`.

### `InBattlePill` ARIA + props

```tsx
interface Props {
  agentId: AgentId;                  // drives accent color via CSS var, not hardcoded Metheus
  settlesAt: string | null;
  onTap?: () => void;                // unwired in Track B; reserved for V1.1 Battle Arena
}
```

- **Accent color:** the existing implementation hardcodes `var(--color-metheus)` — replace with `var(--color-${agentId})` so Apex/Gale opens render in their own color.
- **`aria-label`:** `settlesAt ? `In battle, settles ${time}` : 'In battle'`.
- **`aria-disabled="true"`:** until the V1.1 Battle Arena handler exists. The button stays focusable for tooltip discoverability, but `aria-disabled` flags it as not actionable. `onClick` becomes a no-op (no error, no toggle). Tooltip continues to fire on hover/focus.
- **`aria-describedby`:** points to the existing tooltip `<div role="tooltip">`. Refactor: keep the tooltip element mounted with `aria-hidden` toggled by visibility, so `aria-describedby` always points to a valid target (rather than the tooltip element conditionally not rendering).

## Unified trade log

### Component placement

Replaces the existing "Latest receipt" panel in `AgentCardExpandedBody` (the `{receipt && <div ...>...</div>}` block). Shows for ANY agent with closed trades in the current window.

### Header

```
Trades · 24h · 8 settled
```

Count is from `cardViewModels[agentId].windowSettledCount`, not display rows.

### Row composition

**First row** (visually richer, preserves trust-receipt feel):
- Receipt-id (monospace, small): `APX-7B3F912D`
- P&L (right-aligned, color): `-$2.15`
- Meta line: `KXFEDDECISION-26MAY · YES 67¢→64¢ · size 25 · 11:42 PM`
- Padding/border slightly heavier than subsequent rows.

**Subsequent rows** (compact ledger):
- One line each: `APX-A2C18EE0  NO 38¢→52¢  30  +$4.20  11:18p`
- `tabular-nums`; truncate ticker with ellipsis if >18 chars at 375px.

### Display cap

25 rows max. Footer: `Latest 25 of N` when `windowSettledCount > 25`.

Stats (header count, card stats) computed from `windowSettledCount` (the aggregate or full-fetch count) — display cap is presentation-only.

### Empty state (sparse-data, d3)

When `windowSettledCount === 0`:

```
   No settled trades in 24h. Try 7d.
```

Centered, muted ink (`var(--color-ink-muted)`), no chrome.

If `agent.open_position` exists, copy says **"no settled trades"** (not "no trades") so it doesn't contradict the pill.

### Scroll behavior

Single scroll container — the existing 55vh-capped expanded body sheet on mobile. No nested scroll inside the log (avoids iOS overscroll fight).

## Open-position rendering

### Detection (separate query in `useAgentData`)

```ts
const { data: openRows } = await supabase
  .from('agent_trades_public')
  .select(COLUMNS)
  .eq('agent_id', id)
  .is('settled_at', null)
  .is('pnl', null)
  .not('entry_price', 'is', null)         // server-side null filter, BEFORE limit
  .order('entered_at', { ascending: false })
  .limit(5);                               // small N for multi-open warning logging

const eligibleOpens = openRows ?? [];
const latestOpen = eligibleOpens[0] ?? null;

if (eligibleOpens.length > 1) {
  console.warn(`[useAgentData] ${id}: ${eligibleOpens.length} eligible opens; using latest`);
}
```

The `.not('entry_price', 'is', null)` clause runs server-side BEFORE the limit, so a run of null-entry_price rows can't bury an older usable open. Open detection is its own query path, separate from the per-window closed-row fetch, so closed-row ordering doesn't affect open visibility.

### Mapping

```ts
const open_position: OpenPosition | null = latestOpen
  ? {
      contract_ticker: latestOpen.contract_ticker,
      entry_price_cents: latestOpen.entry_price,    // guaranteed non-null by server filter
      side: latestOpen.side,
      size: latestOpen.size,
      entered_at_delayed: latestOpen.entered_at,    // delay enforced server-side
      settles_at: null,                              // V1: always null until market metadata source
    }
  : null;
```

V1 leaves `settles_at` always null. Future enhancement: source from a market metadata table or contract_ticker parsing (deferred).

### `InBattlePill` change summary

```tsx
interface Props {
  agentId: AgentId;
  settlesAt: string | null;
  onTap?: () => void;
}
const settlesLabel = settlesAt
  ? new Date(settlesAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  : null;
// Render: ● In Battle{settlesLabel && ` · settles ${settlesLabel}`}
// aria-disabled="true" in Track B
// accent color via var(--color-${agentId})
```

Tooltip (delay copy) fires on hover/focus regardless of label presence. Layout shrinks to ~70px when label null.

### Mock data

`src/lib/mockData.ts` updates:
- Add `mockTradeLog: Record<AgentId, TradeLogEntry[]>` so CI/dev without Supabase still renders log content (24h + 7d + lifetime distributions).
- Add `mockCardViewModels: Record<AgentId, AgentCardViewModel>` for the new return shape.
- Add `mockLifetimeStats: Record<AgentId, AgentLifetimeStats>` for the aggregate-view fallback path.
- Adjust `mockLeaderboard` to demonstrate open-position rendering on Metheus mock (`open_position` populated, `settles_at: null`, `entry_price_cents: 67`).

## Existing leaderboard Edge Function update

The existing `supabase/functions/leaderboard/index.ts` queries base `agent_trades` directly with the anon key. Once the base-table revoke lands, the Edge Function would 401 silently.

Two acceptable paths:

**(a) Repoint at `agent_trades_public`** (preferred — keeps Edge Function as a public read with the same delay enforcement). Single-line change at `functions/leaderboard/index.ts:174` and `:180`: replace `'agent_trades'` with `'agent_trades_public'`. Re-deploy via `supabase functions deploy leaderboard`.

**(b) Switch Edge Function to service_role** (if the Function ever needs sub-30-min rows, e.g., for caching/TTL purposes). Use `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` instead of anon. Higher trust, server-only.

Track B picks (a). The Edge Function isn't on the V1 critical path (per Session 3 notes, the frontend reads agent_trades directly), but leaving it broken would create silent failure debt. The change ships in step 1.5 of the implementation sequence below.

## Testing matrix

| Case | Expected behavior |
|---|---|
| 0 trades in 24h, has lifetime | Card stays. Log empty state: "No settled trades in 24h. Try 7d." `agent.state` remains `'live'` (lifetime has trades). |
| 0 lifetime trades (truly new agent) | `agent.state` is `'pending'`. Log empty state. |
| Open position + 0 closed in 24h | Pill renders. Log empty state says "no settled" not "no trades". |
| Trade entered 29 min ago | Row absent from view (server-filtered). No leak in network panel — verify with `curl -H "apikey: $KEY" -H "Authorization: Bearer $KEY" .../rest/v1/agent_trades_public?select=*&agent_id=eq.<id>` (must omit row). |
| Trade entered 31 min ago, `entry_price` null | Row suppressed by server-side `.not('entry_price', 'is', null)` filter. No pill. |
| Trade entered 31 min ago, `entry_price` known, `settles_at` null | Pill renders without countdown. Tooltip still fires on hover. |
| Multiple eligible open rows | Latest by `entered_at` shown; console.warn with row count. |
| Lifetime > 25 closed rows | "Latest 25 of N" footer; stats from `agent_lifetime_stats` aggregate view. |
| 24h window with rows that ENTERED yesterday but SETTLED in last 24h | Included (filter is `settled_at >=`, not `entered_at >=`). |
| 24h window with rows that ENTERED in last 24h but haven't SETTLED yet | Excluded from log (open rows aren't in the log). May appear in pill if eligible. |
| 375px + long ticker + pill | No overflow; pill shrinks when `settles_at` null. |
| Keyboard-only nav: time-filter pill | Tab into pill, arrow keys cycle 24h ↔ 7d ↔ Lifetime, Tab leaves group. |
| Keyboard-only nav: card | Tab: summary → pill (when present) → next card. Enter/Space activates summary; pill `aria-disabled` so Enter is no-op until V1.1. |
| Screen reader: time-filter pill | Announces "Time window, radio group, 24h checked" then arrow nav announces each option. |
| Screen reader: summary button | "Expand <name>'s card, button, collapsed" / "Collapse..., expanded". |
| Screen reader: InBattlePill | "In battle, settles HH:MM" or "In battle" when null; describedby surfaces 30-min-delay copy. |
| `isSupabaseConfigured = false` | Falls back to `mockLeaderboard` + `mockCardViewModels` + `mockTradeLog` + `mockLifetimeStats`. Empty state correctness preserved. |
| Filter switch 24h → 7d → Lifetime | `cardViewModels` reflows without flicker. localStorage updates. Other agents unaffected. Global `data` (TrustStrip / FooterTicker) unchanged. |
| Cross-agent persistence | Apex localStorage entry independent of Gale's. Reload preserves both. |
| Anon SELECT on base `agent_trades` | `curl -H "apikey: $KEY" -H "Authorization: Bearer $KEY" .../rest/v1/agent_trades?select=*` returns 401/403. Headers required to prove revoke landed (vs missing-key 401). |
| Anon SELECT on `agent_lifetime_stats` | Same headers; returns 200 with one row per agent. |
| Edge Function `leaderboard` post-update | `curl .../functions/v1/leaderboard` returns 200 with valid `LeaderboardResponse`. |

Tests live in:
- `src/lib/__tests__/useAgentWindow.test.ts` — state hook (default, persistence, set/get, private-mode catch)
- `src/components/content/__tests__/AgentCard.test.tsx` — a11y restructure (no nested button), tab order, aria-expanded on summary button
- `src/components/content/__tests__/TradeLog.test.tsx` — empty state copy variants, row cap, header count
- `src/components/content/__tests__/InBattlePill.test.tsx` — agentId-driven accent color, aria-disabled, settlesAt nullable rendering

Existing 24/24 tests must stay green.

## Implementation sequence

1. **Define data contract first.** Migration for `agent_trades_public` view + `agent_lifetime_stats` view + base-table REVOKE + types in `types.ts` (TradeLogEntry, AgentLifetimeStats, OpenPosition nullables) + `PerformanceWindow` type. No UI changes yet. Verify revoke + view exposure with the curl tests post-deploy (with apikey + auth headers).
1.5. **Update existing `leaderboard` Edge Function** to query `agent_trades_public` instead of base `agent_trades`. Re-deploy. Verify with `curl /functions/v1/leaderboard`.
2. **A11y co-fix (e3).** Hoist InBattlePill, drop guard, restructure layout, move `aria-expanded` to summary button, add `aria-controls`, add `aria-describedby` to pill tooltip, add `aria-disabled` and `agentId` prop to InBattlePill. Refactor tooltip to always-mounted (with `aria-hidden` visibility). Ship before #6 enables real opens.
3. **Per-agent window state.** `useAgentWindow` hook + localStorage + lift to `GymPage`. No UI surface yet.
4. **Rework `useAgentData`.** Accept `windowsByAgent` arg. Run the queries described in the Data Layer section (`agent_lifetime_stats` for global lifetime, separate open-position query, per-window queries with `settled_at >=` filter). Return `{ data, cardViewModels, source, error, loading }`. Wire mock data path.
5. **Time-filter pill UI.** Add native radio group to expanded body top. Connect to `useAgentWindow`.
6. **Unified trade log.** Replace receipt panel with log fed from `cardViewModels[id].tradeLog` and `windowSettledCount`. d3 empty state inline.
7. **Open-position rendering.** Populate `agent.open_position` from latest eligible open row. Render via fixed InBattlePill with `aria-disabled` and per-agent accent.
8. **Test pass + visual verify.** Run testing matrix above. Playwright at desktop + mobile. Verify all empty/edge states. Run curl tests against the Supabase REST endpoints.

Each step has its own commit on `phase-5-track-b`. Final PR squash-merges as a single Phase 5 Track B feature commit.

## Out of scope / deferred

- **Pagination beyond 25 rows.** No `/trade/:id` permalink in V1; pagination has no destination.
- **Cross-tab localStorage sync.** Single-tab gym in practice.
- **Open position with settle countdown.** Requires market metadata source; deferred until that lands.
- **Open positions in trade log.** Log is settled-trade ledger only. Open lives in pill surface.
- **Multi-position aggregation.** Singular pill, singular UI. Future expansion if product roadmap supports it.
- **Battle Arena handler (`InBattlePill.onTap`).** Pill is `aria-disabled` in Track B; handler is V1.1 scope. When wired, drop `aria-disabled` and connect to whatever the Battle Arena bottom-sheet route becomes.
- **Brier 7d migration.** Brier stays unchanged in this track; predates Track B.
- **RPC for parameterized window aggregation.** Two views (`agent_trades_public` + `agent_lifetime_stats`) cover V1 needs. RPC reserved for if/when 24h/7d row counts cross 10k per agent and client-side aggregation becomes too heavy.

## Open questions

None at spec time. All blockers from both Codex review passes are resolved (security boundary via revoke, lifetime accuracy via aggregate view, per-agent window data flow split, open-row ordering with server-side null filter, settled_at-vs-entered_at window dimension, Edge Function update, curl-test correctness, no fabricated entry_price).

If implementation surfaces something undefined here (view migration anomalies, mock-data shape mismatch, view performance under load, settle-time-source unblock, Supabase aggregate view performance), pause and surface rather than choose silently.

---

**Spec status:** ready for third-pass Codex review, then user review, then implementation plan.
