#!/usr/bin/env python3
import argparse
import base64
import json
import os
from pathlib import Path
from typing import Iterable

from openai import OpenAI
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "private/world-v2/source/meridian-expansion/gpt-image-2"
PUBLIC_LAYER_DIR = ROOT / "public/world-v2/layers"
FULL_SIZE = (2560, 1536)
CURRENT_WORLD_OFFSET_X = 512
CURRENT_WORLD_SIZE = (2048, 1536)
LEFT_EXTENSION_WIDTH = 512
MERIDIAN_OVERLAY_CROP = {
    "x": 512,
    "y": 760,
    "width": 1040,
    "height": 776,
}
WORLD_CHUNKS = [
    { "src": "bacon-fullmap-west-v1.png", "x": 512, "y": 0, "width": 512, "height": 1024 },
    { "src": "bacon-fullmap-core-0-v1.png", "x": 1024, "y": 0, "width": 512, "height": 1024 },
    { "src": "bacon-fullmap-core-1-v1.png", "x": 1536, "y": 0, "width": 512, "height": 1024 },
    { "src": "bacon-fullmap-core-2-v1.png", "x": 2048, "y": 0, "width": 512, "height": 1024 },
    { "src": "nova-south-alpha-chunk-v1.png", "x": 512, "y": 880, "width": 2048, "height": 656 },
]


PROMPT = """Use case: stylized-concept
Asset type: 2D isometric cozy pixel-art game world map extension and localized map replacement.
Input image role: The image is the current expanded Living World map placed on the right with a transparent 512px extension area on the left. Only the transparent/masked areas may change. Preserve all unmasked existing map pixels, geometry, paths, scale, perspective, object density, lighting language, and cozy painterly-pixel style.

Primary request: Create a new agent area for Meridian in the bottom-left of the world. Meridian trades ETH and is a Qi master with a wuxia-inspired martial/chivalry theme. The new area should replace the lower-left pond/forest region and extend further left so it has enough room.

Layout:
- Use the full left extension as a natural forest/stone-path expansion beside Bacon, with some quieter empty space and path forks for future areas.
- Build Meridian's main area in the lower-left/bottom region, connected to the existing Bacon/Nova paths.
- The overall new silhouette should feel like a lower-case b: a vertical left-side extension beside Bacon, then a larger rounded Meridian area at the bottom.
- Keep clear walkable paths. Do not fill every path with props.
- Seamlessly continue the old cobblestone/dirt paths, forest, stone cliffs, water edges, flowers, lamps, and greenery into the new area.

Meridian area theme:
- A Qi master / wuxia training sanctuary in the same cozy RPG map style.
- Main landmark: a compact Chinese-inspired mountain pavilion or dojo courtyard, warm wooden beams, curved tiled roof, paper lanterns, stone steps, and a circular qi-meditation platform.
- Environmental details: bamboo clusters, mossy stone lanterns, small waterfall or stream, lotus pond edges, tai chi / qi training circle, weapon rack with staffs/spears, scroll stand, incense burner, tea table, jade-green energy crystals, bronze/gold lantern glow, red/gold tassels, and small shrine rocks.
- Mood: elegant, calm, disciplined, mystical, warm, lush, readable, and playable.

Art direction:
- Match the existing high-detail isometric painterly pixel-art map exactly: same camera angle, scale, line weight, prop density, saturated forest greens, warm lanterns, blue water, stone texture, and cozy game readability.
- Use broad wuxia/Qi-master fantasy cues only. Do not directly copy any existing game, character, logo, building, or recognizable copyrighted design.

Hard constraints:
- Preserve every unmasked existing-map pixel. Do not repaint, blur, resize, darken, crop, move, or restyle unmasked regions.
- Avoid hard rectangle seams, dirty blur, foggy transition bands, or muddy camera-lens effects.
- No characters, UI, text, labels, logos, watermarks, giant empty fields, photorealism, modern objects, or copied agent landmarks from Apex/Bacon/Gale/Metheus/Nova.
- Do not place large objects that block all obvious walking routes.
"""


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def compose_current_world() -> Image.Image:
    canvas = Image.new("RGBA", FULL_SIZE, (0, 0, 0, 0))
    for chunk in WORLD_CHUNKS:
        image = Image.open(PUBLIC_LAYER_DIR / chunk["src"]).convert("RGBA")
        expected = (chunk["width"], chunk["height"])
        if image.size != expected:
            raise ValueError(f"{chunk['src']} must be {expected}, got {image.size}")
        canvas.alpha_composite(image, (chunk["x"], chunk["y"]))
    return canvas


