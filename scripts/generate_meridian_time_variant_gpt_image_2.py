#!/usr/bin/env python3
import argparse
import base64
import json
import os
from pathlib import Path

from openai import OpenAI
from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "private/world-v2/source/meridian-expansion/gpt-image-2"
PUBLIC_LAYER_DIR = ROOT / "public/world-v2/layers"
GENERATED_DIR = PUBLIC_LAYER_DIR / "generated-candidates"
FULL_SIZE = (2560, 1536)
OLD_WORLD_OFFSET_X = 512
LEFT_EXTENSION_WIDTH = 512
DAY_FULL = PUBLIC_LAYER_DIR / "meridian-fullmap-day-v1.png"
OLD_VARIANTS = {
    "sunset": GENERATED_DIR / "fullmap-sunset-gpt2-v1.png",
    "night": GENERATED_DIR / "fullmap-night-gpt2-v1.png",
}
OUTPUTS = {
    "sunset": GENERATED_DIR / "fullmap-sunset-gpt2-v2.png",
    "night": GENERATED_DIR / "fullmap-night-gpt2-v2.png",
}


PROMPTS = {
    "sunset": """Use case: lighting-weather
Asset type: 2D isometric cozy pixel-art game world map time-of-day variant.
Input image role: The unmasked right-side world is the approved sunset map and must remain unchanged. The masked Meridian southwest expansion areas are the only editable regions.
Primary request: Relight and color-grade only the masked Meridian area so it matches the approved sunset world around it.
Lighting direction: warm golden sunset, amber lantern glow, long soft evening warmth, readable cozy pixel-map detail, same contrast and saturation as the unmasked sunset map.
Preserve: exact Meridian buildings, paths, water, bamboo, rocks, qi circle, layout, perspective, scale, and all unmasked pixels.
Avoid: blurry lens haze, dirty overlay, fog, loss of detail, hard seams, geometry changes, characters, UI, text, logos, or changing unmasked regions.
""",
    "night": """Use case: lighting-weather
Asset type: 2D isometric cozy pixel-art game world map time-of-day variant.
Input image role: The unmasked right-side world is the approved night map and must remain unchanged. The masked Meridian southwest expansion areas are the only editable regions.
Primary request: Relight and color-grade only the masked Meridian area so it matches the approved night world around it.
Lighting direction: moonlit deep blue night with clear readable detail, warm lanterns, jade qi crystals, pavilion windows, and water highlights that actually light nearby stones, paths, bamboo, and courtyard edges. Keep the area visible and game-readable.
Preserve: exact Meridian buildings, paths, water, bamboo, rocks, qi circle, layout, perspective, scale, and all unmasked pixels.
Avoid: making the area too dark to inspect, blurry lens haze, dirty overlay, fog, loss of detail, hard seams, geometry changes, characters, UI, text, logos, or changing unmasked regions.
""",
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def editable_polygons() -> list[list[tuple[int, int]]]:
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


def build_edit_alpha() -> Image.Image:
    alpha = Image.new("L", FULL_SIZE, 0)
    draw = ImageDraw.Draw(alpha)
    draw.rectangle((0, 0, LEFT_EXTENSION_WIDTH, FULL_SIZE[1]), fill=255)
    for polygon in editable_polygons():
        draw.polygon(polygon, fill=255)
    return alpha


def build_mask(edit_alpha: Image.Image) -> Image.Image:
    mask = Image.new("RGBA", FULL_SIZE, (255, 255, 255, 255))
    mask.putalpha(ImageChops.invert(edit_alpha))
    return mask


def build_variant_source(variant: str) -> Image.Image:
    old_variant = Image.open(OLD_VARIANTS[variant]).convert("RGBA")
    if old_variant.size != (2048, 1536):
        raise ValueError(f"{OLD_VARIANTS[variant]} must be 2048x1536, got {old_variant.size}")
    day = Image.open(DAY_FULL).convert("RGBA")
    if day.size != FULL_SIZE:
        raise ValueError(f"{DAY_FULL} must be {FULL_SIZE}, got {day.size}")

    source = day.copy()
    source.paste(old_variant, (OLD_WORLD_OFFSET_X, 0))
    return source


def composite_generated(source: Image.Image, generated: Image.Image, edit_alpha: Image.Image) -> Image.Image:
    output = source.convert("RGBA")
    overlay = generated.convert("RGBA")
    overlay.putalpha(edit_alpha.filter(ImageFilter.GaussianBlur(8)) if False else edit_alpha)
    output.alpha_composite(overlay)
    return output


def write_inputs(variant: str) -> tuple[Path, Path, Image.Image, Image.Image]:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    source = build_variant_source(variant)
    edit_alpha = build_edit_alpha()
    mask = build_mask(edit_alpha)
    source_path = SOURCE_DIR / f"meridian-{variant}-input-2560x1536.png"
    mask_path = SOURCE_DIR / f"meridian-{variant}-mask-v1.png"
    prompt_path = SOURCE_DIR / f"meridian-{variant}-prompt-v1.md"
    source.save(source_path)
    mask.save(mask_path)
    prompt_path.write_text(PROMPTS[variant], encoding="utf-8")
    return source_path, mask_path, source, edit_alpha


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Meridian sunset/night full-map variants with gpt-image-2.")
    parser.add_argument("variant", choices=["sunset", "night"])
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high", "auto"])
    parser.add_argument("--skip-api", action="store_true")
    args = parser.parse_args()

    source_path, mask_path, source, edit_alpha = write_inputs(args.variant)
    if args.skip_api:
        print(json.dumps({
            "source": str(source_path.relative_to(ROOT)),
            "mask": str(mask_path.relative_to(ROOT)),
            "prompt": str((SOURCE_DIR / f"meridian-{args.variant}-prompt-v1.md").relative_to(ROOT)),
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
            prompt=PROMPTS[args.variant],
            size=f"{FULL_SIZE[0]}x{FULL_SIZE[1]}",
            quality=args.quality,
            output_format="png",
            background="opaque",
        )

    image_base64 = result.data[0].b64_json
    if not image_base64:
        raise RuntimeError("The API returned no image data")

    generated_path = SOURCE_DIR / f"meridian-{args.variant}-output-gpt-image-2.png"
    generated_path.write_bytes(base64.b64decode(image_base64))
    generated = Image.open(generated_path).convert("RGBA")
    if generated.size != FULL_SIZE:
        raise ValueError(f"Expected API output {FULL_SIZE}, got {generated.size}")

    output = composite_generated(source, generated, edit_alpha)
    OUTPUTS[args.variant].parent.mkdir(parents=True, exist_ok=True)
    output.convert("RGB").save(OUTPUTS[args.variant])
    report = {
        "model": "gpt-image-2",
        "variant": args.variant,
        "source": str(source_path.relative_to(ROOT)),
        "generated": str(generated_path.relative_to(ROOT)),
        "output": str(OUTPUTS[args.variant].relative_to(ROOT)),
    }
    (SOURCE_DIR / f"meridian-{args.variant}-report-gpt-image-2.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
