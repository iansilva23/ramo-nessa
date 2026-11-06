"""Gera ícones PWA com dimensões verdadeiras usando a marca aprovada."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/passenger/assets/brand/passenger/app_icon_source.png"
if not SOURCE.is_file():
    raise SystemExit("Ícone fonte do Passageiro não encontrado.")

with Image.open(SOURCE) as file:
    source = file.convert("RGBA")
    for role in ("passenger", "driver"):
        directory = ROOT / "apps" / role / "web/icons"
        directory.mkdir(parents=True, exist_ok=True)
        for size in (192, 512):
            destination = directory / f"Icon-{size}.png"
            source.resize((size, size), Image.Resampling.LANCZOS).save(
                destination, format="PNG", optimize=True
            )
            with Image.open(destination) as out:
                assert out.size == (size, size)
            print(f"{role}: ícone PWA {size}x{size} preparado")
