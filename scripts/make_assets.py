#!/usr/bin/env python3
"""Generate the raster brand assets (apple-touch-icon, og-image) with Pillow.

Outputs into frontend/public/. The favicon is hand-written SVG; these are the
formats that need raster (Apple touch icon, Open Graph card 1200x630).

Usage: backend/.venv/bin/python scripts/make_assets.py   (pip install pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PUBLIC = Path(__file__).resolve().parent.parent / "frontend" / "public"

ACCENT = (47, 107, 255)
ACCENT_LIGHT = (74, 134, 255)
INK = (38, 44, 66)
MUTED = (104, 114, 140)
BG_TOP = (244, 247, 252)
BG_BOTTOM = (250, 251, 254)


def font(size: int, bold: bool = False):
    candidates = (
        ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf"]
        if bold else
        ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf"]
    )
    candidates += ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                   "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def gradient(size, top, bottom):
    img = Image.new("RGB", size)
    w, h = size
    for y in range(h):
        t = y / max(1, h - 1)
        img.paste(tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)), (0, y, w, y + 1))
    return img


def draw_mark(draw: ImageDraw.ImageDraw, x, y, size):
    """The brand mark: rounded blue square with a white check."""
    r = size * 0.22
    draw.rounded_rectangle([x, y, x + size, y + size], radius=r, fill=ACCENT)
    s = size
    pts = [(x + 0.27 * s, y + 0.53 * s), (x + 0.44 * s, y + 0.70 * s), (x + 0.74 * s, y + 0.30 * s)]
    draw.line(pts, fill=(255, 255, 255), width=max(3, round(s * 0.11)), joint="curve")
    half = max(2, round(s * 0.055))
    for p in pts:
        draw.ellipse([p[0] - half, p[1] - half, p[0] + half, p[1] + half], fill=(255, 255, 255))


def apple_touch_icon():
    s = 180
    img = Image.new("RGB", (s, s), ACCENT)
    draw = ImageDraw.Draw(img)
    # subtle diagonal lighting like the SVG gradient
    overlay = gradient((s, s), ACCENT, ACCENT_LIGHT)
    img = Image.blend(img, overlay, 0.6)
    draw = ImageDraw.Draw(img)
    pts = [(48, 95), (79, 126), (133, 52)]
    draw.line(pts, fill=(255, 255, 255), width=19, joint="curve")
    for p in pts:
        draw.ellipse([p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9], fill=(255, 255, 255))
    img.save(PUBLIC / "apple-touch-icon.png")


def og_image():
    w, h = 1200, 630
    img = gradient((w, h), BG_TOP, BG_BOTTOM)
    draw = ImageDraw.Draw(img)

    draw_mark(draw, 92, 150, 110)

    title_f = font(86, bold=True)
    draw.text((230, 158), "LLM", font=title_f, fill=ACCENT)
    llm_w = draw.textlength("LLM ", font=title_f)
    draw.text((230 + llm_w, 158), "Fit Check", font=title_f, fill=INK)

    draw.text((96, 320), "Will the model run on your box?", font=font(44), fill=INK)
    draw.text((96, 392), "VRAM & RAM calculator for local LLMs — live Hugging Face data,",
              font=font(30), fill=MUTED)
    draw.text((96, 436), "GGUF quant sizes, KV-cache math, Apple unified memory.",
              font=font(30), fill=MUTED)

    # a headroom bar, like the app's
    bx, by, bw, bh = 96, 520, 1008, 26
    draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=8, fill=(229, 234, 244))
    draw.rounded_rectangle([bx, by, bx + bw * 0.52, by + bh], radius=8, fill=ACCENT)
    draw.rounded_rectangle([bx + bw * 0.52, by, bx + bw * 0.70, by + bh], radius=0, fill=(122, 168, 255))
    capx = bx + bw * 0.86
    draw.rectangle([capx - 2, by - 8, capx + 2, by + bh + 8], fill=(150, 160, 180))
    draw.text((bx + bw * 0.88, by - 2), "24 GB", font=font(24, bold=True), fill=MUTED)

    img.save(PUBLIC / "og-image.png")


if __name__ == "__main__":
    apple_touch_icon()
    og_image()
    print("wrote", PUBLIC / "apple-touch-icon.png")
    print("wrote", PUBLIC / "og-image.png")
