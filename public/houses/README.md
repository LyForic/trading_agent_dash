# public/houses/

Legacy per-agent house sprites from the first Town Square pass. The active overworld now bakes the houses directly into `public/rooms/town-overworld.png` so the map, buildings, lighting, and proportions share one art style.

Expected files (drop them here as PixelLab generates them):

| File | Agent | PixelLab prompt lives in |
|---|---|---|
| `apex.png` | Apex — blue-roofed Japanese dojo | vault `2026-04-23-town-square-art-brief.md` §Apex |
| `gale.png` | Gale — cream + teal weather loft | vault brief §Gale |
| `metheus.png` | Metheus — brown-brick Victorian study | vault brief §Metheus |

Growth pattern for the current baked-map approach: add or redesign agent buildings in the full overworld background first, then tune the hitboxes in `src/pages/TownSquarePage.tsx`.

The active plaza exterior lives at `public/rooms/town-overworld.png`. `town-square.png` is the original background kept for reference. Interiors are reused — houses open into the existing `apex.png` / `gale.png` / `metheus.png` rooms.
