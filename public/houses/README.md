# public/houses/

Per-agent house sprites for the Town Square (Phase 4 Slice 3). Each house is a 192×192 PNG with a transparent background, composited onto `public/rooms/town-square.png` in code.

Expected files (drop them here as PixelLab generates them):

| File | Agent | PixelLab prompt lives in |
|---|---|---|
| `apex.png` | Apex — blue-roofed Japanese dojo | vault `2026-04-23-town-square-art-brief.md` §Apex |
| `gale.png` | Gale — cream + teal weather loft | vault brief §Gale |
| `metheus.png` | Metheus — brown-brick Victorian study | vault brief §Metheus |

Growth pattern: a fourth agent's house is just one more 192×192 transparent PNG dropped in here; the plaza background never needs to be redrawn.

The plaza exterior itself lives at `public/rooms/town-square.png` (next to the four interior rooms). Interiors are reused — houses open into the existing `apex.png` / `gale.png` / `metheus.png` rooms.
