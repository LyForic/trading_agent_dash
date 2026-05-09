# public/signposts/

Shared wooden signpost sprite used as the in-world label for each house in the Town Square (Phase 5 Slice 1a). One sprite, reused 4× at path-terminal positions — the text label is CSS-overlaid on the plaque, so the same PNG serves every agent (and every future Coming Soon slot).

Expected files (drop them here as PixelLab generates them):

| File | Purpose | PixelLab prompt lives in |
|---|---|---|
| `signpost.png` | Small wooden signpost — warm-brown post driven into dirt patch with grass tufts, blank rectangular plaque at top | vault `2026-04-24-phase-5-slice-1a-design.md` §PixelLab prompts → Signpost |

Suggested size: 16×24 to 24×32 transparent PNG, oblique 3/4 camera matching `public/rooms/town-overworld.png`.

Growth pattern: if a future Coming Soon slot gets its own distinct wayfinding treatment, drop an additional variant here (e.g. `signpost-portal.png`). The shared default stays as `signpost.png`.
