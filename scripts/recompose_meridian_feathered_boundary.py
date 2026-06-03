#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "private/world-v2/source/meridian-expansion/gpt-image-2"
OUT_DIR = ROOT / "private/world-v2/source/meridian-brush-repair"
FULL_SIZE = (2560, 1536)


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


def build_original_alpha() -> Image.Image:
    alpha = Image.new("L", FULL_SIZE, 0)
    draw = ImageDraw.Draw(alpha)
    draw.rectangle((0, 0, 512, FULL_SIZE[1]), fill=255)
    for polygon in editable_polygons():
        draw.polygon(polygon, fill=255)
    return alpha


def build_boundary_feather() -> Image.Image:
    alpha = Image.new("L", FULL_SIZE, 0)
    draw = ImageDraw.Draw(alpha)

    # Widen only the upper vertical join where the first composite reads as a
    # pasted strip. The lower Meridian sanctuary and water/crystal area stays
    # governed by the original approved alpha.
    draw.polygon(
        [
            (500, 0),
            (566, 0),
            (558, 92),
            (548, 178),
            (540, 286),
            (532, 402),
            (546, 526),
            (532, 668),
            (514, 736),
            (494, 638),
            (504, 510),
            (492, 390),
            (504, 260),
            (492, 124),
        ],
        fill=202,
    )
    for box in [
        (490, 40, 568, 190),
        (492, 238, 546, 438),
        (494, 492, 550, 700),
    ]:
        draw.rounded_rectangle(box, radius=28, fill=156)

    alpha = alpha.filter(ImageFilter.GaussianBlur(18))

    # Do not let the seam brush repaint recognizable Bacon props. The sign and
    # crystal/water area were already approved in v1; preserving them prevents
    # the repair from reading like a larger regenerated patch.
    preserve = Image.new("L", FULL_SIZE, 0)
    preserve_draw = ImageDraw.Draw(preserve)
    preserve_draw.rounded_rectangle((534, 198, 664, 402), radius=18, fill=255)
    preserve_draw.rounded_rectangle((522, 468, 648, 690), radius=34, fill=255)
    preserve = preserve.filter(ImageFilter.GaussianBlur(8))
    return ImageChops.subtract(alpha, preserve)


def composite(source: Image.Image, generated: Image.Image, alpha: Image.Image) -> Image.Image:
    output = source.convert("RGBA")
    overlay = generated.convert("RGBA")
    overlay.putalpha(alpha)
    output.alpha_composite(overlay)
    return output.convert("RGB")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source_path = SOURCE_DIR / "meridian-expanded-input-2560x1536.png"
    generated_path = SOURCE_DIR / "meridian-expanded-output-gpt-image-2.png"
    source = Image.open(source_path).convert("RGBA")
    generated = Image.open(generated_path).convert("RGBA")
    if source.size != FULL_SIZE or generated.size != FULL_SIZE:
        raise ValueError("Meridian source/generated images must be 2560x1536")

    original_alpha = build_original_alpha().filter(ImageFilter.GaussianBlur(8))
    boundary_alpha = build_boundary_feather()
    alpha = ImageChops.lighter(original_alpha, boundary_alpha)
    repaired = composite(source, generated, alpha)

    outputs = {
        "merged": OUT_DIR / "meridian-recomposed-feathered-boundary-v2.png",
        "seamCrop": OUT_DIR / "meridian-recomposed-feathered-boundary-seam-crop-v2.png",
        "seamBeforeAfter": OUT_DIR / "meridian-recomposed-feathered-boundary-before-after-v2.png",
        "maskPreview": OUT_DIR / "meridian-recomposed-feathered-boundary-mask-preview-v2.png",
        "difference": OUT_DIR / "meridian-recomposed-feathered-boundary-difference-v2.png",
    }
    repaired.save(outputs["merged"])

    seam_box = (400, 0, 720, 940)
    current = Image.open(ROOT / "public/world-v2/layers/meridian-fullmap-day-v1.png").convert("RGB")
    before = current.crop(seam_box)
    after = repaired.crop(seam_box)
    after.save(outputs["seamCrop"])
    separator = Image.new("RGB", (8, before.height), (18, 22, 19))
    side_by_side = Image.new("RGB", (before.width + separator.width + after.width, before.height), (18, 22, 19))
    side_by_side.paste(before, (0, 0))
    side_by_side.paste(separator, (before.width, 0))
    side_by_side.paste(after, (before.width + separator.width, 0))
    side_by_side.save(outputs["seamBeforeAfter"])

    mask_preview = current.convert("RGBA")
    overlay = Image.new("RGBA", FULL_SIZE, (28, 255, 150, 0))
    overlay.putalpha(boundary_alpha.point(lambda value: min(145, value)))
    mask_preview.alpha_composite(overlay)
    mask_preview.save(outputs["maskPreview"])

    diff = ImageChops.difference(current, repaired)
    diff.point(lambda value: min(255, value * 8)).save(outputs["difference"])

    for label, path in outputs.items():
        print(f"{label}: {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
