---
title: "Phase 5 Track B — Agent-card P&L filter, trade log, opens, a11y"
type: design-spec
status: ready-for-implementation
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

## Locked decisions (Brainstorm 2026-04-26)

| # | Decision | Rationale |
|---|---|---|
| (a) | **Filter scope coupled** — 24h/7d/Lifetime rescopes BOTH stats and log | One window, one truth. Simpler mental model. Cozy-game frame. |
| (b) | **Pill in expanded body only** — collapsed row stays at 96px | Default 24h is invisible UI for most users. Mobile density sacred. |
| (c) | **Trade log unifies with Latest Receipt panel** (Codex c4) | Same trade displayed twice today; one panel uses less mobile sheet height. |
| (d) | **Soft hint empty state with warm copy** (Codex d3) | Truthful (no auto-fallback lying about window selection); cozy-tone copy avoids dashboard-zero feel. |
| (#6) | **Latest eligible open row, no aggregation** | Singular pill, singular invitation. Aggregation across markets is dishonest. |
| (#6) | **Server-side delay enforcement (Supabase view)** | Sub-30-min rows must not reach client (network-panel leak). Solves delay policy ONCE, not three times in components. |
| (#6) | **`OpenPosition.settles_at` becomes nullable** | Don't fabricate from `entered_at + duration`; Apex's post-freeze 15-min markets make naive math unsafe. |
| (a11y) | **Hoist InBattlePill as sibling (Codex e3)** | Both stay native `<button>`. No `role="button"` workarounds. Drop the existing click-bubble guard. |

## Architecture

Three layers, each with a clear boundary.

### Data layer (Supabase + types)
- New Supabase view `agent_trades_public` enforces 30-min delay at the boundary.
- New exported `TradeLogEntry` type (UI-facing, decoupled from DB row shape).
- `OpenPosition.settles_at` becomes `string | null`.

### State layer (per-agent window)
- localStorage-backed, key per agent: `gym:track-b:window:<agentId>`. Default `'24h'`.
- Hook `useAgentWindow(agentId)` lifted to `App.tsx`; current window + setter passed via props.

### UI layer
- Collapsed row: InBattlePill hoists to sibling of summary `<button>`.
- Expanded body: filter pill at top; "Latest receipt" panel REPLACED by unified trade log.
- Open positions: detected from `settled_at IS NULL AND pnl IS NULL`, latest eligible row.

### Boundary discipline
- **P&L window** scopes closed-trade truth (stats + log).
- **Open position** is current state, scoped by delay only — independent of the window.

## Data layer

### Supabase view migration

`supabase/migrations/20260426000000_agent_trades_public.sql` (timestamp filled at create time):

```sql
create view agent_trades_public as
select id, agent_id, contract_ticker, side, entry_price, size,
       entered_at, settled_at, settle_price, pnl, move_used, created_at
from agent_trades
where entered_at <= now() - interval '30 minutes'
  and (settled_at is null or settled_at <= now() - interval '30 minutes');

grant select on agent_trades_public to anon;
```

RLS-inherited; anon SELECT only.

### Type changes (`src/lib/types.ts`)

```ts
// New, exported
export interface TradeLogEntry {
  id: string;
  contract_ticker: string;
  side: 'yes' | 'no';
  entry_price_cents: number;
  size: number;
  entered_at: string;
  settled_at: string;          // present (non-null) — open rows excluded from log
  settle_price_cents: number;
  pnl: number;
  move_used: string | null;
}

// Updated
export interface OpenPosition {
  contract_ticker: string;
  entry_price_cents: number;
  side: 'yes' | 'no';
  size: number;
  entered_at_delayed: string;
  settles_at: string | null;   // nullable: "In Battle" without countdown when unknown
}
```

### `useAgentData.ts` shape

```ts
export interface UseAgentDataResult {
  data: LeaderboardResponse;                    // aggregated, full closed window
  tradeLog: Record<AgentId, TradeLogEntry[]>;   // closed rows, capped at 50 for display
  source: Source;
  error: string | null;
  loading: boolean;
}
```

- Queries `agent_trades_public` instead of `agent_trades`.
- Drops the existing `.limit(500)` truncation; orders closed rows DESC and caps display rows at 50, but computes stats from a FULL fetch.
- `data.agents[].open_position` populated from latest open row.

### Rationale: view (vs RPC)

View is a stable read-only projection; no parameters needed (delay constant is fixed). Simpler migration story than RPC; RLS-aware; does not require Edge Function deploy. RPC reserved for future complex projections (e.g., per-window aggregation if Lifetime ever needs server-side rollup).

## Per-agent window state + filter pill

### State hook

`src/lib/useAgentWindow.ts`:

```ts
export type Window = '24h' | '7d' | 'lifetime';
export function useAgentWindow(agentId: AgentId): [Window, (w: Window) => void] {
  const key = `gym:track-b:window:${agentId}`;
  const [window, setWindowState] = useState<Window>(() => {
    if (typeof localStorage === 'undefined') return '24h';
    const raw = localStorage.getItem(key);
    return raw === '7d' || raw === 'lifetime' ? raw : '24h';
  });
  const setWindow = (w: Window) => {
    setWindowState(w);
    try { localStorage.setItem(key, w); } catch { /* private mode, ignore */ }
  };
  return [window, setWindow];
}
```

No eager writes — first `setWindow` call writes through. Default `'24h'` if nothing stored.

Lifted ownership: hook called once per agent in `App.tsx` (alongside the existing focus state); `currentWindow` and `setWindow` passed via props through `AgentCard` → `AgentCardExpandedBody`.

### Pill UI

Rendered at top of expanded body, before the Market+Status grid. ~110px wide segmented control:

```
[ 24h | 7d | Lifetime ]
   ↑
   selected: 1px outline color-mix(in srgb, var(--color-${agentId}) 55%, transparent)
```

ARIA: `role="radiogroup"` aria-label "Time window". Three `role="radio"` children; `aria-checked` driven by `currentWindow`.

Tab order: pill is first interactive control inside expanded body, before any tags/moves.

### Window-aware aggregation

`buildAgent(id, rows, window)` filters:

```ts
const closed = rows.filter(r => r.pnl !== null && r.pnl !== undefined && withinWindow(r.settled_at, window));
```

`withinWindow(timestamp, win)`:
- `'24h'`: `Date.now() - new Date(timestamp).getTime() <= 24 * 3600 * 1000`
- `'7d'`: `Date.now() - new Date(timestamp).getTime() <= 7 * 24 * 3600 * 1000`
- `'lifetime'`: `true`

Stats (`total_pnl`, `record.W/L/BE/settled`) computed from this filtered set.

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
    <button className="agent-card-summary-btn" onClick={toggleExpansion}>
      <AgentCardCollapsedRowInner agent={agent} />
    </button>
    {agent.open_position && (
      <InBattlePill
        settlesAt={agent.open_position.settles_at}
        onTap={onBattleTap}
      />
    )}
  </div>
  {expanded && canExpand && (
    <div className="px-3 pb-3 agent-card-expanded">
      <AgentCardExpandedBody ... />
    </div>
  )}
</article>
```

Changes:
- `AgentCardCollapsedRow` splits into `AgentCardCollapsedRowInner` (no pill) + the layout shell. The `data-role="in-battle-pill"` wrapper is removed entirely.
- `closest('[data-role="in-battle-pill"]')` guard in AgentCard's `toggleExpansion` is dropped (not needed — pill is no longer a descendant of the summary button).

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

### ARIA labels

- Summary button: `aria-label={`${expanded ? 'Collapse' : 'Expand'} ${agent.name}'s card`}` (preserves existing copy).
- InBattlePill: `aria-label={settlesAt ? `In battle, settles ${time}` : 'In battle'}`.

## Unified trade log

### Component placement

Replaces the existing "Latest receipt" panel in `AgentCardExpandedBody` (the `{receipt && <div ...>...</div>}` block at line ~189). Shows for ANY agent with closed trades in the current window.

### Header

```
Trades · 24h · 8 settled
```

Count is from full closed window, not display rows.

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

25 rows max. Footer: `Latest 25 of N` when `N > 25`.

Stats (header count, card stats) computed from FULL closed-window fetch — display cap is presentation-only.

### Empty state (sparse-data, d3)

When window has zero settled trades:

```
   No settled trades in 24h. Try 7d.
```

Centered, muted ink (`var(--color-ink-muted)`), no chrome.

If `agent.open_position` exists, copy says **"no settled trades"** (not "no trades") so it doesn't contradict the pill.

### Scroll behavior

Single scroll container — the existing 55vh-capped expanded body sheet on mobile. No nested scroll inside the log (avoids iOS overscroll fight).

## Open-position rendering

### Detection (in `useAgentData`)

```ts
const openRows = rows.filter(r => r.settled_at === null && r.pnl === null);
const latestOpen = openRows.length > 0
  ? [...openRows].sort((a, b) =>
      new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime()
    )[0]
  : null;

if (openRows.length > 1) {
  console.warn(`[useAgentData] ${id}: ${openRows.length} eligible opens; using latest`);
}
```

Server-side filter (the `agent_trades_public` view) ensures sub-30-min entries never reach the client.

### Mapping

```ts
const open_position: OpenPosition | null = latestOpen
  ? {
      contract_ticker: latestOpen.contract_ticker,
      entry_price_cents: latestOpen.entry_price ?? 0,
      side: latestOpen.side,
      size: latestOpen.size,
      entered_at_delayed: latestOpen.entered_at,
      settles_at: null,                                 // V1: always null until market metadata source exists
    }
  : null;
```

V1 leaves `settles_at` always null. Future enhancement: source from a market metadata table or contract_ticker parsing (deferred).

### `InBattlePill` change

```tsx
interface Props { settlesAt: string | null; onTap?: () => void; }
const settlesLabel = settlesAt
  ? new Date(settlesAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  : null;
// Render: ● In Battle{settlesLabel && ` · settles ${settlesLabel}`}
```

Tooltip (delay copy) fires on hover/focus regardless of label presence. Layout shrinks to ~70px when label null.

### Mock data

`src/lib/mockData.ts` updates:
- Add `mockTradeLog: Record<AgentId, TradeLogEntry[]>` so CI/dev without Supabase still renders log content (24h + 7d + lifetime distributions).
- Adjust `mockLeaderboard` to demonstrate open-position rendering on Metheus mock (`open_position` populated, `settles_at: null`).

## Testing matrix

| Case | Expected behavior |
|---|---|
| 0 trades in 24h, has lifetime | Card stays. Log empty state: "No settled trades in 24h. Try 7d." |
| Open position + 0 closed in 24h | Pill renders. Log empty state says "no settled" not "no trades". |
| Trade entered 29 min ago | Row absent from view (server-filtered). No leak in network panel. |
| Trade entered 31 min ago, `settles_at` null | Pill renders without countdown. Tooltip still fires on hover. |
| Multiple eligible open rows | Latest by `entered_at` shown; console.warn with row count. |
| Lifetime > 25 closed rows | "Latest 25 of N" footer; stats reflect full N. |
| 375px + long ticker + pill | No overflow; pill shrinks when `settles_at` null. |
| Keyboard-only nav | Tab: summary → pill (when present) → next card. Enter/Space activates. Visible focus rings. |
| Screen reader | Summary: "Expand <name>'s card"; pill: "In battle, settles HH:MM" or "In battle" when null. |
| `isSupabaseConfigured = false` | Falls back to `mockLeaderboard` + `mockTradeLog`. Empty state correctness preserved. |
| Filter switch 24h → 7d → Lifetime | Stats reflow without flicker. localStorage updates. Other agents unaffected. |
| Cross-agent persistence | Apex localStorage entry independent of Gale's. Reload preserves both. |

Tests live in:
- `src/lib/__tests__/useAgentWindow.test.ts` — state hook (default, persistence, set/get)
- `src/components/content/__tests__/AgentCard.test.tsx` — a11y restructure (no nested button), tab order
- `src/components/content/__tests__/TradeLog.test.tsx` — empty state copy variants, row cap, header count

Existing 24/24 tests must stay green.

## Implementation sequence

1. **Define data contract first.** Migration for `agent_trades_public` view + types in `types.ts` + nullable `settles_at`. No UI changes yet.
2. **A11y co-fix (e3).** Hoist InBattlePill, drop guard, restructure layout. Ship before #6 enables real opens (otherwise invalid HTML the moment Metheus has an open).
3. **Per-agent window state.** `useAgentWindow` hook + localStorage + lift to App.tsx. No UI surface yet.
4. **Rework `useAgentData`.** Fetch from view, return `{ data, tradeLog, ... }`, compute window-aware stats. Wire up `currentWindow` prop chain.
5. **Filter pill UI.** Add segmented control to expanded body top. Connect to `useAgentWindow`.
6. **Unified trade log.** Replace receipt panel with log. d3 empty state inline.
7. **Open-position rendering.** Populate `agent.open_position` from latest eligible row. Render via fixed InBattlePill.
8. **Test pass + visual verify.** Run testing matrix above. Playwright at desktop + mobile. Verify all empty/edge states.

Each step has its own commit on `phase-5-track-b`. Final PR squash-merges as a single Phase 5 Track B feature commit.

## Out of scope / deferred

- **Pagination beyond 25 rows.** No `/trade/:id` permalink in V1; pagination has no destination.
- **Cross-tab localStorage sync.** Single-tab gym in practice.
- **Open position with settle countdown.** Requires market metadata source; deferred until that lands.
- **Open positions in trade log.** Log is settled-trade ledger only. Open lives in pill surface.
- **Multi-position aggregation.** Singular pill, singular UI. Future expansion if product roadmap supports it.
- **Brier 7d migration.** Brier stays unchanged in this track; predates Track B.

## Open questions

Brainstorm ambiguities and judgment calls all resolved. Two implementation-time questions remain:

1. **Lifetime fetch strategy.** Spec says stats come from "full closed-window fetch," but for `lifetime` window we don't want to fetch 5,000+ rows when agents accumulate history. V1 data volumes are tame (Apex 753, Gale 115, Metheus 132), so a single `.select('*').limit(1000)` per agent is fine. Implementation plan should pick one of: (a) raise limit to 1000 with documented note that older lifetime stats truncate at 1000 if exceeded, (b) add a parallel `select('pnl', count: 'exact')` aggregate query for accurate Lifetime totals + separate rows query for display. Default to (a) for V1 simplicity; revisit if/when an agent crosses 1000 closed.

2. **Open-row ordering by view.** The view orders nothing; client orders by `settled_at` for the closed-row stats path. Open rows have `settled_at IS NULL` and could sort to the end of any default ordering. Implementation should explicitly filter open rows separately (or use a separate query) rather than relying on the closed-row ordering to surface them.

If implementation surfaces something else undefined here (view migration anomalies, mock-data shape mismatch with new types, view performance under load, settle-time-source unblock), pause and surface rather than choose silently.

---

**Spec status:** ready for Codex review, then user review, then implementation plan.
