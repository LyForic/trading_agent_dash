---
title: "Battle Arena V1.1 Implementation Plan"
status: active
created: 2026-05-06
updated: 2026-05-06
spec: "../specs/2026-05-06-battle-arena-v1-1-design.md"
---

# Battle Arena V1.1 Implementation Plan

## Pre-flight

- PR #15 must be merged before coding.
- Branch from updated `main`.
- Run baseline tests if code behavior looks stale.

Current branch for this implementation: `battle-arena-v1-1`.

## Task 1 - Pure battle math

Files:
- Create `src/lib/battleProjection.ts`
- Create `tests/lib/battleProjection.test.ts`

Steps:

1. Add `clampPriceCents(value)` for `[1, 99]`.
2. Add `battleMomentum(entryPriceCents, currentPriceCents, side)` returning:
   - `deltaCents`
   - `favorsAgent`
   - `direction: 'left' | 'center' | 'right'`
   - `magnitude: 0..1`
3. Add `buildBattlePreview(openPosition, now)` returning deterministic current price and sparkline points.
4. Tests cover YES/NO side direction, center, magnitude cap, price clamp, and deterministic preview.

## Task 2 - Battle UI components

Files:
- Create `src/components/battle/BottomSheet.tsx`
- Create `src/components/battle/TugOfWarBar.tsx`
- Create `src/components/battle/BattleArena.tsx`
- Create `tests/components/BattleArena.test.tsx`
- Create `tests/components/TugOfWarBar.test.tsx`

Steps:

1. Implement `BottomSheet` with modal semantics, backdrop, close button, Escape close, and drag-down close.
2. Implement `TugOfWarBar` from `battleMomentum`.
3. Implement `BattleArena` active open-position state.
4. Implement `BattleArena` inactive state.
5. Tests assert core content, delay/trust copy, active details, empty state, and bar direction.

## Task 3 - Wire InBattlePill

Files:
- Modify `src/components/content/InBattlePill.tsx`
- Modify `tests/components/InBattlePill.test.tsx`

Steps:

1. Drop Track B `aria-disabled`.
2. Use `onTap` on click.
3. Preserve tooltip behavior and delay copy.
4. Update accessible name to describe opening Battle Arena.
5. Tests assert click calls `onTap`, tooltip still renders, and agent color remains agent-driven.

## Task 4 - Wire AgentCard and GymPage

Files:
- Modify `src/components/content/AgentCard.tsx`
- Modify `src/pages/GymPage.tsx`
- Modify `tests/components/AgentCard.test.tsx`
- Create or extend `tests/pages/GymPage.test.tsx`

Steps:

1. Keep `InBattlePill` as sibling of the card summary button.
2. Thread `onBattleTap` from `GymPage` into each card.
3. Store selected battle agent in `GymPage`.
4. Render one page-level `BottomSheet` + `BattleArena`.
5. Ensure focus-mode Escape does not also exit focus while Battle Arena is open.
6. Tests assert the pill opens the sheet and close button dismisses it.

## Task 5 - Styling and mobile polish

Files:
- Modify `src/styles/globals.css` if component-local classes are not enough.

Checks:

1. 390x844 `/gym` mock mode: Apex pill opens sheet; no text overlap.
2. 390x844 focused `/apex`: pill opens sheet over focused room; Escape closes sheet first.
3. 1440x900 `/gym`: sheet reads as bottom modal, not a card-inside-card.
4. Tooltip remains visible on hover/focus.
5. Existing focus-mode card bottom sheet still behaves normally after closing Battle Arena.

## Task 6 - Gates and PR

Run:

```bash
npm test -- --run
npm run lint
npm run build
```

Then:

1. Browser verify mobile and desktop.
2. Commit changes.
3. Push branch.
4. Create PR: `Battle Arena V1.1: open-position bottom sheet`.

## Task 7 - Vault docs

Files:
- `500-Projects/lyforic/trading-gym/MOC-trading-gym.md`
- `500-Projects/lyforic/trading-gym/progress-log.md`
- `500-Projects/lyforic/trading-gym/deploy-log.md` only if merged/deployed

Steps:

1. Update MOC current state with PR #15 merged and Battle Arena PR state.
2. Add Session 11 progress-log entry with design, implementation, tests, browser verification, and PR link.
3. Do not touch BF Conductor, BFF, live trading-agent notes, or mixed wiki index/log files.
