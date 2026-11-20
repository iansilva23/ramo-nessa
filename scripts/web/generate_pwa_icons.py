"""Export the existing Ramo Nessa mark for standard and masked PWA launchers."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/passenger/assets/brand/passenger/app_icon_source.png"
RESAMPLE = Image.Resampling.LANCZOS


def framed(source, size, scale):
    extent = round(size * scale)
    art = source.resize((extent, extent), RESAMPLE)
    canvas = Image.new("RGB", (size, size), source.getpixel((0, 0)))
    offset = (size - extent) // 2
    canvas.paste(art, (offset, offset))
    return canvas


if __name__ == "__main__":
    with Image.open(SOURCE) as file:
        source = file.convert("RGB")
    for role in ("passenger", "driver"):
        directory = ROOT / "apps" / role / "web/icons"
        directory.mkdir(parents=True, exist_ok=True)
        for size in (192, 512):
            framed(source, size, 1.04).save(directory / f"Icon-{size}.png", optimize=True)
            framed(source, size, 0.85).save(directory / f"Icon-maskable-{size}.png", optimize=True)
        framed(source, 180, 0.90).save(directory / "apple-touch-icon.png", optimize=True)
        print(f"{role}: ícones PWA comuns, adaptáveis e Apple preparados")
