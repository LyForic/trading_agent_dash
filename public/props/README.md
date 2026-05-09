# public/props/

Legacy per-house diegetic grounding props from the first composited Town Square pass. The active overworld bakes house grounding, paths, and props directly into `public/rooms/town-overworld.png`.

Expected files (drop them here as PixelLab generates them):

| File | Agent | Suggested size | Purpose |
|---|---|---|---|
| `apex-stones.png` | Apex | 48×24 | Three-stone stepping-stone cluster leading to the dojo door |
| `metheus-mailbox.png` | Metheus | 24×40 | Victorian wrought-iron mailbox with small ivy spill |
| `gale-fence.png` | Gale | 48×28 | Small white picket fence section with hanging wind chime |
| `coming-soon-debris.png` | Coming Soon | 48×24 | Stacked planks + rolled blueprint + stone block (construction vibe) |

PixelLab prompt text for each sprite lives in vault `2026-04-24-phase-5-slice-1a-design.md` §PixelLab prompts.

Format for any future standalone prop work: transparent PNG, oblique 3/4 camera matching `public/rooms/town-overworld.png`, cozy 16-bit pixel-art style.

Growth pattern: adding a new agent house means adding one new prop here that fits that agent's character (mailbox / fence / tools / instrument). Plaza and house sprites stay untouched.
