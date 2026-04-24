# Phase 5 Slice 1a — Town Square Integration Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Town Square houses feel planted in the plaza (via a shared grounding pad + per-house diegetic props) and give every destination (4 houses + gym) a wooden signpost in world-space, replacing the floating screen-space HUD navigation labels. Add a one-shot mobile "Drag to explore" hint.

**Architecture:** All changes happen in two files — `src/pages/TownSquarePage.tsx` (extended `Destination` type, new render layers inside `.town-world`, HUD cleanup) and `src/styles/globals.css` (new classes + time-of-day tinting for new layers, removal of the 14px `::after` radial shadow on `.town-house`). No new files. No new unit tests (per approved spec — visual verification via Playwright is the quality bar). Existing 24-test Vitest suite runs as a regression check.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4 + Framer Motion + React Router 7 + Vitest. Asset PNGs already delivered to `public/signposts/signpost.png` and `public/props/{apex-stones,metheus-mailbox,gale-fence,coming-soon-debris,grounding-pad}.png`.

**Branch:** `phase-5-slice-1a-integration` off main (`50a6985`). Dev server on :5173.

**Spec reference:** `~/Documents/Obsidian Vault/500-Projects/lyforic/trading-gym/2026-04-24-phase-5-slice-1a-design.md` (status: approved v2, all decisions locked).

---

## File structure

| File | Role in this slice |
|---|---|
| `src/pages/TownSquarePage.tsx` | Add `Z` layer constants, extend `Destination` type, add 3 new render layers (grounding pad, diegetic prop, in-world signposts), delete HUD sign render, add mobile pan hint state + render, update house + avatar z-index. |
| `src/styles/globals.css` | Add CSS for `.town-grounding-pad`, `.town-house-prop`, `.town-signpost`, `.town-signpost-sprite`, `.town-signpost-label`, `.town-signpost--disabled`, `.town-pan-hint` + matching `body[data-mode="dusk"]` / `"moonlit"` filters. Remove `.town-house::after` radial shadow. Remove dead `.town-sign-hud` rules. Remove hardcoded `z-index: 100` from `.town-avatar`. |

Nothing else touches; no new components, no new hooks.

---

## Task 1: Extend data model — Z layer constants, Destination type, DESTINATIONS array

**Files:**
- Modify: `src/pages/TownSquarePage.tsx` lines 43–116

- [ ] **Step 1: Add Z layer constants after WORLD_H**

In `src/pages/TownSquarePage.tsx`, after line 44 (`const WORLD_H = 540;`) and before line 46 (`// Plaza anchor points...` comment), insert:

```ts
// Layer band z-index model. Bands are spaced by >WORLD_HEIGHT (540) so
// Math.round(y) depth sort within a band can never leak above the next
// band. Example: grounding pad at y=477 → 1000+477 = 1477; scene house
// at y=350 → 2000+350 = 2350. Pad always under scene regardless of y.
const Z = {
  plaza: 0,
  groundingPad: 1000,
  scene: 2000,
  signpost: 4000,
  effects: 5000,
} as const;

// Default rendered width for the signpost sprite (in world pixels).
// Can be overridden per-destination via signpost.width.
const DEFAULT_SIGNPOST_WIDTH = 64;
```

- [ ] **Step 2: Replace the Destination interface**

Locate lines 54–66 (current `interface Destination { ... }`). Replace the entire block with:

```ts
interface Destination {
  id: 'gym' | AgentId | 'comingSoon';
  x: number;
  y: number;
  spriteWidth?: number;
  spriteSrc?: string;

  /** Full display / aria name. */
  label: string;
  /** Short text painted on the signpost plaque. Defaults to label. */
  signText?: string;
  /** Full accessibility label (more descriptive than visible label). */
  ariaLabel?: string;

  route?: string;
  disabled?: boolean;

  /** Signpost placement in world coords. */
  signpost?: {
    x: number;
    y: number;
    anchorX?: number; // %, default 50
    anchorY?: number; // %, default 100
    width?: number;   // world px, default DEFAULT_SIGNPOST_WIDTH (64)
  };

  /** Shared grounding pad under the house base. */
  groundingPad?: {
    x: number;
    y: number;
    width: number;
    anchorX?: number;
    anchorY?: number;
  };

  /** Diegetic prop breaking the house base seam. */
  prop?: {
    src: string;
    x: number;
    y: number;
    width: number;
    anchorX?: number;
    anchorY?: number;
    zOffset?: number;
  };
}
```

