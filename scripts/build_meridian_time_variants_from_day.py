#!/usr/bin/env python3
from pathlib import Path
import math

from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
GENERATED_DIR = ROOT / "public/world-v2/layers/generated-candidates"
DAY = GENERATED_DIR / "fullmap-day-gpt2-v2.png"
OLD_TARGETS = {
    "sunset": GENERATED_DIR / "fullmap-sunset-gpt2-v1.png",
    "night": GENERATED_DIR / "fullmap-night-gpt2-v1.png",
}
OUTPUTS = {
    "sunset": GENERATED_DIR / "fullmap-sunset-gpt2-v2.png",
    "night": GENERATED_DIR / "fullmap-night-gpt2-v2.png",
}
FULL_SIZE = (2560, 1536)


def cdf(hist: list[int]) -> list[float]:
    total = float(sum(hist)) or 1.0
    acc = 0.0
    out: list[float] = []
    for value in hist:
        acc += value
        out.append(acc / total)
    return out


def histogram_match(source: Image.Image, target: Image.Image) -> Image.Image:
    source = source.convert("RGB")
    target = target.convert("RGB")
    sample = source.crop((512, 0, source.width, source.height))
    matched_channels = []

    for source_channel, target_channel, full_channel in zip(sample.split(), target.split(), source.split()):
        source_cdf = cdf(source_channel.histogram())
        target_cdf = cdf(target_channel.histogram())
        lut: list[int] = []
        target_index = 0
        for probability in source_cdf:
            while target_index < 255 and target_cdf[target_index] < probability:
                target_index += 1
            lut.append(target_index)
        matched_channels.append(full_channel.point(lut))

    return Image.merge("RGB", matched_channels)


def radial_alpha(size: tuple[int, int], x: float, y: float, radius: float, strength: float) -> Image.Image:
    small = (640, 384)
    sx = x / size[0] * small[0]
    sy = y / size[1] * small[1]
    sr = radius / size[0] * small[0]
    alpha = Image.new("L", small, 0)
    pixels = alpha.load()
    for py in range(small[1]):
        for px in range(small[0]):
            distance = math.hypot(px - sx, py - sy)
            glow = max(0.0, 1.0 - distance / max(1.0, sr)) ** 2.0
            pixels[px, py] = max(pixels[px, py], int(glow * strength))
    return alpha.resize(size, Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(5))


def add_glow(image: Image.Image, x: float, y: float, radius: float, color: tuple[int, int, int], strength: float) -> Image.Image:
    overlay = Image.new("RGBA", image.size, (*color, 0))
    overlay.putalpha(radial_alpha(image.size, x, y, radius, strength))
    return Image.alpha_composite(image.convert("RGBA"), overlay)


def add_sunset_polish(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Color(image).enhance(1.08)
    image = ImageEnhance.Contrast(image).enhance(1.03)
    image = add_glow(image, 0, 0, 760, (255, 178, 38), 82)
    image = add_glow(image, 220, 960, 170, (255, 160, 44), 34)
    image = add_glow(image, 288, 1240, 160, (255, 180, 70), 28)
    return image.convert("RGB")


def add_night_polish(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Color(image).enhance(1.14)
    image = ImageEnhance.Contrast(image).enhance(1.08)
    image = ImageEnhance.Brightness(image).enhance(1.05)
    glows = [
        (210, 1004, 118, (255, 166, 54), 70),
        (258, 1118, 92, (255, 176, 64), 58),
        (300, 1252, 96, (80, 255, 170), 58),
        (616, 902, 82, (82, 255, 178), 54),
        (710, 1218, 88, (84, 255, 178), 58),
        (592, 1364, 88, (72, 255, 178), 54),
        (96, 1260, 98, (24, 146, 255), 38),
        (214, 1460, 112, (26, 146, 255), 34),
        (416, 1110, 76, (255, 172, 62), 42),
    ]
    output = image.convert("RGBA")
    for x, y, radius, color, strength in glows:
        output = add_glow(output, x, y, radius, color, strength)
    return output.convert("RGB")


def main() -> None:
    day = Image.open(DAY).convert("RGB")
    if day.size != FULL_SIZE:
        raise ValueError(f"{DAY} must be {FULL_SIZE}, got {day.size}")

    for variant, target_path in OLD_TARGETS.items():
        target = Image.open(target_path).convert("RGB")
        if target.size != (2048, 1536):
            raise ValueError(f"{target_path} must be 2048x1536, got {target.size}")
        output = histogram_match(day, target)
        if variant == "sunset":
            output = add_sunset_polish(output)
        else:
            output = add_night_polish(output)
        output.save(OUTPUTS[variant])
        print(OUTPUTS[variant])


if __name__ == "__main__":
    main()