def editable_polygons() -> list[list[tuple[int, int]]]:
    # Canvas coordinates. The current world starts at x=512, so this lower
    # polygon reaches into the existing lower-left pond/tree area while leaving
    # Nova's main right-side area dominant.
    return [
        [
            (430, 708),
            (650, 758),
            (880, 818),
            (1032, 928),
            (1120, 1116),
            (1178, 1378),
            (1068, 1536),
            (0, 1536),
            (0, 420),
            (376, 506),
        ],
    ]


def build_edit_alpha(soft: bool = False) -> Image.Image:
    alpha = Image.new("L", FULL_SIZE, 0)
    draw = ImageDraw.Draw(alpha)
    draw.rectangle((0, 0, LEFT_EXTENSION_WIDTH, FULL_SIZE[1]), fill=255)
    for polygon in editable_polygons():
        draw.polygon(polygon, fill=255)
    if soft:
        alpha = alpha.filter(ImageFilter.GaussianBlur(10))
    return alpha


def build_mask(edit_alpha: Image.Image) -> Image.Image:
    # OpenAI edit mask convention used by the existing Bacon script:
    # transparent alpha is editable; opaque alpha is preserved.
    mask = Image.new("RGBA", FULL_SIZE, (255, 255, 255, 255))
    inverted = ImageChops.invert(edit_alpha)
    mask.putalpha(inverted)
    return mask


def build_mask_preview(source: Image.Image, edit_alpha: Image.Image) -> Image.Image:
    preview = source.convert("RGBA")
    overlay = Image.new("RGBA", FULL_SIZE, (43, 255, 143, 0))
    overlay.putalpha(edit_alpha.point(lambda value: min(132, value)))
    preview.alpha_composite(overlay)
    return preview


def image_difference_stats(left: Image.Image, right: Image.Image, preserve_alpha: Image.Image) -> dict[str, float | int]:
    diff = ImageChops.difference(left.convert("RGB"), right.convert("RGB"))
    preserve_mask = ImageChops.invert(preserve_alpha)
    stat = ImageStat.Stat(diff, preserve_mask)
    mean = sum(stat.mean) / len(stat.mean)
    extrema = diff.getextrema()
    max_diff = max(channel[1] for channel in extrema)
    changed_gt_6 = 0
    total = 0
    for diff_pixel, preserve in zip(diff.convert("L").getdata(), preserve_mask.getdata()):
      if preserve <= 0:
          continue
      total += 1
      if diff_pixel > 6:
          changed_gt_6 += 1
    return {
        "mean_diff_preserved": round(mean, 4),
        "max_diff": int(max_diff),
        "changed_preserved_pct_gt_6": round((changed_gt_6 / max(1, total)) * 100, 4),
    }


def composite_generated(source: Image.Image, generated: Image.Image, edit_alpha: Image.Image) -> Image.Image:
    # Use a feathered edit mask for the final chunk/full-map preview so the
    # boundary is clean while still keeping the existing world authoritative.
    soft_alpha = edit_alpha.filter(ImageFilter.GaussianBlur(8))
    output = source.convert("RGBA")
    generated_rgba = generated.convert("RGBA")
    generated_rgba.putalpha(soft_alpha)
    output.alpha_composite(generated_rgba)
    return output


def crop_overlay_with_alpha(merged: Image.Image, edit_alpha: Image.Image) -> Image.Image:
    crop = MERIDIAN_OVERLAY_CROP
    image_crop = merged.crop((crop["x"], crop["y"], crop["x"] + crop["width"], crop["y"] + crop["height"]))
    alpha_crop = edit_alpha.filter(ImageFilter.GaussianBlur(8)).crop(
        (crop["x"], crop["y"], crop["x"] + crop["width"], crop["y"] + crop["height"])
    )
    image_crop.putalpha(alpha_crop)
    return image_crop


