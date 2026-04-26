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

## Locked decisions (Brainstorm 2026-04-26 + Codex review pass)

| # | Decision | Rationale |
|---|---|---|
| (a) | **Filter scope coupled** — 24h/7d/Lifetime rescopes BOTH stats and log | One window, one truth. Simpler mental model. Cozy-game frame. |
| (b) | **Time-filter pill in expanded body only** — collapsed row stays at 96px | Default 24h is invisible UI for most users. Mobile density sacred. |
| (c) | **Trade log unifies with Latest Receipt panel** (Codex c4) | Same trade displayed twice today; one panel uses less mobile sheet height. |
| (d) | **Soft hint empty state with warm copy** (Codex d3) | Truthful (no auto-fallback lying about window selection); cozy-tone copy avoids dashboard-zero feel. |
| (#6) | **Latest eligible open row, no aggregation** | Singular pill, singular invitation. Aggregation across markets is dishonest. |
| (#6) | **Server-side delay enforcement (Supabase view)** | Sub-30-min rows must not reach client (network-panel leak). Solves delay policy ONCE, not three times in components. |
| (#6) | **`OpenPosition.settles_at` becomes nullable** | Don't fabricate from `entered_at + duration`; Apex's post-freeze 15-min markets make naive math unsafe. |
| (#6) | **`OpenPosition.entry_price_cents` becomes nullable; rows missing entry_price are suppressed** | Same "no fake data" rule as `settles_at`. `0¢` displayed for unknown is dishonest. |
| (#6) | **Separate open-position query ordered `entered_at DESC`** | Closed-row ordering by `settled_at` would push open rows (NULL `settled_at`) to the end. Open detection deserves its own projection. |
| (a11y) | **Hoist InBattlePill as sibling (Codex e3)** | Both stay native `<button>`. No `role="button"` workarounds. Drop the existing click-bubble guard. |
| (a11y) | **InBattlePill `onTap` inert in Track B** with `aria-disabled="true"` | Battle Arena handler is V1.1 scope. Inert + `aria-disabled` is honest; an unwired focusable button is a no-op trap. |
| (data flow) | **Split `useAgentData` return: `data` (global, lifetime-locked) + `cardViewModels` (per-agent windowed)** | Global surfaces (`TrustStrip`, `FooterTicker`, `VisitDeltaStrip`) keep accurate "Lifetime WR" labels. AgentCard reads from per-agent windowed view models. |
| (lifetime accuracy) | **Aggregate query for Lifetime stats + separate row fetch capped at 25 for display** | Eliminates the `.limit(500)` truncation risk Codex flagged. `select('pnl', count: 'exact')` returns total counts; row fetch is presentation-only. |
| (state lifecycle) | **`agent.state` derives from FULL closed trades, not the windowed slice** | An agent with lifetime history but 0 settles in 24h must NOT flip to `state: 'pending'`. Lifecycle is global; windowed stats are scoped. |
| (UI) | **Native `<input type="radio">` for time-filter pill** | Free keyboard nav (arrow keys), free `aria-checked`, free form semantics. Custom `role="radio"` would require manual roving focus implementation. |
| (security) | **Revoke anon SELECT on base `agent_trades`; only `agent_trades_public` is anon-readable** | Without this, anon clients bypass the public view by querying the base table directly — leaking sub-30-min rows. The view alone is not a security boundary. |

## Architecture

Three layers, each with a clear boundary.

### Data layer (Supabase + types)
- New Supabase view `agent_trades_public` enforces 30-min delay at the boundary. Anon SELECT revoked on base `agent_trades`; granted only on the view.
- New exported `TradeLogEntry` type (UI-facing, decoupled from DB row shape).
- `OpenPosition.settles_at` and `OpenPosition.entry_price_cents` both become nullable.

### State layer (per-agent window)
- localStorage-backed, key per agent: `gym:track-b:window:<agentId>`. Default `'24h'`.
- Hook `useAgentWindow(agentId)` lifted to `GymPage`; current window + setter passed via props.

### UI layer
- Collapsed row: InBattlePill hoists to sibling of summary `<button>`.
- Expanded body: time-filter pill at top; "Latest receipt" panel REPLACED by unified trade log.
- Open positions: detected from `settled_at IS NULL AND pnl IS NULL`, latest eligible row, separate query.

### Boundary discipline
- **P&L window** scopes closed-trade truth (stats + log) — applied per-agent in `cardViewModels`.
- **Open position** is current state, scoped by delay only — independent of the window.
- **Global surfaces** (`TrustStrip`, `FooterTicker`, `VisitDeltaStrip`) consume `data` (lifetime-locked aggregates) — never per-agent windowed.
- **Lifecycle (`agent.state`)** derives from full closed trades — never from the windowed slice.

## Data layer

### Supabase migration

`supabase/migrations/20260426000000_agent_trades_public.sql` (timestamp filled at create time):

```sql
-- Revoke base-table anon access. The public view becomes the only anon-readable path.
revoke select on agent_trades from anon;

-- 30-min-delayed projection of agent_trades for public/anon consumption.
create view agent_trades_public as
select id, agent_id, contract_ticker, side, entry_price, size,
       entered_at, settled_at, settle_price, pnl, move_used, created_at
from agent_trades
where entered_at <= now() - interval '30 minutes'
  and (settled_at is null or settled_at <= now() - interval '30 minutes');

grant select on agent_trades_public to anon;
```

**Security note:** This migration's correctness depends on revoking base-table anon SELECT. The view alone is NOT a security boundary if anon can still query the base table. Verify post-deploy with a `curl` test against `/rest/v1/agent_trades?select=*` (must return 401/403) AND `/rest/v1/agent_trades_public?select=*` (must return 200 with delay-respecting rows only).

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

// Updated
export interface OpenPosition {
  contract_ticker: string;
  entry_price_cents: number | null;  // nullable: rows missing entry_price are suppressed; if rendered as null, pill shows no price detail
  side: 'yes' | 'no';
  size: number;
  entered_at_delayed: string;
  settles_at: string | null;          // nullable: "In Battle" without countdown when unknown
}
```

Implementation note: rows where `entry_price IS NULL` should be **suppressed at the data layer** (return `open_position: null`) rather than rendered with a null `entry_price_cents`. The nullable type is defensive; the practical contract is "if we have an open with usable data, render it; else, no pill."

### `useAgentData.ts` shape

```ts
export interface AgentCardViewModel {
  // Per-agent, scoped to current window
  total_pnl: number;
  record: { W: number; L: number; BE: number; settled: number };
  tradeLog: TradeLogEntry[];        // closed rows in window, capped at 25 for display
  windowSettledCount: number;       // full count from aggregate query (not display rows)
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

- **Lifetime aggregates (for `data`):** one query per agent against `agent_trades_public` with `select('id,agent_id,...,pnl', { count: 'exact' })` — counts and sums via the head/exact pattern. Used to compute the `Agent.total_pnl`, `record.W/L/BE/settled`, `state`, and `latest_receipt`. NOT scoped by window.
- **Open positions (for `data.agents[].open_position`):** one query per agent against `agent_trades_public` filtering `settled_at IS NULL AND pnl IS NULL`, ordered `entered_at DESC`, limit 5 (covers the rare multi-open case for the warning). Latest used; rest logged.
- **Per-agent windowed aggregates + log (for `cardViewModels`):** one query per agent + window with `entered_at >= window_lower_bound`, ordered `settled_at DESC`, limit 25 for display. Stats computed from full count via separate aggregate query (`select('pnl', count: 'exact')`) with the same window filter.

`agent.state` derives from the **lifetime aggregate** (does the agent have any closed row ever?), NOT from `cardViewModels.<id>.record.settled`.

### Rationale: view (vs RPC)

View is a stable read-only projection; no parameters needed (delay constant is fixed). Simpler migration story than RPC; RLS-aware; does not require Edge Function deploy. RPC reserved for future complex projections (e.g., server-side per-window aggregation if Lifetime row counts ever cross 10k per agent).

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

Lifted ownership: hook called once per agent in `GymPage` (current `App.tsx` is just router/providers per Codex's read of the code); the resulting `windowsByAgent: Record<AgentId, PerformanceWindow>` map is passed to `useAgentData(windowsByAgent)` and individual `currentWindow + setWindow` are passed via props through `AgentCard` → `AgentCardExpandedBody`.

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

Server-side: each agent's per-window query passes `entered_at >= now() - <interval>` (24h or 7d) or omits the filter entirely (lifetime). The `agent_trades_public` view already enforces the 30-min delay floor.

Client-side: `cardViewModels[agentId]` populated from the per-window query result. `total_pnl`, `record.W/L/BE/settled` computed from FULL count (aggregate query) — NOT from the 25-row display fetch.

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
- `aria-expanded` moves from `<article>` (where it was previously per the existing code) to the **summary button** itself. `aria-controls` references the expanded-body id.

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
- **`aria-describedby`:** points to the existing tooltip `<div role="tooltip">`. Today the tooltip is mounted on hover/focus only — for SR, prefer the static-association pattern (tooltip element always present in DOM, hidden via CSS, `aria-describedby` always set). Implementation note: the existing component uses `tooltipOpen` state; refactor to keep the tooltip element mounted with `aria-hidden` toggled by visibility, so `aria-describedby` always points to a valid target.

## Unified trade log

### Component placement

Replaces the existing "Latest receipt" panel in `AgentCardExpandedBody` (the `{receipt && <div ...>...</div>}` block). Shows for ANY agent with closed trades in the current window.

### Header

```
Trades · 24h · 8 settled
```

Count is from `cardViewModels[agentId].windowSettledCount` (full count from aggregate query), not display rows.

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

Stats (header count, card stats) computed from `windowSettledCount` and aggregate query — display cap is presentation-only.

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

### Detection (in `useAgentData`, separate query)

```ts
const { data: openRows } = await supabase
  .from('agent_trades_public')
  .select(COLUMNS)
  .eq('agent_id', id)
  .is('settled_at', null)
  .is('pnl', null)
  .order('entered_at', { ascending: false })
  .limit(5);   // covers rare multi-open for warning logging

const eligibleOpens = (openRows ?? []).filter(r => r.entry_price !== null);
const latestOpen = eligibleOpens[0] ?? null;

if (eligibleOpens.length > 1) {
  console.warn(`[useAgentData] ${id}: ${eligibleOpens.length} eligible opens; using latest`);
}
```

- The `agent_trades_public` view already enforces the 30-min delay floor (`entered_at <= now() - interval '30 minutes'`).
- Rows missing `entry_price` are filtered out (suppressed); they don't render a pill.
- Open detection is its own query path — separate from the per-window closed-row fetch — so closed-row ordering (`settled_at DESC`) doesn't accidentally bury open rows.

### Mapping

```ts
const open_position: OpenPosition | null = latestOpen
  ? {
      contract_ticker: latestOpen.contract_ticker,
      entry_price_cents: latestOpen.entry_price,    // guaranteed non-null by filter above
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
- Adjust `mockLeaderboard` to demonstrate open-position rendering on Metheus mock (`open_position` populated, `settles_at: null`, `entry_price_cents: 67`).

## Testing matrix

| Case | Expected behavior |
|---|---|
| 0 trades in 24h, has lifetime | Card stays. Log empty state: "No settled trades in 24h. Try 7d." `agent.state` remains `'live'` (lifetime has trades). |
| 0 lifetime trades (truly new agent) | `agent.state` is `'pending'`. Log empty state. |
| Open position + 0 closed in 24h | Pill renders. Log empty state says "no settled" not "no trades". |
| Trade entered 29 min ago | Row absent from view (server-filtered). No leak in network panel — verify with `curl` against `/rest/v1/agent_trades?select=*` (must 401) and `/rest/v1/agent_trades_public?select=*&agent_id=eq.<id>` (must omit row). |
| Trade entered 31 min ago, `settles_at` null, `entry_price` null | Row suppressed (no pill). Pill only renders when `entry_price IS NOT NULL`. |
| Trade entered 31 min ago, `entry_price` known, `settles_at` null | Pill renders without countdown. Tooltip still fires on hover. |
| Multiple eligible open rows | Latest by `entered_at` shown; console.warn with row count. |
| Lifetime > 25 closed rows | "Latest 25 of N" footer; stats from full count via aggregate query. |
| 375px + long ticker + pill | No overflow; pill shrinks when `settles_at` null. |
| Keyboard-only nav: time-filter pill | Tab into pill, arrow keys cycle 24h ↔ 7d ↔ Lifetime, Tab leaves group. |
| Keyboard-only nav: card | Tab: summary → pill (when present) → next card. Enter/Space activates summary; pill `aria-disabled` so Enter is no-op until V1.1. |
| Screen reader: time-filter pill | Announces "Time window, radio group, 24h checked" then arrow nav announces each option. |
| Screen reader: summary button | "Expand <name>'s card, button, collapsed" / "Collapse..., expanded". |
| Screen reader: InBattlePill | "In battle, settles HH:MM" or "In battle" when null; describedby surfaces 30-min-delay copy. |
| `isSupabaseConfigured = false` | Falls back to `mockLeaderboard` + `mockCardViewModels` + `mockTradeLog`. Empty state correctness preserved. |
| Filter switch 24h → 7d → Lifetime | `cardViewModels` reflows without flicker. localStorage updates. Other agents unaffected. Global `data` (TrustStrip / FooterTicker) unchanged. |
| Cross-agent persistence | Apex localStorage entry independent of Gale's. Reload preserves both. |
| Anon SELECT on base `agent_trades` | `curl ... /rest/v1/agent_trades` returns 401/403. Verifies revoke landed. |

Tests live in:
- `src/lib/__tests__/useAgentWindow.test.ts` — state hook (default, persistence, set/get, private-mode catch)
- `src/components/content/__tests__/AgentCard.test.tsx` — a11y restructure (no nested button), tab order, aria-expanded on summary button
- `src/components/content/__tests__/TradeLog.test.tsx` — empty state copy variants, row cap, header count
- `src/components/content/__tests__/InBattlePill.test.tsx` — agentId-driven accent color, aria-disabled, settlesAt nullable rendering

Existing 24/24 tests must stay green.

## Implementation sequence

1. **Define data contract first.** Migration for `agent_trades_public` view + base-table REVOKE + types in `types.ts` (TradeLogEntry, OpenPosition nullables) + `PerformanceWindow` type. No UI changes yet. Verify revoke + view exposure with curl tests post-deploy.
2. **A11y co-fix (e3).** Hoist InBattlePill, drop guard, restructure layout, move `aria-expanded` to summary button, add `aria-controls`, add `aria-describedby` to pill tooltip, add `aria-disabled` and `agentId` prop to InBattlePill. Ship before #6 enables real opens (otherwise invalid HTML the moment Metheus has an open).
3. **Per-agent window state.** `useAgentWindow` hook + localStorage + lift to `GymPage`. No UI surface yet; just wires state into the data layer.
4. **Rework `useAgentData`.** Accept `windowsByAgent` arg. Run lifetime aggregate query (for `data`), per-agent windowed query (for `cardViewModels`), separate open-position query (for `agent.open_position`). Return new shape. Wire mock data path.
5. **Time-filter pill UI.** Add native radio group to expanded body top. Connect to `useAgentWindow`.
6. **Unified trade log.** Replace receipt panel with log fed from `cardViewModels[id].tradeLog` and `windowSettledCount`. d3 empty state inline.
7. **Open-position rendering.** Populate `agent.open_position` from latest eligible open row. Render via fixed InBattlePill with `aria-disabled` and per-agent accent.
8. **Test pass + visual verify.** Run testing matrix above. Playwright at desktop + mobile. Verify all empty/edge states. Run curl tests against the Supabase REST endpoints to confirm revoke + view boundary.

Each step has its own commit on `phase-5-track-b`. Final PR squash-merges as a single Phase 5 Track B feature commit.

## Out of scope / deferred

- **Pagination beyond 25 rows.** No `/trade/:id` permalink in V1; pagination has no destination.
- **Cross-tab localStorage sync.** Single-tab gym in practice.
- **Open position with settle countdown.** Requires market metadata source; deferred until that lands.
- **Open positions in trade log.** Log is settled-trade ledger only. Open lives in pill surface.
- **Multi-position aggregation.** Singular pill, singular UI. Future expansion if product roadmap supports it.
- **Battle Arena handler (`InBattlePill.onTap`).** Pill is `aria-disabled` in Track B; handler is V1.1 scope. When wired, drop `aria-disabled` and connect to whatever the Battle Arena bottom-sheet route becomes.
- **Brier 7d migration.** Brier stays unchanged in this track; predates Track B.
- **Server-side per-window aggregation RPC.** View + client-side filter is enough for V1 data volumes; RPC reserved for if/when an agent crosses 10k closed rows.

## Open questions

None at spec time. All blockers from the Codex review pass have been resolved (security boundary, lifetime accuracy via aggregate query, per-agent window data flow split, open-row ordering, open-position fabrication, trade-log cap mismatch, InBattlePill activation contract).

If implementation surfaces something undefined here (view migration anomalies, mock-data shape mismatch, view performance under load, settle-time-source unblock, Supabase aggregate query performance), pause and surface rather than choose silently.

---

**Spec status:** ready for second-pass Codex review, then user review, then implementation plan.