- [ ] **Step 3: Replace the DESTINATIONS data array**

Locate lines 68–116 (current `const DESTINATIONS: Destination[] = [ ... ];`). Replace the entire array with:

```ts
const DESTINATIONS: Destination[] = [
  {
    id: 'gym',
    x: 480,
    y: 210,
    label: 'Trading Gym',
    signText: 'Trading\nGym',
    ariaLabel: 'Enter the Trading Gym communal roster',
    route: '/gym',
    signpost: { x: 605, y: 235 },
  },
  {
    id: 'apex',
    x: 180,
    y: 350,
    spriteWidth: 180,
    spriteSrc: '/houses/apex.png',
    label: 'Apex',
    signText: 'Apex',
    ariaLabel: "Enter Apex's dojo",
    route: '/apex',
    signpost: { x: 265, y: 360 },
    groundingPad: { x: 180, y: 352, width: 160 },
    prop: { src: '/props/apex-stones.png', x: 210, y: 358, width: 56 },
  },
  {
    id: 'metheus',
    x: 780,
    y: 350,
    spriteWidth: 180,
    spriteSrc: '/houses/metheus.png',
    label: 'Metheus',
    signText: 'Metheus',
    ariaLabel: "Enter Metheus's study",
    route: '/metheus',
    signpost: { x: 695, y: 360 },
    groundingPad: { x: 780, y: 352, width: 160 },
    prop: { src: '/props/metheus-mailbox.png', x: 755, y: 358, width: 48 },
  },
  {
    id: 'gale',
    x: 225,
    y: 475,
    spriteWidth: 155,
    spriteSrc: '/houses/gale.png',
    label: 'Gale',
    signText: 'Gale',
    ariaLabel: "Enter Gale's loft",
    route: '/gale',
    signpost: { x: 310, y: 485 },
    groundingPad: { x: 225, y: 477, width: 140 },
    prop: { src: '/props/gale-fence.png', x: 260, y: 482, width: 56 },
  },
  {
    id: 'comingSoon',
    x: 735,
    y: 475,
    spriteWidth: 160,
    spriteSrc: '/houses/coming-soon-house.png',
    label: 'Coming soon',
    signText: 'Coming\nSoon',
    ariaLabel: 'Future agent home coming soon',
    disabled: true,
    signpost: { x: 650, y: 485 },
    groundingPad: { x: 735, y: 477, width: 140 },
    prop: { src: '/props/coming-soon-debris.png', x: 710, y: 482, width: 48 },
  },
];
```

- [ ] **Step 4: Patch the one remaining `signOffsetY` reference in HUD render**

Locate line ~396 (inside the HUD `DESTINATIONS.map((dest) => {...})` block — it will be removed entirely in Task 5, but for now fix the type error):

```ts
: projectY(dest.y + (dest.signOffsetY ?? 30));
```

Change to:

```ts
: projectY(dest.y + 30);
```

- [ ] **Step 5: Run build to confirm clean TypeScript**

Run:
```bash
cd ~/Developer/trading_agent_dash && npm run build
```

Expected: clean build. No TypeScript errors.

- [ ] **Step 6: Run test suite (regression)**

Run:
```bash
npm test -- --run
```

Expected: 24/24 tests passing.

- [ ] **Step 7: Commit**

Run:
```bash
git add src/pages/TownSquarePage.tsx
git commit -m "feat(town-square): extend Destination type with signpost/prop/groundingPad + Z layer bands"
```

---

## Task 2: Move house + avatar onto Z.scene layer band

Required BEFORE rendering grounding pads / props (otherwise houses paint BELOW their grounding pads, which is wrong).

**Files:**
- Modify: `src/pages/TownSquarePage.tsx` (house button zIndex expression + avatar style)
- Modify: `src/styles/globals.css` (remove `.town-avatar { z-index: 100 }`)

- [ ] **Step 1: Update house button zIndex**

