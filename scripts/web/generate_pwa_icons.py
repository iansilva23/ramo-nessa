"""Gera as variantes PWA comuns a partir da arte oficial de cada app."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]

for role in ("passenger", "driver"):
    app = ROOT / "apps" / role
    source_path = app / "assets" / "brand" / role / "app_icon_source.png"
    with Image.open(source_path) as file:
        source = file.convert("RGB")
        directory = app / "web" / "icons"
        directory.mkdir(parents=True, exist_ok=True)
        for size in (192, 512):
            destination = directory / f"Icon-{size}.png"
            source.resize((size, size), Image.Resampling.LANCZOS).save(
                destination, format="PNG", optimize=True
            )
            print(f"{role}: ícone PWA {size}x{size} preparado")
