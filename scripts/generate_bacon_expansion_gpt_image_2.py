#!/usr/bin/env python3
import argparse
import base64
import json
import os
from pathlib import Path
from typing import Union

from openai import OpenAI
from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "public/world-v2/layers/reference.png"
SOURCE_DIR = ROOT / "private/world-v2/source/bacon-expansion/gpt-image-2"
DEFAULT_CHUNK_OUT = ROOT / "public/world-v2/layers/bacon-west-expansion-v7.png"
EXPANDED_SIZE = (2048, 1024)
BACON_WIDTH = 512


PROMPT = """Create a 2048x1024 expanded world map for a 2D top-down/isometric cozy pixel-art game.

The right 1536x1024 region is the existing Living World map reference and must remain pixel-identical. Only the transparent/blank left 512x1024 region may be generated.

Generate the left region as Bacon's chef pig area:
- warm central clay oven/bakery building as the main landmark
- cozy cooking and food theme: vegetable beds, produce piles, baskets, barrels, sacks, herb planters, food prep counters, small cooking tools, lamps, flowers, rocks, fences
- warm tan dirt/cobblestone paths that connect naturally into the existing map edge
- upper seam should continue the Apex-side cherry blossom, bamboo, rocks, and waterfall context
- lower seam should continue the Gale-side water, stone, greenery, and path context
- match the existing map's bright warm cozy RPG/Stardew-like palette, prop density, scale, lighting, and high-detail pixel-art style

Hard constraints:
- preserve the right-side existing map exactly; do not repaint, move, resize, blur, crop, darken, or restyle it
- do not leave transparent, green, or blank pixels
- no hard vertical seam or dark transition stripe
- do not copy Apex's dojo/training mat/dummies/red banners/training platform into Bacon's area
- do not copy Gale's globe, machines, observatory, or storm devices into Bacon's area
- no large cherry blossom canopy in the lower half near Gale
- no characters, UI, text, labels, or watermark
"""


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def build_inputs(reference_path: Path, source_dir: Path) -> tuple[Path, Path]:
    reference = Image.open(reference_path).convert("RGBA")
    if reference.size != (1536, 1024):
        raise ValueError(f"Expected reference.png to be 1536x1024, got {reference.size}")

    source_dir.mkdir(parents=True, exist_ok=True)
    expanded = Image.new("RGBA", EXPANDED_SIZE, (0, 0, 0, 0))
    expanded.paste(reference, (BACON_WIDTH, 0))

    # Fully transparent mask pixels are editable; opaque pixels must be preserved.
    mask = Image.new("RGBA", EXPANDED_SIZE, (255, 255, 255, 255))
    editable = Image.new("RGBA", (BACON_WIDTH, EXPANDED_SIZE[1]), (255, 255, 255, 0))
    mask.paste(editable, (0, 0))

    expanded_path = source_dir / "bacon-expanded-input-2048x1024.png"
    mask_path = source_dir / "bacon-expanded-mask-left-512.png"
    expanded.save(expanded_path)
    mask.save(mask_path)
    return expanded_path, mask_path


def image_difference_stats(left: Image.Image, right: Image.Image) -> dict[str, Union[float, int]]:
    diff = ImageChops.difference(left.convert("RGB"), right.convert("RGB"))
    stat = ImageStat.Stat(diff)
    mean = sum(stat.mean) / len(stat.mean)
    max_diff = max(channel[1] for channel in diff.getextrema())
    changed_gt_0 = sum(1 for pixel in diff.convert("L").getdata() if pixel > 0)
    changed_gt_6 = sum(1 for pixel in diff.convert("L").getdata() if pixel > 6)
    total = left.width * left.height
    return {
        "mean_diff": round(mean, 4),
        "max_diff": int(max_diff),
        "changed_pct_gt_0": round(changed_gt_0 / total * 100, 4),
        "changed_pct_gt_6": round(changed_gt_6 / total * 100, 4),
    }


def save_candidate_outputs(
    generated_bytes: bytes,
    reference_path: Path,
    source_dir: Path,
    chunk_out: Path,
) -> dict[str, object]:
    expanded_out = source_dir / "bacon-expanded-output-gpt-image-2.png"
    preview_out = source_dir / "bacon-expanded-preview-gpt-image-2-with-original.png"
    report_out = source_dir / "bacon-expanded-report-gpt-image-2.json"
    expanded_out.write_bytes(generated_bytes)

    generated = Image.open(expanded_out).convert("RGB")
    reference = Image.open(reference_path).convert("RGB")
    if generated.size != EXPANDED_SIZE:
        raise ValueError(f"Expected API output {EXPANDED_SIZE}, got {generated.size}")

    generated_reference_side = generated.crop((BACON_WIDTH, 0, EXPANDED_SIZE[0], EXPANDED_SIZE[1]))
    diff_stats = image_difference_stats(generated_reference_side, reference)

    chunk = generated.crop((0, 0, BACON_WIDTH, EXPANDED_SIZE[1]))
    chunk_out.parent.mkdir(parents=True, exist_ok=True)
    chunk.save(chunk_out)

    preview = Image.new("RGB", EXPANDED_SIZE, (0, 0, 0))
    preview.paste(chunk, (0, 0))
    preview.paste(reference, (BACON_WIDTH, 0))
    preview.save(preview_out)

    report = {
        "model": "gpt-image-2",
        "quality": "high",
        "size": f"{EXPANDED_SIZE[0]}x{EXPANDED_SIZE[1]}",
        "chunk_out": str(chunk_out.relative_to(ROOT)),
        "expanded_out": str(expanded_out.relative_to(ROOT)),
        "preview_out": str(preview_out.relative_to(ROOT)),
        "right_side_pixel_identical": diff_stats["max_diff"] == 0,
        "right_side_diff": diff_stats,
    }
    report_out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Bacon's west expansion with gpt-image-2 masked edit.")
    parser.add_argument("--reference", type=Path, default=REFERENCE_PATH)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--chunk-out", type=Path, default=DEFAULT_CHUNK_OUT)
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high", "auto"])
    args = parser.parse_args()

    load_env_file(ROOT / ".env.local")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY was not found in the environment or .env.local")

    expanded_path, mask_path = build_inputs(args.reference, args.source_dir)
    client = OpenAI(api_key=api_key)

    with expanded_path.open("rb") as image_file, mask_path.open("rb") as mask_file:
        result = client.images.edit(
            model="gpt-image-2",
            image=image_file,
            mask=mask_file,
            prompt=PROMPT,
            size=f"{EXPANDED_SIZE[0]}x{EXPANDED_SIZE[1]}",
            quality=args.quality,
            output_format="png",
            background="opaque",
        )

    image_base64 = result.data[0].b64_json
    if not image_base64:
        raise RuntimeError("The API returned no image data")

    report = save_candidate_outputs(
        base64.b64decode(image_base64),
        args.reference,
        args.source_dir,
        args.chunk_out,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