def save_outputs(generated_bytes: bytes, source: Image.Image, edit_alpha: Image.Image, source_dir: Path) -> dict[str, object]:
    generated_path = source_dir / "meridian-expanded-output-gpt-image-2.png"
    merged_path = source_dir / "meridian-expanded-merged-preview-v1.png"
    full_day_path = PUBLIC_LAYER_DIR / "meridian-fullmap-day-v1.png"
    west_chunk_path = PUBLIC_LAYER_DIR / "meridian-west-extension-v1.png"
    overlay_chunk_path = PUBLIC_LAYER_DIR / "meridian-lower-alpha-chunk-v1.png"
    report_path = source_dir / "meridian-expanded-report-gpt-image-2.json"

    generated_path.write_bytes(generated_bytes)
    generated = Image.open(generated_path).convert("RGBA")
    if generated.size != FULL_SIZE:
        raise ValueError(f"Expected API output {FULL_SIZE}, got {generated.size}")

    merged = composite_generated(source, generated, edit_alpha)
    merged.save(merged_path)
    merged.convert("RGB").save(full_day_path)
    merged.crop((0, 0, LEFT_EXTENSION_WIDTH, FULL_SIZE[1])).save(west_chunk_path)
    crop_overlay_with_alpha(merged, edit_alpha).save(overlay_chunk_path)

    report = {
        "model": "gpt-image-2",
        "quality": "high",
        "size": f"{FULL_SIZE[0]}x{FULL_SIZE[1]}",
        "worldCoordinateSpace": { "x": -1024, "y": 0, "width": FULL_SIZE[0], "height": FULL_SIZE[1] },
        "currentWorldOffset": { "x": CURRENT_WORLD_OFFSET_X, "y": 0, "width": CURRENT_WORLD_SIZE[0], "height": CURRENT_WORLD_SIZE[1] },
        "outputs": {
            "generated": str(generated_path.relative_to(ROOT)),
            "mergedPreview": str(merged_path.relative_to(ROOT)),
            "fullDay": str(full_day_path.relative_to(ROOT)),
            "westChunk": str(west_chunk_path.relative_to(ROOT)),
            "lowerOverlayChunk": str(overlay_chunk_path.relative_to(ROOT)),
        },
        "chunks": {
            "westExtension": { "x": -1024, "y": 0, "width": LEFT_EXTENSION_WIDTH, "height": FULL_SIZE[1] },
            "lowerOverlay": {
                "x": MERIDIAN_OVERLAY_CROP["x"] - CURRENT_WORLD_OFFSET_X - LEFT_EXTENSION_WIDTH,
                "y": MERIDIAN_OVERLAY_CROP["y"],
                "width": MERIDIAN_OVERLAY_CROP["width"],
                "height": MERIDIAN_OVERLAY_CROP["height"],
            },
        },
        "preservedRegionDiff": image_difference_stats(generated, source, edit_alpha),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def write_inputs(source_dir: Path) -> tuple[Path, Path, Image.Image, Image.Image]:
    source_dir.mkdir(parents=True, exist_ok=True)
    source = compose_current_world()
    edit_alpha = build_edit_alpha()
    mask = build_mask(edit_alpha)
    source_path = source_dir / "meridian-expanded-input-2560x1536.png"
    mask_path = source_dir / "meridian-expanded-mask-v1.png"
    mask_preview_path = source_dir / "meridian-expanded-mask-preview-v1.png"
    prompt_path = source_dir / "meridian-expanded-prompt-v1.md"
    source.save(source_path)
    mask.save(mask_path)
    build_mask_preview(source, edit_alpha).save(mask_preview_path)
    prompt_path.write_text(PROMPT, encoding="utf-8")
    return source_path, mask_path, source, edit_alpha


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Meridian's southwest expansion with gpt-image-2 masked edit.")
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high", "auto"])
    parser.add_argument("--skip-api", action="store_true", help="Only write input/mask/prompt files.")
    args = parser.parse_args()

    load_env_file(ROOT / ".env.local")
    source_path, mask_path, source, edit_alpha = write_inputs(args.source_dir)
    if args.skip_api:
        print(json.dumps({
            "source": str(source_path.relative_to(ROOT)),
            "mask": str(mask_path.relative_to(ROOT)),
            "prompt": str((args.source_dir / "meridian-expanded-prompt-v1.md").relative_to(ROOT)),
        }, indent=2))
        return

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY was not found in the environment or .env.local")

    client = OpenAI(api_key=api_key)
    with source_path.open("rb") as image_file, mask_path.open("rb") as mask_file:
        result = client.images.edit(
            model="gpt-image-2",
            image=image_file,
            mask=mask_file,
            prompt=PROMPT,
            size=f"{FULL_SIZE[0]}x{FULL_SIZE[1]}",
            quality=args.quality,
            output_format="png",
            background="opaque",
        )

    image_base64 = result.data[0].b64_json
    if not image_base64:
        raise RuntimeError("The API returned no image data")

    report = save_outputs(base64.b64decode(image_base64), source, edit_alpha, args.source_dir)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
