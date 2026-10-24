"""Package the approved LiANN lettering as Windows and Mac app icons."""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
source = Image.open(ROOT / "canonical-logo.png").convert("RGBA")

# Crop the red LiANN lettering from the approved transparent brand lockup.
# Its pixels are preserved exactly; only scale and placement change.
red = Image.new("L", source.size)
red.putdata([
    alpha if red_channel > green * 1.25 and red_channel > blue * 1.25 else 0
    for red_channel, green, blue, alpha in source.get_flattened_data()
])
box = red.getbbox()
if box is None:
    raise RuntimeError("Canonical logo has no LiANN lettering")
lettering = source.crop(box)
width = 880
height = round(lettering.height * width / lettering.width)
lettering = lettering.resize((width, height), Image.Resampling.LANCZOS)

icon = Image.new("RGBA", (1024, 1024), "#121410")
icon.alpha_composite(lettering, ((1024 - width) // 2, (1024 - height) // 2))
icon.save(ROOT / "icon.png")
icon.save(ROOT / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon.save(ROOT / "icon.icns")