In `TownSquarePage.tsx`, inside the DESTINATIONS.map rendering the house `<button>` (~line 331), find:

```ts
const zIndex = Math.round(dest.y);
```

Change to:

```ts
const zIndex = Z.scene + Math.round(dest.y);
```

- [ ] **Step 2: Add explicit avatar zIndex inline**

Locate the avatar `<img>` element (~lines 365–378). Its inline `style` currently contains `left`, `top`, `width`, `height`. Add `zIndex`:

```tsx
style={{
  left: avatarPos.x,
  top: avatarPos.y,
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  zIndex: Z.scene + Math.round(avatarPos.y),
}}
```

- [ ] **Step 3: Remove hardcoded z-index from `.town-avatar` CSS**

In `src/styles/globals.css`, locate the `.town-avatar { ... }` block (~line 887). Delete the line:

```css
z-index: 100;
```

(Leave the rest of the block intact — transition, pointer-events, image-rendering, etc.)

- [ ] **Step 4: Build + test**

```bash
npm run build && npm test -- --run
```

Expected: clean build; 24/24 passing.

- [ ] **Step 5: Visual sanity — depth sort intact**

Open http://localhost:5173/, dismiss welcome modal, tap Metheus's house. As the avatar walks across the plaza:
- Verify avatar paints IN FRONT of Gale's house when its world-y exceeds Gale's y=475.
- Verify avatar paints BEHIND Metheus's house when its world-y is less than Metheus's y=350.
- Houses still depth-sort among themselves correctly.

- [ ] **Step 6: Commit**

```bash
git add src/pages/TownSquarePage.tsx src/styles/globals.css
git commit -m "refactor(town-square): move house + avatar onto Z.scene layer band"
```

---

## Task 3: Add CSS for new world-layer elements (grounding pad, prop, signpost, pan hint)

**Files:**
- Modify: `src/styles/globals.css` — insert new block after `.town-house-pulse` (~line 738)

- [ ] **Step 1: Locate insertion point**

Run:
```bash
grep -n "town-house-pulse" ~/Developer/trading_agent_dash/src/styles/globals.css
```

Expected: the `.town-house-pulse` rule block ends with a closing brace somewhere around line 738. Insert the new CSS AFTER that closing brace and BEFORE the `/* Screen-space HUD layer. ... */` comment.

- [ ] **Step 2: Insert the new CSS block**

Paste the following block at the insertion point identified in Step 1:

```css
/* Shared grounding pad under each house base. Irregular dirt/grass
   patch that softens the hard PNG seam where the house sprite meets
   the plaza. Replaces the 14px CSS ::after radial shadow from PR #9.
   Time-of-day tint applies (rules further below). */
.town-grounding-pad {
  position: absolute;
  image-rendering: pixelated;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

/* Per-house diegetic prop — stones / mailbox / fence / debris. Bleeds
   onto the plaza from the house base edge. pointer-events:none so it
   never blocks the house tap. */
.town-house-prop {
  position: absolute;
  image-rendering: pixelated;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

/* In-world wooden signpost — replaces all 5 HUD signs from R5. Lives
   inside .town-world, scales with the world transform, always readable
   via the Z.signpost layer band. Text is CSS-overlaid on the plaque
   using the 16px + scale(0.5) pattern to avoid iOS Safari's aggressive
   anti-aliasing below ~10px.

   The outer .town-signpost button holds the world-anchor transform
   (translate to anchorX/Y). Hover effects apply to .town-signpost-inner
   so they don't fight the anchor transform. */
.town-signpost {
  position: absolute;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  pointer-events: auto;
  line-height: 0;
}
.town-signpost:focus-visible {
  outline: none;
}
.town-signpost-inner {
  display: block;
  position: relative;
  transition: transform 180ms ease, filter 180ms ease;
}
.town-signpost:hover .town-signpost-inner,
.town-signpost:focus-visible .town-signpost-inner {
  transform: translateY(-2px);
  filter: brightness(1.08);
}
.town-signpost-sprite {
  display: block;
  width: 100%;
  height: auto;
  image-rendering: pixelated;
  -webkit-user-drag: none;
  user-select: none;
}
.town-signpost-label {
  position: absolute;
  top: 28%;    /* lands on plaque face; tune per actual asset */
  left: 50%;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: #2b1d0f;
  letter-spacing: 0.01em;
  white-space: pre-line;   /* honor \n in signText for multi-line */
  text-align: center;
  line-height: 0.9;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.5);
  transform-origin: center center;
}
.town-signpost--disabled {
  cursor: not-allowed;
  opacity: 0.78;
  filter: saturate(0.6);
}
.town-signpost--disabled:hover .town-signpost-inner,
.town-signpost--disabled:focus-visible .town-signpost-inner {
  transform: none;  /* no hover lift on disabled */
}

/* Time-of-day tinting applies to every new in-world pixel-art layer */
body[data-mode="dusk"] .town-house-prop,
body[data-mode="dusk"] .town-grounding-pad,
body[data-mode="dusk"] .town-signpost-sprite {
  filter: brightness(0.86) saturate(1.15);
}
body[data-mode="moonlit"] .town-house-prop,
body[data-mode="moonlit"] .town-grounding-pad,
body[data-mode="moonlit"] .town-signpost-sprite {
  filter: brightness(0.58) saturate(0.78);
}

/* Mobile pan hint — ephemeral "Drag to explore" toast that appears
   once after welcome dismiss on mobile viewports. Hidden on desktop
   (≥768px) and after the first timeout fires (localStorage-guarded in
   the component). */
.town-pan-hint {
  position: fixed;
  bottom: max(24px, env(safe-area-inset-bottom, 24px));
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 18px;
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: rgba(20, 14, 8, 0.78);
  border-radius: 20px;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  pointer-events: none;
  z-index: 9999;
  letter-spacing: 0.02em;
}
@media (min-width: 768px) {
  .town-pan-hint { display: none; }
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean. CSS is parsed at build time; any syntax errors surface here.

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(town-square): add CSS for signpost, grounding pad, diegetic prop, pan hint"
```

---

## Task 4: Render grounding pad + diegetic prop layers

**Files:**
- Modify: `src/pages/TownSquarePage.tsx` — insert two new render blocks inside `.town-world`

- [ ] **Step 1: Locate the insertion point**

Inside the `<div className="town-world">` block, the render order is currently: bg → tint → lamp glow → DESTINATIONS.map (houses + gym-hit) → avatar. The DESTINATIONS.map block ends around line 360 with `})}`. Insert the new layers IMMEDIATELY AFTER that closing `})}` and BEFORE the avatar `<img>` element (~line 365).

- [ ] **Step 2: Insert grounding pad + prop render blocks**

Paste this block in the position identified in Step 1:

```tsx
{/* Grounding pad layer — under each house, above plaza. Renders before
    the house sprite in DOM order AND has a lower z-index band. */}
{DESTINATIONS.filter((d) => d.groundingPad).map((dest) => {
  const pad = dest.groundingPad!;
  return (
    <img
      key={`pad-${dest.id}`}
      src="/props/grounding-pad.png"
      alt=""
      className="town-grounding-pad"
      draggable={false}
      style={{
        left: pad.x,
        top: pad.y,
        width: pad.width,
        transform: `translate(-${pad.anchorX ?? 50}%, -${pad.anchorY ?? 100}%)`,
        zIndex: Z.groundingPad + Math.round(pad.y),
      }}
    />
  );
})}

{/* Diegetic prop layer — stones / mailbox / fence / debris. Overlaps
    the seam where the house base meets the plaza. Shares the scene
    layer band with houses + avatar for proper depth sort. */}
{DESTINATIONS.filter((d) => d.prop).map((dest) => {
  const p = dest.prop!;
  return (
    <img
      key={`prop-${dest.id}`}
      src={p.src}
      alt=""
      className="town-house-prop"
      draggable={false}
      style={{
        left: p.x,
        top: p.y,
        width: p.width,
        transform: `translate(-${p.anchorX ?? 50}%, -${p.anchorY ?? 100}%)`,
        zIndex: Z.scene + Math.round(p.y) + (p.zOffset ?? 0),
      }}
    />
  );
})}
```

- [ ] **Step 3: Build + test**

