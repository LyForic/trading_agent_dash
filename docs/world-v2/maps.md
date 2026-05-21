# World V2 Maps

`world-v2-apex-slice.tmj` is the first authored game-map slice for the
living world. Open it in Tiled as a JSON map.

`world-v2-object-manifest.json` is the source-of-truth inventory for rebuilding
the flat PNG as game layers. It uses full `reference.png` pixel coordinates.
Every visible detail should be accounted for either as its own object or as a
named cluster before assets are regenerated.

Manifest roles:

- `ground-baked`: visual detail belongs in the base/ground layer.
- `walkable-ground`: custom actor navigation area. When one or more
  `walkable-ground` polygons exist for an actor zone in `?manifestRuntime`,
  they replace that zone's default rectangular walkable input. Manifest runtime
  keeps these as authored polygons instead of rasterizing them into nav cells.
- `blocking-ground`: visual detail is baked into ground, but actors cannot walk
  through it, such as pond water, cliff edges, or large rocks.
- `occluder`: separate foreground sprite/mask because actors can pass behind it.
- `decor-cluster`: small props/flowers/pots tracked as a named group so density
  is not lost during regeneration.
- `interactive`: a visible object that also maps to a POI or behavior. It only
  becomes an actor-hiding foreground sprite when `occlusion.required` is true.

Runtime rules:

- `Ground` points to the object-free ground image.
- `Reference` points to the old full composition and is only for placement QA.
- `PropsSorted` objects are rendered as Phaser images and depth-sorted by
  their `depthY` property.
- Props with `renderLayer=ground` stay below actors. Props without that flag are
  sorted against actor feet by `depthY`.
- Optional `crop=x,y,width,height` renders only a source-asset slice. Optional
  `renderX`/`renderY` can move that slice without changing collider coordinates.
  This is the preferred way to split a single sprite into a base slice plus an
  occluding canopy/top slice.
- The current large cherry tree uses generated `*-canopy`, `*-trunk`, and
  `*-base` PNGs from `scripts/split_world_v2_cherry_layers.mjs` instead of
  rectangular crops, so normal viewing does not expose hard horizontal cuts.
- `Collision` and prop-level `collider` rectangles block actor nav points.
- `Walkable` polygons define the zone navmesh input.
- `POI` points feed actor tasks and effects.
- Every prop needs an `assetStatus` so the automated map audit can distinguish
  reused placeholders from verified or regenerated assets.
- With `?debugWorld`, keys `1`, `2`, and `3` place the Apex actor at the right
  cherry tree canopy/trunk/front checkpoints for depth-order inspection.
- Use `?treeTest` for an isolated right-tree view. Use `?apexTest` for an
  isolated Apex occlusion pass; keys `0`-`9` and `-` place Apex behind/in front
  of tree, rock, fence, and bench checkpoints.
- Use `?manifestWorld` to render the flat reference with color-coded manifest
  boxes. Add `?manifestWorld&manifestRole=occluder` or another manifest role to
  inspect one layer category at a time.
- Use `?generatedGround` to preview
  `private/world-v2/source/<zone>-ground-workspace/generated-ground-preview-full.png`
  as the runtime base layer without replacing `ground.png`. Add
  `&groundZone=apex`, `&groundZone=center`, `&groundZone=gale`, or
  `&groundZone=metheus` to choose the workspace, and add `&groundOnly` to hide
  actors, props, ambient effects, and UI while judging the generated base layer
  by itself. Add `?labelGround` to load
  `label-driven-ground-preview-full.png`, `?inpaintGround` to load
  `reference-inpaint-ground-preview-full.png`, `?preservedGround` to load the
  reference-preserving ground pass, or `?approvedGround` to load an approved
  snapshot such as `approved-ground-preview-full.png` instead of the active
  generated preview. The Apex composite mask intentionally excludes the Gale
  roof/cloud context and most of the center tree until those zones get their
  own regeneration passes.
