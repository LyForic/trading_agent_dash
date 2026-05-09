from pathlib import Path
from PIL import Image
from collections import deque


ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "public/world-v2/source/generated-props-sheet.png"
OUT_DIR = ROOT / "public/world-v2/foreground"
KEY = (255, 0, 255)


SPRITES = {
    "apex-dojo": (35, 18, 285, 280),
    "apex-training-platform": (355, 60, 690, 292),
    "apex-zen-garden": (718, 50, 946, 292),
    "apex-koi-pond": (1000, 75, 1225, 280),
    "metheus-observatory": (1262, 14, 1530, 286),
    "metheus-bookshelf-tall": (48, 335, 250, 522),
    "metheus-bookshelf-low": (280, 355, 440, 526),
    "metheus-study-table": (470, 350, 704, 514),
    "metheus-reading-desk": (777, 355, 938, 514),
    "metheus-blackboard": (1008, 326, 1204, 522),
    "metheus-globe-table": (1236, 340, 1428, 520),
    "metheus-market-stall": (34, 560, 252, 748),
    "gale-cabin": (286, 526, 536, 770),
    "gale-weather-globe": (588, 526, 786, 762),
    "gale-storm-rods": (812, 520, 1018, 760),
    "gale-blue-crystal": (1040, 548, 1148, 760),
    "gale-clock-machine": (1160, 548, 1286, 760),
    "gale-crystal-tower": (1296, 548, 1412, 760),
    "gale-small-orb": (1418, 548, 1516, 760),
    "notice-board": (42, 782, 190, 914),
    "signpost": (202, 778, 326, 914),
    "lamp-post": (342, 775, 414, 910),
    "hanging-lamp": (424, 768, 494, 910),
    "bench": (500, 805, 626, 904),
    "low-fence": (628, 805, 746, 904),
    "round-bush": (760, 780, 850, 900),
    "pine-tree": (854, 770, 946, 900),
    "pink-bush": (950, 780, 1048, 900),
    "white-flower-bush": (1050, 780, 1146, 900),
    "yellow-bush": (1148, 780, 1238, 900),
    "purple-bush": (1240, 790, 1330, 900),
    "flower-planter": (1365, 780, 1516, 912),
    "yellow-flowers": (35, 922, 126, 1020),
    "purple-flowers": (140, 922, 230, 1020),
    "pink-flowers": (246, 922, 338, 1020),
    "sunflowers": (352, 910, 442, 1020),
    "tall-purple-flowers": (474, 914, 558, 1020),
    "grass-clump": (582, 926, 660, 1005),
    "rock-small": (706, 910, 812, 1020),
    "rock-tall": (830, 908, 930, 1020),
    "rock-moss": (948, 908, 1048, 1020),
    "crate": (1110, 926, 1212, 1018),
    "barrel": (1234, 920, 1315, 1018),
    "cart": (1338, 915, 1518, 1018),
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