```bash
npm run build && npm test -- --run
```

Expected: clean build; 24/24 passing.

- [ ] **Step 4: Visual sanity**

Open http://localhost:5173/ (welcome modal may appear if you cleared localStorage; dismiss it). Verify:
- Each of the 4 houses has a visible soft dirt/grass patch under its base (grounding pad).
- Each house has its diegetic prop peeking out: Apex stones on the left-front, Metheus mailbox on the right-front, Gale fence/chime on its front, Coming Soon crates on its left-front.
- Tapping a house still fires `walkTo` — props are pointer-events:none.
- Avatar paints OVER props it's walking in front of (correct depth).

- [ ] **Step 5: Commit**

```bash
git add src/pages/TownSquarePage.tsx
git commit -m "feat(town-square): render grounding pads + diegetic props"
```

---

## Task 5: Replace HUD navigation labels with in-world signposts

**Files:**
- Modify: `src/pages/TownSquarePage.tsx` — add signpost render inside `.town-world`; delete HUD sign render block

- [ ] **Step 1: Add in-world signpost render block**

Inside `.town-world`, after the prop layer added in Task 4 and BEFORE the avatar `<img>`, insert:

```tsx
{/* In-world wooden signposts — 5 destinations, Gym + 4 houses.
    Replaces the screen-space .town-sign-hud elements from R5. Tappable
    as secondary walkTo targets; house sprite remains primary tap.

    Outer button holds the anchor transform; inner wrapper holds the
    hover transform so the two don't fight. */}
{DESTINATIONS.filter((d) => d.signpost).map((dest) => {
  const sp = dest.signpost!;
  return (
    <button
      key={`signpost-${dest.id}`}
      type="button"
      className={`town-signpost${dest.disabled ? ' town-signpost--disabled' : ''}`}
      onClick={() => {
        if (!dest.disabled) walkTo(dest);
      }}
      aria-disabled={dest.disabled ? 'true' : undefined}
      aria-label={dest.ariaLabel ?? dest.label}
      style={{
        left: sp.x,
        top: sp.y,
        width: sp.width ?? DEFAULT_SIGNPOST_WIDTH,
        transform: `translate(-${sp.anchorX ?? 50}%, -${sp.anchorY ?? 100}%)`,
        zIndex: Z.signpost + Math.round(sp.y),
      }}
    >
      <span className="town-signpost-inner">
        <img
          src="/signposts/signpost.png"
          alt=""
          className="town-signpost-sprite"
          draggable={false}
        />
        <span className="town-signpost-label">
          {dest.signText ?? dest.label}
        </span>
      </span>
    </button>
  );
})}
```

- [ ] **Step 2: Delete the HUD sign render block**

In the `.town-hud` `<div>` block (starts around line 387 with the comment `{/* Screen-space HUD. ... */}`), delete the ENTIRE `DESTINATIONS.map((dest) => { ... })` block that rendered `.town-sign-hud` buttons. This is approximately lines 391–412 of the file at its current state.

After this edit, the `.town-hud` div body should contain ONLY:
- The welcome-back bulletin (`{delta && ( ... )}`)
- The ambient leaves (`{autoMode !== 'moonlit' && LEAVES.map(...)}`)

No `DESTINATIONS.map` lives in HUD anymore.

- [ ] **Step 3: Build + test**

```bash
npm run build && npm test -- --run
```

Expected: clean build. `grep -n "town-sign-hud" src/pages/TownSquarePage.tsx` should return no matches.

- [ ] **Step 4: Visual sanity**

Open http://localhost:5173/. Verify:
- Five wooden signposts are visible: one at the gym facade side (near doorway), four at path terminals near each house.
- Each signpost has crisp readable text on its plaque (Apex / Metheus / Gale / Coming Soon / Trading Gym).
- Tapping a signpost walks the avatar to that destination (same routing as tapping the house).
- Tapping a house also routes — both are valid tap targets.
- Coming Soon signpost looks dimmed/desaturated and does NOT route on tap.
- NO brown pill-shaped HUD labels float over the world anymore.

- [ ] **Step 5: Commit**

```bash
git add src/pages/TownSquarePage.tsx
git commit -m "feat(town-square): replace HUD labels with in-world signposts (5 destinations incl. gym)"
```

