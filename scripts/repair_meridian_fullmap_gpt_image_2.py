#!/usr/bin/env python3
import argparse
import base64
import json
import os
from pathlib import Path

from openai import OpenAI
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "private/world-v2/source/meridian-repair/gpt-image-2"
PUBLIC_LAYER_DIR = ROOT / "public/world-v2/layers"
GENERATED_DIR = PUBLIC_LAYER_DIR / "generated-candidates"
FULL_SIZE = (2560, 1536)
DAY_INPUT = PUBLIC_LAYER_DIR / "meridian-fullmap-day-v1.png"
DAY_OUTPUT = GENERATED_DIR / "fullmap-day-gpt2-v2.png"
DAY_OUTPUT_COPY = PUBLIC_LAYER_DIR / "meridian-fullmap-day-v2.png"


PROMPT = """Use case: precise-object-edit
Asset type: 2D isometric cozy pixel-art game world map repair.
Input image role: This is the full expanded Gym Live world map. Only the transparent/masked repair regions may change. Preserve every unmasked pixel.

Primary request: Repair the Meridian southwest integration spots so the new area blends naturally with Bacon and the rest of the map.

Specific fixes:
- Remove the pasted-over look where the new path intrudes across Bacon's garden beds. Restore believable garden/foliage where needed, and keep only a natural narrow path connection.
- Hide the visible vertical seam between the new west expansion and the existing Bacon area. Blend forest, flowers, stones, waterfalls, and path texture continuously across that boundary.
- Add a small readable path loop or path edge around the jade-green crystal pedestal near Meridian so it feels intentionally reachable, not isolated in shrubs.
- Keep the Meridian wuxia/Qi-master sanctuary, bamboo, pavilion, qi circle, water, crystals, and existing landmarks in the same positions.

Art direction:
- Match the existing high-detail isometric painterly pixel-art map exactly: same camera angle, tile scale, line weight, object density, warm greens, stone texture, water rendering, and cozy RPG readability.
- The repair should be crisp and clean, not blurry, foggy, muddy, or lens-like.

Hard constraints:
- Do not add characters, UI, text, labels, logos, watermarks, modern objects, or copied recognizable designs.
- Do not repaint or shift unmasked regions.
- Do not create hard rectangle seams or obvious transition bands.
- Do not remove the route from Bacon/Nova into Meridian; make the route more natural.
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


def build_edit_alpha() -> Image.Image:
    alpha = Image.new("L", FULL_SIZE, 0)
    draw = ImageDraw.Draw(alpha)

    # The most visible join: x=512 is where the new west expansion touches
    # Bacon's existing west chunk.
    draw.rounded_rectangle((456, 0, 636, 1048), radius=48, fill=255)

    # Bacon garden/path spill from the first Meridian overlay.
    draw.polygon(
        [
            (500, 618),
            (622, 596),
            (804, 628),
            (972, 748),
            (982, 884),
            (790, 912),
            (602, 858),
            (488, 764),
        ],
        fill=255,
    )

    # Green crystal reachability and surrounding transition into Meridian.
    draw.rounded_rectangle((626, 820, 920, 1084), radius=72, fill=255)
    draw.ellipse((642, 888, 862, 1068), fill=255)

    # Lower-left connection into the qi circle and water edge, kept local so
    # the rest of Meridian's composition remains stable.
    draw.polygon(
        [
            (470, 948),
            (704, 920),
            (930, 1032),
            (1012, 1250),
            (910, 1450),
            (548, 1478),
            (416, 1292),
        ],
        fill=255,
    )

    return alpha


def build_mask(edit_alpha: Image.Image) -> Image.Image:
    mask = Image.new("RGBA", FULL_SIZE, (255, 255, 255, 255))
    mask.putalpha(ImageChops.invert(edit_alpha))
    return mask


def build_mask_preview(source: Image.Image, edit_alpha: Image.Image) -> Image.Image:
    preview = source.convert("RGBA")
    overlay = Image.new("RGBA", FULL_SIZE, (25, 255, 150, 0))
    overlay.putalpha(edit_alpha.point(lambda value: min(132, value)))
    preview.alpha_composite(overlay)
    return preview


def composite_generated(source: Image.Image, generated: Image.Image, edit_alpha: Image.Image) -> Image.Image:
    output = source.convert("RGBA")
    overlay = generated.convert("RGBA")
    overlay.putalpha(edit_alpha.filter(ImageFilter.GaussianBlur(8)))
    output.alpha_composite(overlay)
    return output


def write_inputs(source_dir: Path) -> tuple[Path, Path, Image.Image, Image.Image]:
    source_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(DAY_INPUT).convert("RGBA")
    if source.size != FULL_SIZE:
        raise ValueError(f"{DAY_INPUT} must be {FULL_SIZE}, got {source.size}")

    edit_alpha = build_edit_alpha()
    mask = build_mask(edit_alpha)
    source_path = source_dir / "meridian-repair-input-2560x1536.png"
    mask_path = source_dir / "meridian-repair-mask-v1.png"
    preview_path = source_dir / "meridian-repair-mask-preview-v1.png"
    prompt_path = source_dir / "meridian-repair-prompt-v1.md"
    source.save(source_path)
    mask.save(mask_path)
    build_mask_preview(source, edit_alpha).save(preview_path)
    prompt_path.write_text(PROMPT, encoding="utf-8")
    return source_path, mask_path, source, edit_alpha


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair Meridian full map integration with gpt-image-2.")
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high", "auto"])
    parser.add_argument("--skip-api", action="store_true")
    args = parser.parse_args()

    source_path, mask_path, source, edit_alpha = write_inputs(args.source_dir)
    if args.skip_api:
        print(json.dumps({
            "source": str(source_path.relative_to(ROOT)),
            "mask": str(mask_path.relative_to(ROOT)),
            "prompt": str((args.source_dir / "meridian-repair-prompt-v1.md").relative_to(ROOT)),
        }, indent=2))
        return

    load_env_file(ROOT / ".env.local")
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

    generated_path = args.source_dir / "meridian-repair-output-gpt-image-2.png"
    merged_path = args.source_dir / "meridian-repair-merged-preview-v1.png"
    report_path = args.source_dir / "meridian-repair-report-gpt-image-2.json"

    generated_path.write_bytes(base64.b64decode(image_base64))
    generated = Image.open(generated_path).convert("RGBA")
    if generated.size != FULL_SIZE:
        raise ValueError(f"Expected API output {FULL_SIZE}, got {generated.size}")

    output = composite_generated(source, generated, edit_alpha).convert("RGB")
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    output.save(DAY_OUTPUT)
    output.save(DAY_OUTPUT_COPY)
    output.save(merged_path)

    report = {
        "model": "gpt-image-2",
        "quality": args.quality,
        "size": f"{FULL_SIZE[0]}x{FULL_SIZE[1]}",
        "source": str(source_path.relative_to(ROOT)),
        "mask": str(mask_path.relative_to(ROOT)),
        "generated": str(generated_path.relative_to(ROOT)),
        "mergedPreview": str(merged_path.relative_to(ROOT)),
        "dayOutput": str(DAY_OUTPUT.relative_to(ROOT)),
        "dayOutputCopy": str(DAY_OUTPUT_COPY.relative_to(ROOT)),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
