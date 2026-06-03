#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/world-v2/layers/meridian-fullmap-day-v1.png"
OUT_DIR = ROOT / "private/world-v2/source/meridian-brush-repair"
FULL_SIZE = (2560, 1536)


def build_brush_mask() -> Image.Image:
    alpha = Image.new("L", FULL_SIZE, 0)
    draw = ImageDraw.Draw(alpha)

    # Hand-shaped brush down the visible x=512 join. This is intentionally a
    # local repair: it avoids the wider Bacon garden and Meridian sanctuary so
    # v1's composition stays intact.
    draw.polygon(
        [
            (454, 0),
            (594, 0),
            (584, 118),
            (552, 208),
            (592, 310),
            (560, 438),
            (604, 554),
            (566, 690),
            (592, 808),
            (548, 946),
            (446, 946),
            (468, 800),
            (438, 662),
            (466, 520),
            (440, 402),
            (468, 288),
            (438, 154),
        ],
        fill=225,
    )

    # A few lighter, irregular brushes over the specific leaf/path junctions
    # that read as a hard vertical edge in mobile crops.
    for box in [
        (432, 42, 604, 226),
        (426, 250, 602, 452),
        (420, 474, 612, 678),
        (424, 690, 604, 902),
    ]:
        draw.rounded_rectangle(box, radius=38, fill=148)

    alpha = alpha.filter(ImageFilter.GaussianBlur(18))
    return alpha


def build_micro_mask() -> Image.Image:
    alpha = Image.new("L", FULL_SIZE, 0)
    draw = ImageDraw.Draw(alpha)
    draw.polygon(
        [
            (492, 0),
            (552, 0),
            (542, 186),
            (560, 338),
            (542, 520),
            (558, 698),
            (532, 928),
            (486, 928),
            (500, 704),
            (484, 524),
            (500, 344),
            (486, 168),
        ],
        fill=160,
    )
    return alpha.filter(ImageFilter.GaussianBlur(8))


def horizontal_blend_source(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = image.crop(box).convert("RGB")
    width, height = crop.size
    src = crop.load()
    out = Image.new("RGB", crop.size)
    dst = out.load()

    # Weighted horizontal blur. It softens left/right tone transitions without
    # smearing the map vertically.
    offsets = [-18, -12, -7, -3, 0, 3, 7, 12, 18]
    weights = [1, 2, 3, 4, 8, 4, 3, 2, 1]
    total_weight = sum(weights)
    for y in range(height):
        for x in range(width):
            r = g = b = 0
            for offset, weight in zip(offsets, weights):
                sample_x = min(width - 1, max(0, x + offset))
                sr, sg, sb = src[sample_x, y]
                r += sr * weight
                g += sg * weight
                b += sb * weight
            dst[x, y] = (round(r / total_weight), round(g / total_weight), round(b / total_weight))
    return out


def horizontal_tone_match(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = image.crop(box).convert("RGB")
    low_original = crop.filter(ImageFilter.GaussianBlur(18))
    low_blended = horizontal_blend_source(low_original, (0, 0, crop.width, crop.height)).filter(
        ImageFilter.GaussianBlur(8)
    )

    src = crop.load()
    low_src = low_original.load()
    low_dst = low_blended.load()
    out = Image.new("RGB", crop.size)
    dst = out.load()

    # Preserve original pixel detail while matching the broader left/right
    # color and brightness through the seam. This reads more like a soft brush
    # than a blur pass.
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b = src[x, y]
            lr, lg, lb = low_src[x, y]
            br, bg, bb = low_dst[x, y]
            dst[x, y] = (
                min(255, max(0, r + round((br - lr) * 0.95))),
                min(255, max(0, g + round((bg - lg) * 0.95))),
                min(255, max(0, b + round((bb - lb) * 0.95))),
            )
    return out


def apply_brush_blend(image: Image.Image, alpha: Image.Image, micro_alpha: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    box = (400, 0, 650, 980)
    original_crop = image.crop(box).convert("RGB")
    tone_matched_crop = horizontal_tone_match(image, box)
    smoothed_crop = horizontal_blend_source(image, box)
    mask_crop = alpha.crop(box)
    micro_mask_crop = micro_alpha.crop(box)

    tone_mask = mask_crop.point(lambda value: round(value * 0.74))
    patched_crop = Image.composite(tone_matched_crop, original_crop, tone_mask)

    # A small second pass on the exact hard edge. The mask is narrow enough
    # that it removes the vertical cut without changing the surrounding scene.
    seam_mask = micro_mask_crop.point(lambda value: round(value * 0.34))
    patched_crop = Image.composite(smoothed_crop, patched_crop, seam_mask)

    output = image.copy()
    output.paste(patched_crop, box)
    return output


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    if source.size != FULL_SIZE:
        raise ValueError(f"{SOURCE} must be {FULL_SIZE}, got {source.size}")

    mask = build_brush_mask()
    micro_mask = build_micro_mask()
    repaired = apply_brush_blend(source, mask, micro_mask)

    mask_preview = source.convert("RGBA")
    overlay = Image.new("RGBA", FULL_SIZE, (28, 255, 150, 0))
    combined_mask = ImageChops.lighter(mask, micro_mask)
    overlay.putalpha(combined_mask.point(lambda value: min(135, value)))
    mask_preview.alpha_composite(overlay)

    outputs = {
        "maskPreview": OUT_DIR / "meridian-brush-mask-preview-v3.png",
        "merged": OUT_DIR / "meridian-brush-merged-v3.png",
        "seamCrop": OUT_DIR / "meridian-brush-seam-crop-v3.png",
        "seamBeforeAfter": OUT_DIR / "meridian-brush-seam-before-after-v3.png",
        "baconGardenCrop": OUT_DIR / "meridian-brush-bacon-garden-crop-v3.png",
        "southCrop": OUT_DIR / "meridian-brush-south-crop-v3.png",
        "difference": OUT_DIR / "meridian-brush-difference-v3.png",
    }
    mask_preview.save(outputs["maskPreview"])
    repaired.save(outputs["merged"])
    seam_box = (400, 0, 720, 940)
    repaired.crop(seam_box).save(outputs["seamCrop"])
    before = source.crop(seam_box).convert("RGB")
    after = repaired.crop(seam_box).convert("RGB")
    separator = Image.new("RGB", (8, before.height), (18, 22, 19))
    before_after = Image.new("RGB", (before.width + separator.width + after.width, before.height), (18, 22, 19))
    before_after.paste(before, (0, 0))
    before_after.paste(separator, (before.width, 0))
    before_after.paste(after, (before.width + separator.width, 0))
    before_after.save(outputs["seamBeforeAfter"])
    repaired.crop((490, 540, 1010, 900)).save(outputs["baconGardenCrop"])
    repaired.crop((0, 760, 980, 1536)).save(outputs["southCrop"])

    diff = ImageChops.difference(source, repaired)
    # Boost the difference preview so it is obvious what changed.
    boosted = diff.point(lambda value: min(255, value * 8))
    boosted.save(outputs["difference"])
    for label, path in outputs.items():
        print(f"{label}: {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