---

## Task 6: Add mobile pan hint

**Files:**
- Modify: `src/pages/TownSquarePage.tsx` — new state + useEffect + JSX in HUD

- [ ] **Step 1: Add pan hint state**

Inside `TownSquarePage()`, after the `showWelcome` state hook (~lines 154–161), insert:

```tsx
const [showPanHint, setShowPanHint] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  // Desktop: no hint.
  if (window.matchMedia('(min-width: 768px)').matches) return false;
  try {
    return localStorage.getItem('panHintShown') !== 'true';
  } catch {
    return false;
  }
});
```

- [ ] **Step 2: Add fade-out effect**

After the existing avatar drop-in useEffects (around lines 172–176), insert:

```tsx
useEffect(() => {
  if (showWelcome || !showPanHint) return;
  const t = window.setTimeout(() => {
    setShowPanHint(false);
    // Only mark permanently shown if the user was actually visible-to-page
    // when the timer fired. If they were tab-switched away, let them see it
    // next visit. Graceful: document may not exist in SSR.
    const isVisible =
      typeof document !== 'undefined' && document.visibilityState === 'visible';
    if (isVisible) {
      try {
        localStorage.setItem('panHintShown', 'true');
      } catch {
        // ignore storage failures
      }
    }
  }, 4000);
  return () => window.clearTimeout(t);
}, [showWelcome, showPanHint]);
```

- [ ] **Step 3: Render hint inside `.town-hud`**

Inside the `.town-hud` div (after the ambient leaves block, before the closing `</div>`), insert:

```tsx
{showPanHint && (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.35 }}
    className="town-pan-hint"
    aria-hidden="true"
  >
    ← Drag to explore →
  </motion.div>
)}
```

- [ ] **Step 4: Build + test**

```bash
npm run build && npm test -- --run
```

Expected: clean build; 24/24 passing.

- [ ] **Step 5: Visual sanity — mobile viewport only**

Use Playwright MCP or Chrome DevTools mobile emulation at 393×852. In the browser console: `localStorage.clear()` then reload. Dismiss welcome modal. Expect:
- Small dark pill appears at bottom center: "← Drag to explore →".
- Fades out after ~4 seconds.
- Reload again — toast does NOT reappear (localStorage guard).
- Resize to 1440×900 (desktop) — toast never appears.

- [ ] **Step 6: Commit**

```bash
git add src/pages/TownSquarePage.tsx
git commit -m "feat(town-square): mobile 'Drag to explore' pan hint after welcome dismiss"
```

---

## Task 7: Remove stale CSS — `.town-house::after` shadow + dead `.town-sign-hud` rules

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Delete the `.town-house::after` block**

Locate the `.town-house::after { content: ""; ... }` block in `globals.css` (lines 684–696 of the current file). Delete the entire rule block including its closing `}`. Grounding pad now carries the shadow work.

- [ ] **Step 2: Check if `.town-sign-hud` CSS is still referenced**

Run:
```bash
grep -rn "town-sign-hud" ~/Developer/trading_agent_dash/src
```

Expected: no matches in `src/` after Task 5 deleted the render. (If there are unexpected matches, investigate before deleting CSS.)

- [ ] **Step 3: Delete dead `.town-sign-hud` CSS rules**

Locate and delete these blocks in `globals.css` (lines ~755–794 of the current file):
- `.town-sign-hud { ... }`
- `.town-sign-hud:hover, .town-sign-hud:focus-visible { ... }`
- `.town-sign-hud:active { ... }`
- `.town-sign-hud--disabled { ... }`

- [ ] **Step 4: Build + test**

```bash
npm run build && npm test -- --run
```

Expected: clean build; 24/24 passing.

- [ ] **Step 5: Visual sanity**

