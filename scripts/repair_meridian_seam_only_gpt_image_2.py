#!/usr/bin/env python3
import argparse
import base64
import json
import os
from pathlib import Path

from openai import OpenAI
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "private/world-v2/source/meridian-seam-repair/gpt-image-2"
PUBLIC_LAYER_DIR = ROOT / "public/world-v2/layers"
FULL_SIZE = (2560, 1536)
V1_DAY = PUBLIC_LAYER_DIR / "meridian-fullmap-day-v1.png"


PROMPT = """Use case: precise-object-edit
Asset type: 2D isometric cozy pixel-art game world map seam repair.
Input image role: This is the first approved Meridian full map. Only the transparent/masked vertical seam region may change. Preserve every unmasked pixel exactly.

Primary request: Surgically hide the visible vertical seam left of Bacon's area where the new west forest/path extension meets the existing map.

Repair instructions:
- Blend the forest canopy, shrubs, flowers, small rocks, lamps, water edge, and dirt/cobblestone path texture across the seam so it reads as one continuous map.
- Keep the same isometric pixel-art scale, line weight, saturation, lighting, and prop density.
- Keep Bacon's sign, garden, orchard, work tables, and nearby path layout in place.
- Keep Meridian's area, pavilion, qi circle, bamboo, waterfalls, crystals, and south map untouched.
- Use natural irregular foliage/path detail to hide the seam; do not create a straight vertical band.

Hard constraints:
- Do not repaint outside the masked seam strip.
- Do not add characters, UI, text, labels, logos, watermarks, modern objects, fog, blur, or lens haze.
- Do not move, crop, darken, resize, restyle, or blur the existing map.
- Do not change the broader Meridian design. This is only a seam cleanup.
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

    # Full-map coordinates. x=512 is the visible join between the generated
    # west expansion and Bacon's original west chunk. Keep this narrow and
    # organic so the first Meridian composition stays intact.
    draw.polygon(
        [
            (462, 0),
            (594, 0),
            (590, 94),
            (558, 168),
            (604, 248),
            (578, 342),
            (618, 454),
            (590, 568),
            (604, 718),
            (558, 844),
            (470, 882),
            (444, 726),
            (476, 600),
            (434, 462),
            (468, 328),
            (438, 190),
            (468, 84),
        ],
        fill=255,
    )

    # Small extra feather over the waterfall/green-crystal transition where
    # the seam is most visible in the user's crop.
    draw.rounded_rectangle((430, 642, 594, 910), radius=36, fill=255)
    return alpha


def build_mask(edit_alpha: Image.Image) -> Image.Image:
    mask = Image.new("RGBA", FULL_SIZE, (255, 255, 255, 255))
    mask.putalpha(ImageChops.invert(edit_alpha))
    return mask


def build_mask_preview(source: Image.Image, edit_alpha: Image.Image) -> Image.Image:
    preview = source.convert("RGBA")
    overlay = Image.new("RGBA", FULL_SIZE, (35, 255, 160, 0))
    overlay.putalpha(edit_alpha.point(lambda value: min(132, value)))
    preview.alpha_composite(overlay)
    return preview


def composite_generated(source: Image.Image, generated: Image.Image, edit_alpha: Image.Image) -> Image.Image:
    output = source.convert("RGBA")
    overlay = generated.convert("RGBA")
    overlay.putalpha(edit_alpha.filter(ImageFilter.GaussianBlur(6)))
    output.alpha_composite(overlay)
    return output.convert("RGB")


def write_inputs(source_dir: Path) -> tuple[Path, Path, Image.Image, Image.Image]:
    source_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(V1_DAY).convert("RGBA")
    if source.size != FULL_SIZE:
        raise ValueError(f"{V1_DAY} must be {FULL_SIZE}, got {source.size}")

    edit_alpha = build_edit_alpha()
    mask = build_mask(edit_alpha)
    source_path = source_dir / "meridian-seam-input-v1-2560x1536.png"
    mask_path = source_dir / "meridian-seam-mask-v1.png"
    mask_preview_path = source_dir / "meridian-seam-mask-preview-v1.png"
    prompt_path = source_dir / "meridian-seam-prompt-v1.md"
    source.save(source_path)
    mask.save(mask_path)
    build_mask_preview(source, edit_alpha).save(mask_preview_path)
    prompt_path.write_text(PROMPT, encoding="utf-8")
    return source_path, mask_path, source, edit_alpha


def main() -> None:
    parser = argparse.ArgumentParser(description="Surgically repair only the Meridian/Bacon vertical seam.")
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high", "auto"])
    parser.add_argument("--skip-api", action="store_true")
    parser.add_argument("--write-public-day", action="store_true")
    args = parser.parse_args()

    source_path, mask_path, source, edit_alpha = write_inputs(args.source_dir)
    if args.skip_api:
        print(json.dumps({
            "source": str(source_path.relative_to(ROOT)),
            "mask": str(mask_path.relative_to(ROOT)),
            "prompt": str((args.source_dir / "meridian-seam-prompt-v1.md").relative_to(ROOT)),
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

    generated_path = args.source_dir / "meridian-seam-output-gpt-image-2.png"
    merged_path = args.source_dir / "meridian-seam-merged-v1.png"
    public_day_path = ROOT / "public/world-v2/layers/generated-candidates/fullmap-day-gpt2-v2.png"
    report_path = args.source_dir / "meridian-seam-report-gpt-image-2.json"

    generated_path.write_bytes(base64.b64decode(image_base64))
    generated = Image.open(generated_path).convert("RGBA")
    if generated.size != FULL_SIZE:
        raise ValueError(f"Expected API output {FULL_SIZE}, got {generated.size}")

    merged = composite_generated(source, generated, edit_alpha)
    merged.save(merged_path)
    if args.write_public_day:
        public_day_path.parent.mkdir(parents=True, exist_ok=True)
        merged.save(public_day_path)

    crops = {
        "seamCrop": args.source_dir / "meridian-seam-crop-v1.png",
        "baconGardenCrop": args.source_dir / "meridian-seam-bacon-garden-crop-v1.png",
    }
    merged.crop((430, 0, 720, 920)).save(crops["seamCrop"])
    merged.crop((490, 540, 1010, 900)).save(crops["baconGardenCrop"])

    report = {
        "model": "gpt-image-2",
        "quality": args.quality,
        "source": str(source_path.relative_to(ROOT)),
        "mask": str(mask_path.relative_to(ROOT)),
        "generated": str(generated_path.relative_to(ROOT)),
        "merged": str(merged_path.relative_to(ROOT)),
        "writePublicDay": args.write_public_day,
        "publicDay": str(public_day_path.relative_to(ROOT)) if args.write_public_day else None,
        "crops": {key: str(value.relative_to(ROOT)) for key, value in crops.items()},
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
