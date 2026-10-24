"""Generate the HUB's simple two-colour desktop mark with Pillow."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
SIZE = 1024
image = Image.new("RGBA", (SIZE, SIZE), "#121410")
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((54, 54, 970, 970), radius=214, fill="#1B1914", outline="#8A9B7E", width=18)

font_paths = [
    Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]
font_path = next((path for path in font_paths if path.exists()), None)
font = ImageFont.truetype(str(font_path), 460) if font_path else ImageFont.load_default()
text = "Li"
bounds = draw.textbbox((0, 0), text, font=font)
width = bounds[2] - bounds[0]
height = bounds[3] - bounds[1]
x = (SIZE - width) / 2 - bounds[0]
y = (SIZE - height) / 2 - bounds[1] - 12
draw.text((x, y), text, font=font, fill="#F8F1E5", stroke_width=0)
draw.ellipse((760, 760, 860, 860), fill="#DE5A4F")

image.save(ROOT / "icon.png")
image.save(ROOT / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
image.save(ROOT / "icon.icns")