Reload http://localhost:5173/. Houses still look grounded — now via the PNG grounding pad, not the CSS radial shadow. Should read more pixel-native; less "modern CSS blur" vibe at house bases.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css
git commit -m "chore(town-square): remove CSS ::after shadow + dead .town-sign-hud rules"
```

---

## Task 8: Playwright verification pass (desktop + mobile)

No code changes. Verification only. If any bug surfaces, open a follow-up task (e.g., tune a signpost position) on this same branch before PRing.

- [ ] **Step 1: Confirm dev server is running**

Visit http://localhost:5173/ in Playwright (or browser). If the server died, restart: `cd ~/Developer/trading_agent_dash && npm run dev` in a background process.

- [ ] **Step 2: Desktop pass (1440×900) — 3 screenshots**

Drive Playwright MCP:
- `browser_resize(1440, 900)`
- `browser_evaluate('() => localStorage.clear()')`
- `browser_navigate('http://localhost:5173/')`
- Confirm welcome modal renders, dismiss with "Start exploring →".
- **Screenshot `slice-1a-desktop-plaza.png`** — centered plaza, daytime mode. Verify: 5 signposts readable (Gym, Apex, Metheus, Gale, Coming Soon), 4 grounding pads under houses, 4 diegetic props visible, avatar dropped in.
- Click `dusk` button in mode switcher. **Screenshot `slice-1a-desktop-dusk.png`** — verify tint applies uniformly to plaza + houses + props + grounding pads + signpost sprites. Signpost text still readable.
- Click `moonlit`. **Screenshot `slice-1a-desktop-moonlit.png`** — same verification.
- Click `auto` to restore. Tap each signpost (Apex, Metheus, Gale, Gym) — verify routing to `/apex`, `/metheus`, `/gale`, `/gym`. Back to plaza between each.
- Tap Coming Soon signpost — verify no-op (stays on `/`). Keyboard-focus it with Tab — should receive focus (aria-disabled, not disabled).
- Tap Apex house sprite directly — same route fires (primary tap target intact).
- DOM check: `grep`-equivalent via `browser_evaluate('() => document.querySelectorAll(".town-sign-hud").length')` should return 0.

- [ ] **Step 3: Mobile pass (393×852) — 4 screenshots**

- `browser_resize(393, 852)`
- `browser_evaluate('() => localStorage.clear()')`
- `browser_navigate('http://localhost:5173/')`
- Confirm welcome modal; dismiss.
- **Screenshot `slice-1a-mobile-plaza.png`** — confirm "← Drag to explore →" pan hint is visible at bottom. Wait 5s; confirm fade out.
- Reload: confirm pan hint does NOT reappear (localStorage guard).
- Pan left: `browser_evaluate('() => { const v = document.querySelector(".town-viewport"); v.scrollTo({left: 0, behavior: "instant"}); }')`. **Screenshot `slice-1a-mobile-pan-left.png`** — verify Apex signpost reads near Apex's house, Gale signpost reads near Gale's house. No label overlap with wrong house.
- Pan right: `browser_evaluate('() => { const v = document.querySelector(".town-viewport"); v.scrollTo({left: v.scrollWidth, behavior: "instant"}); }')`. **Screenshot `slice-1a-mobile-pan-right.png`** — verify Metheus + Coming Soon signposts read cleanly.
- Tap Apex signpost. Wait for route transition. **Screenshot `slice-1a-mobile-apex-focus.png`** — verify bottom-sheet Focus Mode renders correctly with Apex card.

- [ ] **Step 4: Coming Soon interaction state — 1 screenshot**

- Back to `/`.
- Pan right so Coming Soon signpost is visible.
- Hover/focus on it (`browser_hover` on the signpost ref).
- **Screenshot `slice-1a-coming-soon-disabled.png`** — verify dimmed + desaturated styling, no hover lift (disabled state suppresses inner transform per CSS rule).

- [ ] **Step 5: Report screenshot paths**

Report the 8 saved screenshot paths back. If anything's off, open follow-up tasks on this branch before PRing.

- [ ] **Step 5: Git log check**

```bash
git log --oneline main..HEAD
```

Expected: ~7 commits covering Tasks 1–7.

---

## Task 9: Open pull request

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase-5-slice-1a-integration
```

- [ ] **Step 2: Create the PR**

