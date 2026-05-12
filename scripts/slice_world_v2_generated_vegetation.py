from pathlib import Path
from PIL import Image
from collections import deque


ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "private/world-v2/source/generated-vegetation-sheet.png"
OUT_DIR = ROOT / "public/world-v2/foreground"
KEY = (255, 0, 255)


SPRITES = {
    "plaza-tree": (109, 30, 508, 442),
    "cherry-tree-large": (583, 44, 1071, 436),
    "cherry-tree-small": (1140, 120, 1390, 416),
    "pine-cluster": (66, 440, 554, 739),
    "green-shrub-mound": (609, 496, 994, 739),
    "flower-bed-wide": (1048, 514, 1466, 735),
    "reed-pond": (386, 766, 592, 980),
    "garden-bed-round": (821, 798, 1130, 986),
}


def keyed_alpha(crop: Image.Image) -> Image.Image:
    rgba = crop.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    flood_chroma_edges(rgba)
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            dist = abs(r - KEY[0]) + abs(g - KEY[1]) + abs(b - KEY[2])
            strong_key = r > 210 and b > 210 and g < 115
            soft_key = r > 175 and b > 175 and g < 145 and dist < 190
            if dist < 90 or strong_key:
                pixels[x, y] = (r, g, b, 0)
            elif soft_key:
                alpha = min(255, max(0, (dist - 90) * 3))
                pixels[x, y] = (min(r, 190), g, min(b, 190), alpha)
    bbox = rgba.getbbox()
    return rgba.crop(bbox) if bbox else rgba


def flood_chroma_edges(rgba: Image.Image) -> None:
    pixels = rgba.load()
    width, height = rgba.size
    seen: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or x < 0 or y < 0 or x >= width or y >= height:
            continue
        seen.add((x, y))
        r, g, b, a = pixels[x, y]
        if not is_chroma_like(r, g, b):
            continue
        pixels[x, y] = (r, g, b, 0)
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))


def is_chroma_like(r: int, g: int, b: int) -> bool:
    return r > 135 and b > 120 and g < 145 and abs(r - b) < 125 and (r + b - g * 2) > 110


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SHEET)
    for name, bbox in SPRITES.items():
        keyed_alpha(sheet.crop(bbox)).save(OUT_DIR / f"{name}.png")


if __name__ == "__main__":
    main()