- Use `/world-v2/manifest-editor` during Vite development to manually author
  exact manifest boxes against the flat reference. Pick a zone and role filter,
  select or create an object, drag on empty map space to replace its box, drag
  the active box to move it, drag its edge/corner handles to resize it, then
  Save to write `world-v2-object-manifest.json` through the local dev server.
  For `occluder` objects and interactive objects with `occlusion required`
  checked, switch the selected object to Mask mode and place a polygon around
  the exact visible object pixels that should be removed from the ground pass.
  Drag yellow polygon points to refine them. For `blocking-ground` objects, set
  `collision kind` to `polygon`, switch to Points mode, and draw the red
  collision boundary that should block actor navigation. For `walkable-ground`
  objects, switch to Points mode and draw the teal polygon where actors are
  allowed to move. Blocking objects without collision points still fall back to
  their box.
- Run `npm run world-v2:ground-workspace` after manifest edits to rebuild the
  Apex ground-regeneration workspace in
  `private/world-v2/source/apex-ground-workspace/`. The workspace includes a
  padded reference crop, current-ground crop, role masks, a foreground-removal
  mask, a label-driven ground candidate, and `generation-guide.json` so the
  ground pass can infer unlabeled detail from the flat reference while keeping
  blockers/occluders constrained by the manifest. Foreground removal uses
  `occluder` objects plus `interactive` objects with `occlusion.required=true`,
  prefers manual object-shaped `removalMask` polygons, and falls back to
  rectangle/diff masks when no polygon exists. It also emits a
  reference-aligned inpaint candidate that removes foreground mask areas from
  the flat PNG. These candidates are preview inputs only; they do not replace
  `ground.png`. Run `npm run world-v2:ground-workspace -- center`,
  `npm run world-v2:ground-workspace -- gale`, or
  `npm run world-v2:ground-workspace -- metheus` after those zones are labeled
  to emit separate zone workspaces.
- Run `npm run world-v2:foreground-workspace -- gale` after approving a cleaned
  ground pass to cut transparent foreground sprites from the flat reference.
  The foreground builder extracts `occluder` objects and only `interactive`
  objects with `occlusion.required=true`. It uses manual `removalMask` polygons
  first, then falls back to an approved-ground diff inside each object box, and
  only uses a full rectangle if the diff cannot find enough pixels. It emits
  per-object sprites, `sprite-index.json`, `foreground-alpha-mask-full.png`, and
  `foreground-placement-preview-full.png` for placement QA.
- Add `&foregroundWorkspace` to a world preview URL to render the generated
  foreground workspace sprites in the Phaser scene, depth-sorted against actors.
  For Gale, use
  `?approvedGround&groundZone=gale&foregroundWorkspace`.
- Use `?manifestRuntime` to preview the preservation runtime: the original
  `reference.png` is the base map, `blocking-ground` manifest objects become
  nav/collision blockers using `collision.points` when present,
  `walkable-ground` objects replace default walkable rectangles for their actor
  zone with polygon-based pathing, `interactive` manifest objects become actor
  POIs, and occluders are duplicated from the flat reference as depth-sorted
  foreground sprites. Rebuild those sprites with
  `npm run world-v2:manifest-runtime-assets` after saving manifest edits.

Expansion workflow learned from Bacon/Nova:

- Preserve all approved map pixels. Do not regenerate the whole world when
  adding one area.
- Generate the new area as a full-map candidate with generous context from the
  existing world, then select the approved candidate.
- Create a rectangular runtime chunk because Phaser chunks are rectangular, but
  use alpha inside that chunk so only the new area and any tight silhouette
  overlap are visible.
- Keep the old map dominant at the boundary. If a tall new object overlaps the
  old map plane, include only a tight polygon/feathered alpha mask around that
  object instead of a broad rectangle.
- Build a full merged preview PNG from old chunks plus the alpha chunk before
  wiring labels or actors. Use small gridded crops for seam cleanup.
- If a seam artifact belongs to old pixels showing through, adjust the alpha
  mask. If the artifact is in the generated candidate itself, do a tiny masked
  image edit on the candidate and rebuild the alpha chunk.
- Add a dev flag for each expansion chunk first, then add a manifest zone so
  labels can be authored in merged-world coordinates.

Keep object placement authoritative here. In the preservation runtime, the full
reference PNG is the visual world and the manifest supplies the game layers.