```bash
cd ~/Developer/trading_agent_dash && gh pr create --title "Phase 5 Slice 1a: Town Square integration — grounding pads, diegetic props, in-world signposts, mobile pan hint" --body "$(cat <<'EOF'
## Summary
- **Houses feel planted:** shared `grounding-pad.png` under each house + per-house diegetic prop (Apex stepping stones, Metheus mailbox+ivy, Gale picket-fence+chime, Coming Soon crates) soften the seam where house sprites meet the plaza.
- **All 5 destination labels in world-space:** single wooden signpost asset at path terminals + gym facade, no more screen-space HUD navigation labels. Coming Soon uses `aria-disabled` so keyboard/screen-reader users can still discover it.
- **Universal Y-sort via layer bands:** `Z.plaza(0) < Z.groundingPad(50) < Z.scene(100) + round(y) < Z.signpost(1000) + round(y)`.
- **Font anti-alias fix:** signpost text renders at 16px with `transform: scale(0.5)` so iOS Safari doesn't blur sub-10px type.
- **Mobile pan hint:** "← Drag to explore →" toast appears once after welcome dismiss on mobile viewports only, 4s fade, localStorage-guarded.
- **Cleanup:** removed the 14px CSS `::after` radial shadow (grounding pad supersedes it) and dead `.town-sign-hud` CSS.

## Test plan
- [ ] `npm run build` clean
- [ ] `npm test` 24/24 passing (regression only; no new tests per spec)
- [ ] Playwright desktop 1440×900: 5 signposts readable, each routes, houses still tappable, time-of-day modes all correct
- [ ] Playwright mobile 393×852: pan hint once, localStorage guard works, signposts don't overlap the wrong house
- [ ] Focus Mode (`/apex`, `/gale`, `/metheus`, `/gym`) all still render correctly from signpost taps

## Out of scope for this slice
Virtual joystick, P&L time filter, trade log list, walk-cycle sprite frames, settlement animations, open-position data, pre-existing React nested-button warning — all tracked in vault progress log for Phase 5 Slice 1b+ and beyond.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report PR URL to Brandon**

Print the URL from the `gh pr create` output. Do NOT auto-merge. Brandon reviews + decides merge timing.

---

## Self-review checklist (pre-handoff)

After writing all the above, confirm:

1. **Spec coverage:**
  - Grounding pad render → Task 4 ✓
  - Diegetic prop render → Task 4 ✓
  - In-world signposts for all 5 destinations → Task 5 ✓
  - HUD navigation labels removed → Task 5 ✓
  - Universal Y-sort (houses, avatar, props, signposts) → Tasks 1, 2, 4, 5 ✓
  - `aria-disabled` on Coming Soon → Task 1 (data) + Task 5 (render) ✓
  - 16px + scale(0.5) signpost font → Task 3 (CSS) ✓
  - `signText` separate from `label` → Task 1 (type + data) ✓
  - `ariaLabel` fields → Task 1 ✓
  - Per-asset anchor metadata (`anchorX/anchorY/zOffset`) → Task 1 (type) + Tasks 4, 5 (render) ✓
  - Mobile pan hint → Task 6 ✓
  - CSS `::after` shadow removed → Task 7 ✓
  - Dead `.town-sign-hud` cleanup → Task 7 ✓
  - Time-of-day tint on new layers → Task 3 (CSS rules) ✓
  - Playwright verification → Task 8 ✓
  - PR → Task 9 ✓

2. **No placeholders:** No TODO / TBD / "implement later" / vague "handle edge cases". All code shown inline.

3. **Type consistency:**
  - `Z.scene + Math.round(y)` used identically in houses (Task 2), props (Task 4), avatar (Task 2).
  - `Z.signpost + Math.round(sp.y)` for signposts (Task 5).
  - `Z.groundingPad + Math.round(pad.y)` for grounding pads (Task 4).
  - Field names (`signpost`, `groundingPad`, `prop`, `signText`, `ariaLabel`, `anchorX`, `anchorY`, `zOffset`) match between type (Task 1) and render (Tasks 4, 5).

4. **Ordering correct:** Task 2 (z-index band) executes BEFORE Task 4 (grounding pad render) so that grounding pads correctly paint UNDER houses (grounding pad `50+round(y)` < scene house `100+round(y)`). Task 5 (remove HUD signs) executes AFTER Task 1 (where `signOffsetY` reference was temporarily patched to `30`).
