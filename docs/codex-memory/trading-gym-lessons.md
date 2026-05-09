# Trading Gym Codex Memory

This file captures the project-specific lessons Codex should carry into future work on the Trading Gym dashboard. It is intentionally limited to this repo's UI/game work, not a dump of the full local Codex memory folder.

## Working Defaults

- Use the `trading_agent_dash_world_v2` project for current work unless the user explicitly asks for the older checkout.
- Keep the local Vite server running unless the user explicitly asks to stop it. The normal local URL is `http://127.0.0.1:5173/`.
- Use Playwright/browser visual inspection for page, animation, layout, and performance tasks instead of relying only on code review.
- Clean up temporary screenshots, videos, contact sheets, chroma-key intermediates, and Playwright artifacts after visual QA.
- Do not revert unrelated worktree changes while making follow-up edits.

## Visual Direction

- Art-style consistency with Apex is a real acceptance criterion.
- Apex-adjacent sprites should be painterly bitmap/chibi RPG assets, not deterministic vector, CSS, or Pillow-looking redraws.
- For new small character sprites, generate bitmap art on a flat `#ff00ff` chroma-key background, then remove the chroma key locally.
- Keep original generated image files in the local generated-images area unless the user explicitly asks to delete them.

## Room Sprite State

- Room animation routing lives in `src/components/world/roomSceneConfig.ts`.
- `src/components/world/SpriteAnimator.tsx` stamps `data-frame` on the animator and parent so frame-specific effects can sync to animation frames.
- Apex uses the battle rig. The punching bag recoil is frame-driven in `src/styles/globals.css`, with recoil keyed to punch frames.
- Metheus and Gale room animations use generated 6-frame sheets with the same framing convention as Apex room animations where practical.
- Current important room assets include:
  - `public/sprites/metheus/animations/scroll-study.png`
  - `public/sprites/gale/animations/weather-cast.png`
  - `public/sprites/{apex,gale,metheus}/rotations/{south,north,east,west}.png`
  - `public/sprites/{apex,gale,metheus}/metadata.json`

## Performance Lessons

- Room and gym performance depends on mounting only what is active.
- `WorldLayer` should receive the active room and avoid rendering inactive room hotspots/effects.
- Gale weather effects should only mount while Gale is the active room.
- Avoid blanket preloading of heavy room assets unless it is proven necessary.
- Trim heavy filters and backdrop filters before chasing smaller optimizations.
- Validate animation smoothness with real browser/FPS checks when performance is part of the request.

## Town Ambient State

- Town plaza ambient effects live in `src/components/world/TownAmbientLayer.tsx` and mount from `src/pages/TownSquarePage.tsx`.
- Final ambient assets live under `public/fx/`.
- Preserve the town leaves unless the user asks otherwise.
- Bird, butterfly, and smoke sprite sheets should use valid frame-width/background-position stepping. Do not step sprite sheets to invalid values such as `-400%`.
- Cloud shadows are CSS radial overlays.
- Do not reintroduce crop-based tree-canopy, banner, sign, or chime wobble over baked map regions. That approach caused blurry warped-space distortion.
- The verified final town ambient DOM should not contain `.town-canopy-sprite` or `.town-hanging-sprite` nodes.

## Verification History

Past successful verification included:

- `npm run build`
- `npm test -- tests/components/SpriteAnimator.test.tsx tests/pages/GymPage.test.tsx tests/components/AgentAvatar.test.tsx`
- `npm test -- tests/pages/TownSquarePage.test.tsx`
- Browser visual checks on `/apex`, `/metheus`, `/gale`, `/gym`, and `/`
- FPS samples showing smooth room and town plaza rendering after the active-room optimization
