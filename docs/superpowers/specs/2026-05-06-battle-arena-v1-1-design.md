---
title: "Battle Arena V1.1 Design Spec"
status: approved-for-implementation
created: 2026-05-06
updated: 2026-05-06
tracks: ["battle-arena", "in-battle-pill", "open-position"]
---

# Battle Arena V1.1 Design Spec

## Goal

Turn the existing `InBattlePill` from an inert Track B status chip into a real entry point for inspecting an agent's currently delayed-visible open position.

V1.1 ships a mobile-first bottom sheet. It is not replay mode, not a trade permalink, and not a live trading-agent control surface.

## Non-goals

- No replay scrubber or `/trade/:id` route.
- No new Supabase tables or migrations.
- No reads from private live trading agents.
- No Battle Arena auto-open.
- No joystick, town-square smoke preservation, atmosphere art, or launch-readiness audit.

## Existing constraints

- `Agent.open_position` is already populated from `agent_trades_public`, so entry details have already crossed the 30-minute delay floor.
- `open_position` is independent of the selected P&L window. The battle entry remains visible when users switch 24h / 7d / Lifetime.
- `InBattlePill` already renders as a sibling of the AgentCard summary button. Keep that HTML-validity fix.
- The app does not currently have a Kalshi quote feed endpoint. Therefore V1.1 must not claim the bottom-sheet bar is live. It may show an entry-anchored market-pressure preview while keeping the delay-policy copy explicit.

## User story

1. User opens `/gym`, `/apex`, `/gale`, or `/metheus`.
2. If an agent has `open_position`, the `InBattlePill` is focusable and actionable.
3. User taps/clicks the pill.
4. A bottom sheet opens over the current room/card context.
5. The sheet explains the active battle: agent, ticker, side, entry, size, delayed entry time, settle time if known, and delay policy.
6. User dismisses with close button, backdrop tap, drag-down, or Escape.

## Interaction model

- `InBattlePill`:
  - Remove `aria-disabled`.
  - Invoke `onTap` when clicked.
  - Keep the hover/focus tooltip with 30-minute delay copy.
  - Accessible name becomes `Open battle arena for [agent], settles [time]` or `Open battle arena for [agent]`.

- `GymPage`:
  - Owns `battleAgentId: AgentId | null`.
  - Passes `onBattleTap={() => setBattleAgentId(agent.id)}` to `AgentCard`.
  - Renders a single `BottomSheet` at page level so the dialog is not trapped inside card layout.
  - Escape closes Battle Arena first; focus-mode Escape should not also exit the agent room while the sheet is open.

- `BottomSheet`:
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
  - Max height `85dvh`.
  - Backdrop preserves visual context.
  - Close button near the top of the sheet.
  - Drag down by more than 96px dismisses.
  - Escape dismisses.

## Battle sheet content

### Active open position

Top:
- `Battle Arena`
- Agent name + "In Battle"
- Contract ticker

Stage:
- Left: agent badge / sprite reference.
- Center: tug-of-war bar.
- Right: market badge.

Data grid:
- Side (`YES` / `NO`)
- Entry (`42c`)
- Current preview (`48c preview`) if generated
- Size
- Entered (`45m ago`, using delayed-visible timestamp)
- Settles (`6:00 PM` or `Unknown`)

Trust copy:
- `Entry details are shown after the 30-minute delay floor. Public market prices can update live once a Kalshi quote feed is connected; this build shows an entry-anchored preview, not a private live signal.`

### Inactive / empty state

If `BattleArena` receives an agent without `open_position`, render a calm empty state:

- Header: `No active battle`
- Body: `[Agent] is idle. Settled trades appear in the trade log after the 30-minute delay.`

The UI normally cannot open this state from an idle card, but the component supports it for tests and defensive rendering.

## Tug-of-war model

V1.1 uses a deterministic preview until a public Kalshi quote feed exists.

- Pure function derives `currentPriceCents` from:
  - `entry_price_cents`
  - `contract_ticker`
  - current minute
  - side
- The preview is clamped to `[1, 99]`.
- Bar center is the entry price.
- For `YES`, current price above entry favors the agent.
- For `NO`, current price below entry favors the agent.
- Magnitude caps at a 50c move from entry.
- No HP numbers and no percent-share framing.

Label the preview as preview. Do not call it live.

## Accessibility

- All actionable controls are native buttons.
- Pill and close button have visible focus states.
- Dialog has a title and modal semantics.
- Escape closes the dialog.
- Reduced-motion users still get the data; the sheet transition and bar transitions should not be required for comprehension.

## Test coverage

- `InBattlePill` calls `onTap` and is no longer `aria-disabled`.
- `InBattlePill` still exposes delay tooltip copy.
- `AgentCard` passes `onBattleTap` through without toggling expansion.
- `BattleArena` renders active open-position details and inactive empty state.
- Tug-of-war math handles YES/NO direction and clamps preview prices.
- `GymPage` opens the bottom sheet from an open-position pill and closes it.

## Acceptance criteria

- Pill is actionable only when an open position exists.
- Bottom sheet renders at 390px mobile width without overlap.
- Desktop rendering remains centered and readable.
- Existing AgentCard expansion, TrustStrip, P&L filter, TradeLog, and town-square routes continue to pass tests.
- Delay wording remains accurate and does not imply private live signal disclosure.
